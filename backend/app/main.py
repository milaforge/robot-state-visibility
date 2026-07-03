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
    telemetry_delay = False
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

            if telemetry_delay:
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
                if message.get("fault") != "telemetry_delay":
                    await send_message(
                        {
                            "type": "error",
                            "message": "Unsupported fault",
                        }
                    )
                    continue

                telemetry_delay = True
                fault_generation += 1

                await send_message(
                    {
                        "type": "fault_status",
                        "fault": "telemetry_delay",
                        "enabled": True,
                    }
                )
                continue

            if message.get("type") == "clear_fault":
                telemetry_delay = False
                fault_generation += 1

                await send_message(
                    {
                        "type": "fault_status",
                        "fault": "telemetry_delay",
                        "enabled": False,
                    }
                )
                await send_robot_state()
                continue

            if (
                message.get("type") != "command"
                or message.get("command") != "move_forward"
            ):
                await send_message(
                    {
                        "type": "error",
                        "message": "Unsupported command",
                    }
                )
                continue

            await send_message(
                {
                    "type": "command_status",
                    "status": "acknowledged",
                }
            )

            commanded_x += 1

            await send_message(
                {
                    "type": "command_status",
                    "status": "executing",
                }
            )
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

    except WebSocketDisconnect:
        pass
    finally:
        telemetry_task.cancel()

        with suppress(asyncio.CancelledError):
            await telemetry_task
