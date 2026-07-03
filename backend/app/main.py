from fastapi import FastAPI, WebSocket, WebSocketDisconnect

app = FastAPI()

@app.get("/api/health")
def health() -> dict[str, str]:
    return { "status" : "ok" }

@app.websocket("/ws")
async def robot_socket(websocket: WebSocket) -> None:
    await websocket.accept()

    await websocket.send_json(
        {
            "type": "connection_status",
            "status": "live",
        }
    )

    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass