import asyncio
import math
import threading
from collections.abc import Awaitable, Callable, Coroutine
from contextlib import suppress
from dataclasses import dataclass
from typing import Any

from fastapi import WebSocket, WebSocketDisconnect
from starlette.websockets import WebSocketState

from app.protocol import (
    SUPPORTED_FAULTS,
    Command,
    CommandStatus,
    Fault,
    MessageType,
    RobotMode,
)
from app.simulation import RobotMotion, SimulationConfig
from app.state import Message, RobotState

SendMessage = Callable[[Message], Awaitable[None]]

UNKNOWN_RECONCILIATION_DELAY_SECONDS = 1.0


@dataclass
class CommandRecord:
    command_id: str
    command: Command
    original_session_epoch: int
    status: CommandStatus
    final_result: CommandStatus | None = None
    execution_started: bool = False
    completion_reconciled: bool = False
    stale_completion_queued: bool = False


@dataclass
class QueuedEvent:
    message: Message
    reconciliation: Message


class RobotSimulator:
    """Process-local robot state and command ledger.

    This demo intentionally keeps the ledger in memory. Restarting the backend process resets
    command history and robot state.
    """

    def __init__(self, config: SimulationConfig | None = None) -> None:
        self._config = config or SimulationConfig()
        self._state = RobotState()
        self._active_fault: Fault | None = None
        self._fault_generation = 0
        self._active_command_task: asyncio.Task[None] | None = None
        self._ledger: dict[str, CommandRecord] = {}
        self._session_epoch = 0
        self._send: SendMessage | None = None
        self._current_epoch: int | None = None
        self._loop: asyncio.AbstractEventLoop | None = None
        self._queued_events: list[QueuedEvent] = []
        self._active_status_command_id: str | None = None
        self._lock = asyncio.Lock()
        self._motion = self._create_motion()

    async def start_session(self, send: SendMessage) -> int:
        async with self._lock:
            self._session_epoch += 1
            epoch = self._session_epoch
            self._send = send
            self._current_epoch = epoch
            self._loop = asyncio.get_running_loop()

        await self._send_message({"type": MessageType.SESSION_STARTED})
        await self._send_message({"type": MessageType.CONNECTION_STATUS, "status": "live"})
        await self._send_robot_state()

        if self._send is not None:
            queued = self._consume_queued_events()
            if queued:
                asyncio.create_task(self._deliver_queued_events(queued))

        return epoch

    async def end_session(self, epoch: int) -> None:
        async with self._lock:
            if self._current_epoch == epoch:
                self._send = None
                self._current_epoch = None

    async def handle_message(self, message: Message, session_epoch: int) -> None:
        message_type = message.get("type")

        if message_type == MessageType.SET_FAULT:
            await self._set_fault(message)
            return

        if message_type == MessageType.CLEAR_FAULT:
            await self._clear_fault()
            return

        if message_type != MessageType.COMMAND:
            await self._send_message({"type": MessageType.ERROR, "message": "Unsupported message"})
            return

        await self._handle_command(message, session_epoch)

    async def publish_telemetry(self, stop: asyncio.Event) -> None:
        while not stop.is_set():
            await asyncio.sleep(self._config.telemetry_interval_seconds)
            generation = self._fault_generation
            message = self._state.create_message()

            if self._active_fault == Fault.TELEMETRY_DELAY:
                await asyncio.sleep(self._config.telemetry_delay_seconds)
                if generation != self._fault_generation:
                    continue

            await self._send_message(message)

    async def wait_for_active_command(self) -> None:
        task = self._active_command_task
        if task is not None:
            with suppress(asyncio.CancelledError):
                await task

    def reset_for_tests(self) -> None:
        self._state = RobotState()
        self._active_fault = None
        self._fault_generation = 0
        self._active_command_task = None
        self._ledger = {}
        self._session_epoch = 0
        self._send = None
        self._current_epoch = None
        self._loop = None
        self._queued_events = []
        self._active_status_command_id = None
        self._motion = self._create_motion()

    async def _set_fault(self, message: Message) -> None:
        fault = message.get("fault")
        if fault not in SUPPORTED_FAULTS:
            await self._send_message({"type": MessageType.ERROR, "message": "Unsupported fault"})
            return

        self._active_fault = Fault(fault)
        self._fault_generation += 1
        await self._send_message(
            {"type": MessageType.FAULT_STATUS, "fault": fault, "enabled": True}
        )

    async def _clear_fault(self) -> None:
        if self._active_fault is None:
            await self._send_message({"type": MessageType.ERROR, "message": "No active fault"})
            return

        cleared_fault = self._active_fault
        self._active_fault = None
        self._fault_generation += 1
        await self._send_message(
            {"type": MessageType.FAULT_STATUS, "fault": cleared_fault, "enabled": False}
        )
        await self._send_robot_state()

    async def _handle_command(self, message: Message, session_epoch: int) -> None:
        command_id = message.get("commandId")
        command = message.get("command")

        if not isinstance(command_id, str) or command_id == "":
            await self._send_command_status(
                CommandStatus.REJECTED,
                "Command rejected because commandId is required.",
            )
            return

        if command_id in self._ledger:
            await self._send_existing_command(self._ledger[command_id])
            return

        if command not in {item.value for item in Command}:
            await self._send_command_status(
                CommandStatus.REJECTED,
                "Unsupported command.",
                command_id=command_id,
            )
            return

        parsed_command = Command(command)
        record = CommandRecord(
            command_id=command_id,
            command=parsed_command,
            original_session_epoch=session_epoch,
            status=CommandStatus.ACKNOWLEDGED,
        )
        self._ledger[command_id] = record

        if parsed_command == Command.EMERGENCY_STOP:
            await self._emergency_stop(record)
            return

        if parsed_command == Command.RESET:
            await self._reset(record)
            return

        if self._state.mode == RobotMode.EMERGENCY_STOPPED:
            await self._finish_rejected(
                record,
                (
                    "Command rejected while emergency stop is active. "
                    "Reset before issuing normal commands."
                ),
            )
            return

        if self._active_command_task is not None and not self._active_command_task.done():
            await self._finish_rejected(record, "Another command is currently executing.")
            return

        if parsed_command == Command.MOVE_FORWARD:
            lost_completion_target = None
            if self._active_fault == Fault.LOST_COMPLETION_AFTER_EXECUTION:
                lost_completion_target = self._move_forward_target()

            await self._start_command(record, self._motion.move_forward())
            if self._active_fault == Fault.LOST_COMPLETION_AFTER_EXECUTION:
                self._schedule_authoritative_lost_completion(
                    record,
                    session_epoch,
                    lost_completion_target,
                )
                asyncio.create_task(self._drop_connection_before_completion(record, session_epoch))
            return

        if parsed_command == Command.ROTATE_RIGHT:
            await self._start_command(record, self._motion.rotate_right())
            return

    async def _send_existing_command(self, record: CommandRecord) -> None:
        if record.final_result is not None:
            await self._send_reconciliation(record)
            return

        await self._send_command_status(record.status, command_id=record.command_id)

    async def _start_command(
        self,
        record: CommandRecord,
        command: Coroutine[Any, Any, None],
    ) -> None:
        await self._send_command_status(CommandStatus.ACKNOWLEDGED, command_id=record.command_id)
        record.status = CommandStatus.EXECUTING
        record.execution_started = True
        self._active_status_command_id = record.command_id
        await self._send_command_status(CommandStatus.EXECUTING, command_id=record.command_id)
        self._active_command_task = asyncio.create_task(self._run_active_command(record, command))

    async def _run_active_command(
        self,
        record: CommandRecord,
        command: Coroutine[Any, Any, None],
    ) -> None:
        try:
            await command
            if record.final_result is None:
                record.status = CommandStatus.COMPLETED
                record.final_result = CommandStatus.COMPLETED
        except asyncio.CancelledError:
            record.status = CommandStatus.ABORTED
            record.final_result = CommandStatus.ABORTED
            raise
        finally:
            if self._active_command_task is asyncio.current_task():
                self._active_command_task = None
            if self._active_status_command_id == record.command_id:
                self._active_status_command_id = None

    async def _drop_connection_before_completion(
        self,
        record: CommandRecord,
        session_epoch: int,
    ) -> None:
        await asyncio.sleep(self._config.lost_completion_disconnect_seconds)
        await self._close_current_connection(session_epoch)

        task = self._active_command_task
        if task is not None:
            with suppress(asyncio.CancelledError):
                await task

        self._queue_lost_completion(record, session_epoch)

    def _schedule_authoritative_lost_completion(
        self,
        record: CommandRecord,
        session_epoch: int,
        target: tuple[float, float] | None,
    ) -> None:
        timer = threading.Timer(
            self._config.movement_duration_seconds,
            self._complete_lost_command_from_timer,
            args=(record, session_epoch, target),
        )
        timer.daemon = True
        timer.start()

    def _complete_lost_command_from_timer(
        self,
        record: CommandRecord,
        session_epoch: int,
        target: tuple[float, float] | None,
    ) -> None:
        if target is not None:
            self._state.commanded_pose.x = target[0]
            self._state.commanded_pose.y = target[1]
            self._state.actual_pose.x = target[0]
            self._state.actual_pose.y = target[1]

        self._queue_lost_completion(record, session_epoch)

    def _queue_lost_completion(self, record: CommandRecord, session_epoch: int) -> None:
        if record.stale_completion_queued:
            return

        record.status = CommandStatus.COMPLETED
        record.final_result = CommandStatus.COMPLETED
        record.stale_completion_queued = True
        self._queued_events.append(
            QueuedEvent(
                message={
                    "type": MessageType.COMMAND_STATUS,
                    "status": CommandStatus.COMPLETED,
                    "commandId": record.command_id,
                    "sessionEpoch": session_epoch,
                },
                reconciliation={
                    "type": MessageType.COMMAND_RECONCILIATION,
                    "commandId": record.command_id,
                    "originalSessionEpoch": record.original_session_epoch,
                    "resolvedStatus": CommandStatus.COMPLETED,
                    "reason": (
                        "Authoritative backend state confirms completion after connection loss."
                    ),
                },
            )
        )
        if self._send is not None and self._loop is not None:
            queued = self._consume_queued_events()
            if queued:
                self._loop.call_soon_threadsafe(
                    asyncio.create_task,
                    self._deliver_queued_events(queued),
                )

    def _move_forward_target(self) -> tuple[float, float]:
        start_x = self._state.actual_pose.x
        start_y = self._state.actual_pose.y
        heading_radians = math.radians(self._state.actual_pose.heading)
        return (
            round(start_x + math.sin(heading_radians), 2),
            round(start_y + math.cos(heading_radians), 2),
        )

    async def _close_current_connection(self, session_epoch: int) -> None:
        if self._send is None or self._current_epoch != session_epoch:
            return

        await self._send_message({"type": MessageType.CONNECTION_STATUS, "status": "disconnected"})
        async with self._lock:
            self._send = None
            self._current_epoch = None

    async def _emergency_stop(self, record: CommandRecord) -> None:
        await self._send_command_status(CommandStatus.ACKNOWLEDGED, command_id=record.command_id)
        record.status = CommandStatus.EXECUTING
        record.execution_started = True
        self._state.mode = RobotMode.EMERGENCY_STOPPED
        await self._cancel_active_command()
        self._state.sync_commanded_to_actual()
        await self._send_robot_state()
        await self._complete_record(record)

    async def _reset(self, record: CommandRecord) -> None:
        if self._state.mode != RobotMode.EMERGENCY_STOPPED:
            await self._finish_rejected(record, "Reset is only available after an emergency stop.")
            return

        await self._send_command_status(CommandStatus.ACKNOWLEDGED, command_id=record.command_id)
        record.status = CommandStatus.EXECUTING
        record.execution_started = True
        self._state.mode = RobotMode.IDLE
        await self._send_robot_state()
        await self._complete_record(record)

    async def _finish_rejected(self, record: CommandRecord, message: str) -> None:
        record.status = CommandStatus.REJECTED
        record.final_result = CommandStatus.REJECTED
        await self._send_command_status(
            CommandStatus.REJECTED,
            message,
            command_id=record.command_id,
        )

    async def _complete_record(self, record: CommandRecord) -> None:
        record.status = CommandStatus.COMPLETED
        record.final_result = CommandStatus.COMPLETED
        await self._send_command_status(CommandStatus.COMPLETED, command_id=record.command_id)

    async def _cancel_active_command(self) -> None:
        task = self._active_command_task
        if task is not None and not task.done():
            task.cancel()
            with suppress(asyncio.CancelledError):
                await task

    async def _send_command_status(
        self,
        status: CommandStatus,
        message: str | None = None,
        *,
        command_id: str | None = None,
    ) -> None:
        resolved_command_id = command_id or self._active_status_command_id
        payload: Message = {"type": MessageType.COMMAND_STATUS, "status": status}
        if message is not None:
            payload["message"] = message
        if resolved_command_id is not None:
            payload["commandId"] = resolved_command_id
            self._record_status(resolved_command_id, status)
        await self._send_message(payload)

    async def _send_reconciliation(self, record: CommandRecord) -> None:
        if record.final_result is None:
            return

        record.completion_reconciled = True
        await self._send_message(
            {
                "type": MessageType.COMMAND_RECONCILIATION,
                "commandId": record.command_id,
                "originalSessionEpoch": record.original_session_epoch,
                "resolvedStatus": record.final_result,
                "reason": "Authoritative backend state confirms completion after connection loss.",
            }
        )

    async def _send_robot_state(self) -> None:
        await self._send_message(self._state.create_message())

    async def _send_message(self, message: Message) -> None:
        send = self._send
        epoch = self._current_epoch
        if send is None or epoch is None:
            return

        payload = {**message}
        payload.setdefault("sessionEpoch", epoch)
        await send(payload)

    async def _deliver_queued_events(self, events: list[QueuedEvent]) -> None:
        await asyncio.sleep(self._config.stale_completion_delivery_seconds)
        for event in events:
            send = self._send
            epoch = self._current_epoch
            if send is None or epoch is None:
                return

            await send(event.message)
            await asyncio.sleep(UNKNOWN_RECONCILIATION_DELAY_SECONDS)
            reconciliation = {**event.reconciliation, "sessionEpoch": epoch}
            command_id = reconciliation.get("commandId")
            if isinstance(command_id, str) and command_id in self._ledger:
                self._ledger[command_id].completion_reconciled = True
            await send(reconciliation)

    def _consume_queued_events(self) -> list[QueuedEvent]:
        queued = self._queued_events
        self._queued_events = []
        return queued

    def _record_status(self, command_id: str, status: CommandStatus) -> None:
        record = self._ledger.get(command_id)
        if record is None:
            return

        record.status = status
        if status in {CommandStatus.ABORTED, CommandStatus.COMPLETED, CommandStatus.FAILED}:
            record.final_result = status

    def _create_motion(self) -> RobotMotion:
        return RobotMotion(
            self._state,
            self._send_robot_state,
            self._send_command_status,
            self._get_active_fault,
            self._config,
        )

    def _get_active_fault(self) -> Fault | None:
        return self._active_fault


class RobotSession:
    def __init__(
        self,
        websocket: WebSocket,
        simulator: RobotSimulator,
    ) -> None:
        self._websocket = websocket
        self._simulator = simulator
        self._send_lock = asyncio.Lock()
        self._session_epoch: int | None = None

    async def run(self) -> None:
        await self._websocket.accept()
        self._session_epoch = await self._simulator.start_session(self._send_message)
        stop_telemetry = asyncio.Event()
        telemetry_task = asyncio.create_task(self._simulator.publish_telemetry(stop_telemetry))

        try:
            while True:
                await self._simulator.handle_message(
                    await self._websocket.receive_json(),
                    self._session_epoch,
                )
        except WebSocketDisconnect:
            pass
        finally:
            await self._simulator.wait_for_active_command()
            stop_telemetry.set()
            telemetry_task.cancel()
            with suppress(asyncio.CancelledError, RuntimeError):
                await telemetry_task
            if self._session_epoch is not None:
                await self._simulator.end_session(self._session_epoch)

    async def _send_message(self, message: Message) -> None:
        async with self._send_lock:
            if self._websocket.client_state == WebSocketState.CONNECTED:
                await self._websocket.send_json(message)
            if (
                message.get("type") == MessageType.CONNECTION_STATUS
                and message.get("status") == "disconnected"
            ):
                await self._websocket.close()
