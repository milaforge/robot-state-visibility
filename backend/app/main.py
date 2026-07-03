import asyncio

from fastapi import FastAPI, WebSocket, WebSocketDisconnect

app = FastAPI()


@app.get("/api/health")
def health() -> dict[str, str]:
    return { "status" : "ok" }


@app.websocket("/ws")
async def robot_socket(websocket: WebSocket) -> None:
    await websocket.accept()
    
    
    commanded_x = 0
    actual_x = 0
    
    async def send_robot_state() -> None:
        await websocket.send_json(
            {
                "type": "robot_state",
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
        )

    await websocket.send_json(
        {
            "type": "connection_status",
            "status": "live",
        }
    )
    await send_robot_state()
    
    try:
        while True:
            
            message = await websocket.receive_json()

            if (
                message.get("type") != "command"
                or message.get("command") != "move_forward"
            ):
                await websocket.send_json(
                    {
                        "type": "error",
                        "message": "Unsupported command",
                    }
                )
                continue
            
            await websocket.send_json(
                {
                    "type": "command_status",
                    "status": "acknowledged",
                }
            )
            
            commanded_x += 1
            
            await websocket.send_json(
                {
                    "type": "command_status",
                    "status": "executing",
                }
            )
            
            await send_robot_state()
            
            await asyncio.sleep(0.2)
            
            actual_x = commanded_x
            await send_robot_state()
            
            await websocket.send_json(
                {
                    "type": "command_status",
                    "status": "completed",
                }
            )            
            
    except WebSocketDisconnect:
        pass