from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_websocket_reports_live_connection() -> None:
    with client.websocket_connect("/ws") as websocket:
        message = websocket.receive_json()

    assert message == {
        "type": "connection_status",
        "status": "live",
    }
