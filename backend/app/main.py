import asyncio
import math
import time
from contextlib import suppress
from typing import Any

from fastapi import FastAPI, WebSocket, WebSocketDisconnect

app = FastAPI()

TELEMETRY_INTERVAL_SECONDS = 0.5
TELEMETRY_DELAY_SECONDS = 1.2
MOVEMENT_DURATION_SECONDS = 2.0
MOVEMENT_STEPS = 10
ROTATION_DURATION_SECONDS = 1.2
ROTATION_STEPS = 8

Message = dict[str, Any]


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.websocket("/ws")
async def robot_socket(websocket: WebSocket) -> None:
    await websocket.accept()

    commanded_x = 0.0
    commanded_y = 0.0
    actual_x = 0.0
    actual_y = 0.0
    commanded_heading = 0.0
    actual_heading = 0.0
    sequence = 0
    mode = "idle"
    active_fault: str | None = None
    fault_generation = 0
    active_command_task: asyncio.Task[None] | None = None

    send_lock = asyncio.Lock()

    async def send_message(message: Message) -> None:
        async with send_lock:
            await websocket.send_json(message)

    async def send_command_status(
        status: str,
        message: str | None = None,
    ) -> None:
        payload: Message = {
            "type": "command_status",
            "status": status,
        }

        if message is not None:
            payload["message"] = message

        await send_message(payload)

    def create_robot_state() -> Message:
        nonlocal sequence

        sequence += 1

        return {
            "type": "robot_state",
            "sequence": sequence,
            "observedAtMs": int(time.time() * 1000),
            "mode": mode,
            "commandedPose": {
                "x": commanded_x,
                "y": commanded_y,
                "heading": commanded_heading,
            },
            "actualPose": {
                "x": actual_x,
                "y": actual_y,
                "heading": actual_heading,
            },
        }

    async def send_robot_state() -> None:
        await send_message(create_robot_state())

    async def publish_telemetry() -> None:
        while True:
            await asyncio.sleep(TELEMETRY_INTERVAL_SECONDS)

            generation = fault_generation
            message = create_robot_state()

            if active_fault == "telemetry_delay":
                await asyncio.sleep(TELEMETRY_DELAY_SECONDS)

                if generation != fault_generation:
                    continue

            await send_message(message)

    async def execute_move() -> None:
        nonlocal active_command_task
        nonlocal actual_x
        nonlocal actual_y
        nonlocal commanded_x
        nonlocal commanded_y

        start_x = actual_x
        start_y = actual_y

        heading_radians = math.radians(actual_heading)

        delta_x = math.sin(heading_radians)
        delta_y = math.cos(heading_radians)

        target_x = round(start_x + delta_x, 2)
        target_y = round(start_y + delta_y, 2)

        commanded_x = target_x
        commanded_y = target_y

        try:
            await send_robot_state()

            step_duration = (
                MOVEMENT_DURATION_SECONDS / MOVEMENT_STEPS
            )

            for step in range(1, MOVEMENT_STEPS + 1):
                await asyncio.sleep(step_duration)

                progress = step / MOVEMENT_STEPS

                actual_x = round(
                    start_x + (target_x - start_x) * progress,
                    2,
                )

                actual_y = round(
                    start_y + (target_y - start_y) * progress,
                    2,
                )

                await send_robot_state()

            await send_command_status("completed")

        except asyncio.CancelledError:
            commanded_x = actual_x
            commanded_y = actual_y

            await send_command_status(
                "aborted",
                "Movement was interrupted by the simulated emergency stop.",
            )

            raise

        finally:
            if active_command_task is asyncio.current_task():
                active_command_task = None

    async def execute_rotation() -> None:
        nonlocal active_command_task
        nonlocal actual_heading
        nonlocal commanded_heading

        start_heading = actual_heading
        target_heading = start_heading + 90.0
        commanded_heading = target_heading

        try:
            await send_robot_state()

            if active_fault == "rotation_failure":
                await asyncio.sleep(0.4)

                await send_command_status(
                    "failed",
                    (
                        "Rotation did not complete. "
                        "Observed orientation is unchanged. "
                        "Disable the fault and retry."
                    ),
                )
                return

            step_duration = (
                ROTATION_DURATION_SECONDS / ROTATION_STEPS
            )

            for step in range(1, ROTATION_STEPS + 1):
                await asyncio.sleep(step_duration)

                progress = step / ROTATION_STEPS
                actual_heading = round(
                    start_heading + 90.0 * progress,
                    2,
                )

                await send_robot_state()

            await send_command_status("completed")

        except asyncio.CancelledError:
            commanded_heading = actual_heading
            await send_robot_state()

            await send_command_status(
                "aborted",
                "Rotation was interrupted by the simulated emergency stop.",
            )

            raise

        finally:
            if active_command_task is asyncio.current_task():
                active_command_task = None

    await send_message(
        {
            "type": "connection_status",
            "status": "live",
        }
    )
    await send_robot_state()

    telemetry_task = asyncio.create_task(publish_telemetry())

    try:
        while True:
            message = await websocket.receive_json()
            message_type = message.get("type")

            if message_type == "set_fault":
                fault = message.get("fault")

                if fault not in {
                    "telemetry_delay",
                    "rotation_failure",
                }:
                    await send_message(
                        {
                            "type": "error",
                            "message": "Unsupported fault",
                        }
                    )
                    continue

                active_fault = fault
                fault_generation += 1

                await send_message(
                    {
                        "type": "fault_status",
                        "fault": fault,
                        "enabled": True,
                    }
                )
                continue

            if message_type == "clear_fault":
                if active_fault is None:
                    await send_message(
                        {
                            "type": "error",
                            "message": "No active fault",
                        }
                    )
                    continue

                cleared_fault = active_fault
                active_fault = None
                fault_generation += 1

                await send_message(
                    {
                        "type": "fault_status",
                        "fault": cleared_fault,
                        "enabled": False,
                    }
                )
                await send_robot_state()
                continue

            if message_type != "command":
                await send_message(
                    {
                        "type": "error",
                        "message": "Unsupported message",
                    }
                )
                continue

            command = message.get("command")

            if command == "emergency_stop":
                await send_command_status("acknowledged")

                mode = "emergency_stopped"
                task = active_command_task

                if task is not None and not task.done():
                    task.cancel()

                    with suppress(asyncio.CancelledError):
                        await task

                commanded_x = actual_x
                commanded_y = actual_y
                commanded_heading = actual_heading
                await send_robot_state()
                await send_command_status("completed")
                continue

            if command == "reset":
                if mode != "emergency_stopped":
                    await send_command_status(
                        "rejected",
                        "Reset is only available after an emergency stop.",
                    )
                    continue

                mode = "idle"

                await send_command_status("acknowledged")
                await send_robot_state()
                await send_command_status("completed")
                continue

            if mode == "emergency_stopped":
                await send_command_status(
                    "rejected",
                    (
                        "Command rejected while emergency stop is active. "
                        "Reset before issuing normal commands."
                    ),
                )
                continue

            if (
                active_command_task is not None
                and not active_command_task.done()
            ):
                await send_command_status(
                    "rejected",
                    "Another command is currently executing.",
                )
                continue

            if command == "move_forward":
                await send_command_status("acknowledged")
                await send_command_status("executing")

                active_command_task = asyncio.create_task(
                    execute_move()
                )
                continue

            if command == "rotate_right":
                await send_command_status("acknowledged")
                await send_command_status("executing")

                active_command_task = asyncio.create_task(
                    execute_rotation()
                )
                continue

            await send_command_status(
                "rejected",
                "Unsupported command.",
            )

    except WebSocketDisconnect:
        pass

    finally:
        telemetry_task.cancel()

        tasks = [telemetry_task]

        if active_command_task is not None:
            active_command_task.cancel()
            tasks.append(active_command_task)

        for task in tasks:
            with suppress(asyncio.CancelledError, RuntimeError):
                await task
