import asyncio
import time
from contextlib import suppress

from fastapi import FastAPI, WebSocket, WebSocketDisconnect

app = FastAPI()

TELEMETRY_INTERVAL_SECONDS = 0.5
TELEMETRY_DELAY_SECONDS = 1.2


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.websocket("/ws")
async def robot_socket(websocket: WebSocket) -> None:
    await websocket.accept()

    commanded_x = 0
    actual_x = 0
    sequence = 0
    active_fault: str | None = None
    fault_generation = 0

    send_lock = asyncio.Lock()

    async def send_message(message: dict) -> None:
        async with send_lock:
            await websocket.send_json(message)

    def create_robot_state() -> dict:
        nonlocal sequence

        sequence += 1

        return {
            "type": "robot_state",
            "sequence": sequence,
            "observedAtMs": int(time.time() * 1000),
            "commandedPose": {
                "x": commanded_x,
                "y": 0,
                "heading": 0,
            },
            "actualPose": {
                "x": actual_x,
                "y": 0,
                "heading": 0,
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

            if message.get("type") == "set_fault":
                fault = message.get("fault")
                if fault not in {
                    "telemetry_delay",
                    "interaction_failure",
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

            if message.get("type") == "clear_fault":
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

            if (
                message.get("type") != "command"
            ):
                await send_message(
                    {
                        "type": "error",
                        "message": "Unsupported command",
                    }
                )
                continue
            
            command = message.get("command")
            if command not in {"move_forward", "interact"}:
                await send_message(
                    {
                        "type": "command_status",
                        "status": "rejected",
                    }
                )
                continue

            await send_message(
                {
                    "type": "command_status",
                    "status": "acknowledged",
                }
            )

            await send_message(
                {
                    "type": "command_status",
                    "status": "executing",
                }
            )
            
            if command == "move_forward":
                commanded_x += 1
                await send_robot_state()

                await asyncio.sleep(0.2)

                actual_x = commanded_x
                await send_robot_state()

                await send_message(
                    {
                        "type": "command_status",
                        "status": "completed",
                    }
                )
                continue

            elif command == "interact":
                await asyncio.sleep(0.3)

                if active_fault == "interaction_failure":
                    await send_message(
                        {
                            "type": "command_status",
                            "status": "failed",
                            "message": (
                                "Interaction did not complete. "
                                "Robot state is unchanged. "
                                "Clear the fault and retry."
                            ),
                        }
                    )
                else:
                    await send_message(
                        {
                            "type": "command_status",
                            "status": "completed",
                        }
                    )

    except WebSocketDisconnect:
        pass
    finally:
        telemetry_task.cancel()

        with suppress(asyncio.CancelledError):
            await telemetry_task
