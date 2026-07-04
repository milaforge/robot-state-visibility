import time
from typing import Any

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def receive_matching(
    websocket: Any,
    expected: dict[str, Any],
    *,
    max_messages: int = 40,
) -> dict[str, Any]:
    received: list[dict[str, Any]] = []

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


def test_initial_connection_and_idle_telemetry() -> None:
    with client.websocket_connect("/ws") as websocket:
        assert websocket.receive_json() == {
            "type": "connection_status",
            "status": "live",
        }

        first = websocket.receive_json()
        second = websocket.receive_json()

    assert first["type"] == "robot_state"
    assert second["type"] == "robot_state"

    assert first["actualPose"]["x"] == 0
    assert second["actualPose"]["x"] == 0
    assert second["sequence"] == first["sequence"] + 1


def test_move_exposes_commanded_and_observed_state() -> None:
    with client.websocket_connect("/ws") as websocket:
        websocket.receive_json()
        websocket.receive_json()

        websocket.send_json(
            {
                "type": "command",
                "command": "move_forward",
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

        saw_tracking_difference = False
        final_state: dict[str, Any] | None = None

        while True:
            message = websocket.receive_json()

            if message["type"] == "robot_state":
                final_state = message

                commanded = message["commandedPose"]["x"]
                observed = message["actualPose"]["x"]

                if commanded > observed:
                    saw_tracking_difference = True

            if (
                message["type"] == "command_status"
                and message["status"] == "completed"
            ):
                break

    assert saw_tracking_difference
    assert final_state is not None
    assert final_state["commandedPose"]["x"] == 1
    assert final_state["actualPose"]["x"] == 1


def test_telemetry_delay_produces_stale_state_and_recovers() -> None:
    with client.websocket_connect("/ws") as websocket:
        websocket.receive_json()
        websocket.receive_json()

        websocket.send_json(
            {
                "type": "set_fault",
                "fault": "telemetry_delay",
            }
        )

        receive_matching(
            websocket,
            {
                "type": "fault_status",
                "fault": "telemetry_delay",
                "enabled": True,
            },
        )

        delayed = receive_matching(
            websocket,
            {
                "type": "robot_state",
            },
        )

        assert (
            int(time.time() * 1000) - delayed["observedAtMs"]
            >= 1000
        )

        websocket.send_json({"type": "clear_fault"})

        receive_matching(
            websocket,
            {
                "type": "fault_status",
                "fault": "telemetry_delay",
                "enabled": False,
            },
        )

        recovered = receive_matching(
            websocket,
            {
                "type": "robot_state",
            },
        )

        assert (
            int(time.time() * 1000) - recovered["observedAtMs"]
            < 250
        )


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

        assert "did not complete" in failed["message"]


def test_emergency_stop_interrupts_active_movement() -> None:
    with client.websocket_connect("/ws") as websocket:
        websocket.receive_json()
        websocket.receive_json()

        websocket.send_json(
            {
                "type": "command",
                "command": "move_forward",
            }
        )

        receive_matching(
            websocket,
            {
                "type": "command_status",
                "status": "executing",
            },
        )

        while True:
            moving = websocket.receive_json()

            if moving["type"] != "robot_state":
                continue

            observed_x = moving["actualPose"]["x"]

            if 0 < observed_x < 1:
                break

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

        aborted = receive_matching(
            websocket,
            {
                "type": "command_status",
                "status": "aborted",
            },
        )

        assert "emergency stop" in aborted["message"]

        stopped = receive_matching(
            websocket,
            {
                "type": "robot_state",
                "mode": "emergency_stopped",
            },
        )

        stopped_x = stopped["actualPose"]["x"]

        assert 0 < stopped_x < 1
        assert stopped["commandedPose"]["x"] == stopped_x

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

        receive_matching(
            websocket,
            {
                "type": "command_status",
                "status": "rejected",
            },
        )

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
