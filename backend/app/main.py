from fastapi import FastAPI, WebSocket

from app.session import RobotSession

app = FastAPI()


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.websocket("/ws")
async def robot_socket(websocket: WebSocket) -> None:
    await RobotSession(websocket).run()
