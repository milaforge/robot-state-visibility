from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

def receive_matching(
    websocket,
    expected: dict,
    *,
    max_messages: int = 10,
) -> dict:
    received: list[dict] = []

    for _ in range(max_messages):
        message = websocket.receive_json()
        received.append(message)

        if all(
            message.get(key) == value
            for key, value in expected.items()
        ):
            return message

    raise AssertionError(
        f"Expected message not received: {expected}\n"
        f"Received: {received}"
    )

def assert_robot_state(
    message: dict,
    commanded_x: int,
    actual_x: int,
) -> None:
    assert message["mode"] in {"idle", "emergency_stopped"}
    assert message["type"] == "robot_state"
    assert isinstance(message["sequence"], int)
    assert isinstance(message["observedAtMs"], int)
    assert message["commandedPose"] == {
        "x": commanded_x,
        "y": 0,
        "heading": 0,
    }
    assert message["actualPose"] == {
        "x": actual_x,
        "y": 0,
        "heading": 0,
    }

def test_idle_robot_continues_publishing_telemetry() -> None:
    with client.websocket_connect("/ws") as websocket:
        websocket.receive_json()

        first = websocket.receive_json()
        second = websocket.receive_json()

    assert_robot_state(first, 0, 0)
    assert_robot_state(second, 0, 0)

    assert second["sequence"] == first["sequence"] + 1
    assert second["observedAtMs"] >= first["observedAtMs"]

def test_move_command_separates_commanded_and_observed_state() -> None:
    with client.websocket_connect("/ws") as websocket:
        assert websocket.receive_json() == {
            "type": "connection_status",
            "status": "live",
        }

        assert_robot_state(websocket.receive_json(), 0, 0)

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

        assert_robot_state(websocket.receive_json(), 1, 0)
        assert_robot_state(websocket.receive_json(), 1, 1)

        assert websocket.receive_json() == {
            "type": "command_status",
            "status": "completed",
        }

def test_websocket_reports_live_connection() -> None:
    with client.websocket_connect("/ws") as websocket:
        assert websocket.receive_json() == {
            "type": "connection_status",
            "status": "live",
        }

        message = websocket.receive_json()
        assert message["type"] == "robot_state"
        assert isinstance(message["observedAtMs"], int)
        assert message["observedAtMs"] > 0
        assert message["commandedPose"] == {
            "x": 0,
            "y": 0,
            "heading": 0,
        }
        assert message["actualPose"] == {
            "x": 0,
            "y": 0,
            "heading": 0,
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

        message = websocket.receive_json()
        assert message["type"] == "robot_state"
        assert isinstance(message["observedAtMs"], int)
        assert message["observedAtMs"] > 0
        assert message["commandedPose"] == {
            "x": 1,
            "y": 0,
            "heading": 0,
        }
        assert message["actualPose"] == {
            "x": 0,
            "y": 0,
            "heading": 0,
        }
        
        message = websocket.receive_json()
        assert message["type"] == "robot_state"
        assert isinstance(message["observedAtMs"], int)
        assert message["observedAtMs"] > 0
        assert message["commandedPose"] == {
            "x": 1,
            "y": 0,
            "heading": 0,
        }
        assert message["actualPose"] == {
            "x": 1,
            "y": 0,
            "heading": 0,
        }
        
        assert websocket.receive_json() == {
            "type": "command_status",
            "status": "completed",
        }

def test_telemetry_delay_produces_stale_state_and_recovers() -> None:
    import time

    with client.websocket_connect("/ws") as websocket:
        websocket.receive_json()
        websocket.receive_json()

        websocket.send_json(
            {
                "type": "set_fault",
                "fault": "telemetry_delay",
            }
        )

        assert websocket.receive_json() == {
            "type": "fault_status",
            "fault": "telemetry_delay",
            "enabled": True,
        }

        delayed = websocket.receive_json()

        assert delayed["type"] == "robot_state"
        assert int(time.time() * 1000) - delayed["observedAtMs"] >= 1000

        websocket.send_json({"type": "clear_fault"})

        assert websocket.receive_json() == {
            "type": "fault_status",
            "fault": "telemetry_delay",
            "enabled": False,
        }

        recovered = websocket.receive_json()

        assert recovered["type"] == "robot_state"
        assert int(time.time() * 1000) - recovered["observedAtMs"] < 250

def test_interaction_can_fail_after_acknowledgement() -> None:
    with client.websocket_connect("/ws") as websocket:
        websocket.receive_json()
        websocket.receive_json()

        websocket.send_json(
            {
                "type": "set_fault",
                "fault": "interaction_failure",
            }
        )

        receive_matching(
            websocket,
            {
                "type": "fault_status",
                "fault": "interaction_failure",
                "enabled": True,
            },
        )

        websocket.send_json(
            {
                "type": "command",
                "command": "interact",
            }
        )

        receive_matching(
            websocket,
            {
                "type": "command_status",
                "status": "acknowledged",
            },
        )

        receive_matching(
            websocket,
            {
                "type": "command_status",
                "status": "executing",
            },
        )

        failed = receive_matching(
            websocket,
            {
                "type": "command_status",
                "status": "failed",
            },
        )

        assert failed["message"] == (
            "Interaction did not complete. "
            "Robot state is unchanged. "
            "Clear the fault and retry."
        )

def test_emergency_stop_rejects_normal_commands_until_reset() -> None:
    with client.websocket_connect("/ws") as websocket:
        websocket.receive_json()
        websocket.receive_json()

        websocket.send_json(
            {
                "type": "command",
                "command": "emergency_stop",
            }
        )

        receive_matching(
            websocket,
            {
                "type": "command_status",
                "status": "acknowledged",
            },
        )

        stopped_state = receive_matching(
            websocket,
            {
                "type": "robot_state",
                "mode": "emergency_stopped",
            },
        )

        assert stopped_state["commandedPose"] == stopped_state["actualPose"]

        receive_matching(
            websocket,
            {
                "type": "command_status",
                "status": "completed",
            },
        )

        websocket.send_json(
            {
                "type": "command",
                "command": "move_forward",
            }
        )

        rejected = receive_matching(
            websocket,
            {
                "type": "command_status",
                "status": "rejected",
            },
        )

        assert "emergency stop is active" in rejected["message"]

        websocket.send_json(
            {
                "type": "command",
                "command": "reset",
            }
        )

        receive_matching(
            websocket,
            {
                "type": "robot_state",
                "mode": "idle",
            },
        )
