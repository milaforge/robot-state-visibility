import asyncio
from collections.abc import Coroutine
from contextlib import suppress
from typing import Any

from fastapi import WebSocket, WebSocketDisconnect

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


class RobotSession:
    def __init__(self, websocket: WebSocket, config: SimulationConfig | None = None) -> None:
        self._websocket = websocket
        self._config = config or SimulationConfig()
        self._state = RobotState()
        self._send_lock = asyncio.Lock()
        self._active_fault: Fault | None = None
        self._fault_generation = 0
        self._active_command_task: asyncio.Task[None] | None = None
        self._motion = RobotMotion(
            self._state,
            self._send_robot_state,
            self._send_command_status,
            self._get_active_fault,
            self._config,
        )

    async def run(self) -> None:
        await self._websocket.accept()
        await self._send_message({"type": MessageType.CONNECTION_STATUS, "status": "live"})
        await self._send_robot_state()

        telemetry_task = asyncio.create_task(self._publish_telemetry())

        try:
            while True:
                await self._handle_message(await self._websocket.receive_json())
        except WebSocketDisconnect:
            pass
        finally:
            await self._cancel_tasks(telemetry_task)

    async def _send_message(self, message: Message) -> None:
        async with self._send_lock:
            await self._websocket.send_json(message)

    async def _send_command_status(
        self,
        status: CommandStatus,
        message: str | None = None,
    ) -> None:
        payload: Message = {"type": MessageType.COMMAND_STATUS, "status": status}
        if message is not None:
            payload["message"] = message
        await self._send_message(payload)

    async def _send_robot_state(self) -> None:
        await self._send_message(self._state.create_message())

    async def _publish_telemetry(self) -> None:
        while True:
            await asyncio.sleep(self._config.telemetry_interval_seconds)
            generation = self._fault_generation
            message = self._state.create_message()

            if self._active_fault == Fault.TELEMETRY_DELAY:
                await asyncio.sleep(self._config.telemetry_delay_seconds)
                if generation != self._fault_generation:
                    continue

            await self._send_message(message)

    async def _handle_message(self, message: Message) -> None:
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

        await self._handle_command(message.get("command"))

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

    async def _handle_command(self, command: object) -> None:
        if command == Command.EMERGENCY_STOP:
            await self._emergency_stop()
            return

        if command == Command.RESET:
            await self._reset()
            return

        if self._state.mode == RobotMode.EMERGENCY_STOPPED:
            await self._send_command_status(
                CommandStatus.REJECTED,
                (
                    "Command rejected while emergency stop is active. "
                    "Reset before issuing normal commands."
                ),
            )
            return

        if self._active_command_task is not None and not self._active_command_task.done():
            await self._send_command_status(
                CommandStatus.REJECTED,
                "Another command is currently executing.",
            )
            return

        if command == Command.MOVE_FORWARD:
            await self._start_command(self._motion.move_forward())
            return

        if command == Command.ROTATE_RIGHT:
            await self._start_command(self._motion.rotate_right())
            return

        await self._send_command_status(CommandStatus.REJECTED, "Unsupported command.")

    async def _start_command(self, command: Coroutine[Any, Any, None]) -> None:
        await self._send_command_status(CommandStatus.ACKNOWLEDGED)
        await self._send_command_status(CommandStatus.EXECUTING)
        self._active_command_task = asyncio.create_task(self._run_active_command(command))

    async def _run_active_command(self, command: Coroutine[Any, Any, None]) -> None:
        try:
            await command
        finally:
            if self._active_command_task is asyncio.current_task():
                self._active_command_task = None

    async def _emergency_stop(self) -> None:
        await self._send_command_status(CommandStatus.ACKNOWLEDGED)
        self._state.mode = RobotMode.EMERGENCY_STOPPED
        await self._cancel_active_command()
        self._state.sync_commanded_to_actual()
        await self._send_robot_state()
        await self._send_command_status(CommandStatus.COMPLETED)

    async def _reset(self) -> None:
        if self._state.mode != RobotMode.EMERGENCY_STOPPED:
            await self._send_command_status(
                CommandStatus.REJECTED,
                "Reset is only available after an emergency stop.",
            )
            return

        self._state.mode = RobotMode.IDLE
        await self._send_command_status(CommandStatus.ACKNOWLEDGED)
        await self._send_robot_state()
        await self._send_command_status(CommandStatus.COMPLETED)

    async def _cancel_active_command(self) -> None:
        task = self._active_command_task
        if task is not None and not task.done():
            task.cancel()
            with suppress(asyncio.CancelledError):
                await task

    async def _cancel_tasks(self, telemetry_task: asyncio.Task[None]) -> None:
        telemetry_task.cancel()
        tasks = [telemetry_task]

        if self._active_command_task is not None:
            self._active_command_task.cancel()
            tasks.append(self._active_command_task)

        for task in tasks:
            with suppress(asyncio.CancelledError, RuntimeError):
                await task

    def _get_active_fault(self) -> Fault | None:
        return self._active_fault
