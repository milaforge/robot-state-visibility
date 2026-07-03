from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_websocket_reports_live_connection() -> None:
    with client.websocket_connect("/ws") as websocket:
        assert websocket.receive_json() == {
            "type": "connection_status",
            "status": "live",
        }

        assert websocket.receive_json() == {
            "type": "robot_state",
            "commandedPose": {"x": 0, "y": 0, "heading": 0},
            "actualPose": {"x": 0, "y": 0, "heading": 0},
        }

        websocket.send_json(
            {
                "type": "command",
                "command": "move_forward",
            }
        )

        assert websocket.receive_json() == {
            "type": "command_status",
            "status": "acknowledged",
        }

        assert websocket.receive_json() == {
            "type": "command_status",
            "status": "executing",
        }

        assert websocket.receive_json() == {
            "type": "robot_state",
            "commandedPose": {"x": 1, "y": 0, "heading": 0},
            "actualPose": {"x": 0, "y": 0, "heading": 0},
        }

        assert websocket.receive_json() == {
            "type": "robot_state",
            "commandedPose": {"x": 1, "y": 0, "heading": 0},
            "actualPose": {"x": 1, "y": 0, "heading": 0},
        }

        assert websocket.receive_json() == {
            "type": "command_status",
            "status": "completed",
        }