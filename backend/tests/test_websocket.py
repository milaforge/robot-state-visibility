import time
from collections.abc import Callable
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.main import app, simulator

client = TestClient(app)


@pytest.fixture(autouse=True)
def reset_simulator() -> None:
    simulator.reset_for_tests()


def receive_startup(websocket: Any) -> int:
    started = websocket.receive_json()
    assert started["type"] == "session_started"
    assert isinstance(started["sessionEpoch"], int)

    assert websocket.receive_json() == {
        "type": "connection_status",
        "status": "live",
        "sessionEpoch": started["sessionEpoch"],
    }

    return started["sessionEpoch"]


def command_message(command: str, command_id: str) -> dict[str, Any]:
    return {
        "type": "command",
        "commandId": command_id,
        "command": command,
    }


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

        if all(message.get(key) == value for key, value in expected.items()):
            return message

    raise AssertionError(f"Expected message not received: {expected}\nReceived: {received}")


def receive_robot_state_matching(
    websocket: Any,
    predicate: Callable[[dict[str, Any]], bool],
    *,
    max_messages: int = 40,
) -> dict[str, Any]:
    received: list[dict[str, Any]] = []

    for _ in range(max_messages):
        message = websocket.receive_json()
        received.append(message)

        if message["type"] == "robot_state" and predicate(message):
            return message

    raise AssertionError(f"Expected robot state not received. Received: {received}")


def receive_until_command_status(
    websocket: Any,
    status: str,
    *,
    max_messages: int = 80,
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    received: list[dict[str, Any]] = []
    robot_states: list[dict[str, Any]] = []

    for _ in range(max_messages):
        message = websocket.receive_json()
        received.append(message)

        if message["type"] == "robot_state":
            robot_states.append(message)

        if message["type"] == "command_status" and message["status"] == status:
            return message, robot_states

    raise AssertionError(f"Expected command status not received: {status}\nReceived: {received}")


def test_initial_connection_and_idle_telemetry() -> None:
    with client.websocket_connect("/ws") as websocket:
        epoch = receive_startup(websocket)

        first = websocket.receive_json()
        second = websocket.receive_json()

    assert first["type"] == "robot_state"
    assert second["type"] == "robot_state"
    assert first["sessionEpoch"] == epoch
    assert second["sessionEpoch"] == epoch

    assert first["actualPose"]["x"] == 0
    assert second["actualPose"]["x"] == 0
    assert second["sequence"] == first["sequence"] + 1


def test_move_exposes_commanded_and_observed_state() -> None:
    with client.websocket_connect("/ws") as websocket:
        receive_startup(websocket)

        websocket.send_json(command_message("move_forward", "move-1"))

        receive_matching(
            websocket,
            {
                "type": "command_status",
                "status": "executing",
            },
        )

        _, states = receive_until_command_status(websocket, "completed")

    final_state = states[-1] if states else None
    saw_tracking_difference = any(
        state["commandedPose"]["x"] != state["actualPose"]["x"]
        or state["commandedPose"]["y"] != state["actualPose"]["y"]
        for state in states
    )
    assert saw_tracking_difference
    assert final_state is not None
    assert final_state["actualPose"]["x"] == 0
    assert final_state["actualPose"]["y"] == 1


def test_telemetry_delay_produces_stale_state_and_recovers() -> None:
    with client.websocket_connect("/ws") as websocket:
        receive_startup(websocket)

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

        assert int(time.time() * 1000) - delayed["observedAtMs"] >= 1000

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

        assert int(time.time() * 1000) - recovered["observedAtMs"] < 250


def test_interaction_can_fail_after_acknowledgement() -> None:
    with client.websocket_connect("/ws") as websocket:
        receive_startup(websocket)

        websocket.send_json(
            {
                "type": "set_fault",
                "fault": "rotation_failure",
            }
        )

        receive_matching(
            websocket,
            {
                "type": "fault_status",
                "fault": "rotation_failure",
                "enabled": True,
            },
        )

        websocket.send_json(command_message("rotate_right", "rotate-1"))

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
        receive_startup(websocket)

        websocket.send_json(command_message("move_forward", "move-1"))

        receive_matching(
            websocket,
            {
                "type": "command_status",
                "status": "executing",
            },
        )

        receive_robot_state_matching(
            websocket,
            lambda state: 0 < state["actualPose"]["y"] < 1,
        )

        websocket.send_json(command_message("emergency_stop", "stop-1"))

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

        stopped_y = stopped["actualPose"]["y"]

        assert 0 < stopped_y < 1
        assert stopped["commandedPose"]["y"] == stopped_y

        receive_matching(
            websocket,
            {
                "type": "command_status",
                "status": "completed",
            },
        )

        websocket.send_json(command_message("move_forward", "move-2"))

        receive_matching(
            websocket,
            {
                "type": "command_status",
                "status": "rejected",
            },
        )

        websocket.send_json(command_message("reset", "reset-1"))

        receive_matching(
            websocket,
            {
                "type": "robot_state",
                "mode": "idle",
            },
        )


def test_interaction_rotates_robot_ninety_degrees_clockwise() -> None:
    with client.websocket_connect("/ws") as websocket:
        receive_startup(websocket)

        websocket.send_json(command_message("rotate_right", "rotate-1"))

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

        _, states = receive_until_command_status(websocket, "completed")

    final_state = states[-1] if states else None
    saw_commanded_rotation = any(
        state["commandedPose"]["heading"] == 90 and state["actualPose"]["heading"] < 90
        for state in states
    )
    assert saw_commanded_rotation
    assert final_state is not None
    assert final_state["commandedPose"]["heading"] == 90
    assert final_state["actualPose"]["heading"] == 90


def test_move_forward_uses_current_heading() -> None:
    with client.websocket_connect("/ws") as websocket:
        receive_startup(websocket)

        websocket.send_json(command_message("rotate_right", "rotate-1"))

        receive_matching(
            websocket,
            {
                "type": "command_status",
                "status": "completed",
            },
        )

        websocket.send_json(command_message("move_forward", "move-1"))

        _, states = receive_until_command_status(websocket, "completed")

    final_state = states[-1] if states else None
    assert final_state is not None
    assert final_state["actualPose"]["heading"] == 90
    assert final_state["actualPose"]["x"] == 1
    assert final_state["actualPose"]["y"] == 0


def test_lost_completion_after_execution_reconciles_after_reconnect() -> None:
    with client.websocket_connect("/ws") as websocket:
        first_epoch = receive_startup(websocket)

        websocket.send_json(
            {
                "type": "set_fault",
                "fault": "lost_completion_after_execution",
            }
        )

        receive_matching(
            websocket,
            {
                "type": "fault_status",
                "fault": "lost_completion_after_execution",
                "enabled": True,
            },
        )

        websocket.send_json(command_message("move_forward", "move-lost-1"))

        receive_matching(
            websocket,
            {
                "type": "command_status",
                "status": "acknowledged",
                "commandId": "move-lost-1",
            },
        )
        receive_matching(
            websocket,
            {
                "type": "command_status",
                "status": "executing",
                "commandId": "move-lost-1",
            },
        )

        receive_matching(
            websocket,
            {
                "type": "connection_status",
                "status": "disconnected",
                "sessionEpoch": first_epoch,
            },
        )

    with client.websocket_connect("/ws") as websocket:
        next_epoch = receive_startup(websocket)
        assert next_epoch == first_epoch + 1

        stale = receive_matching(
            websocket,
            {
                "type": "command_status",
                "status": "completed",
                "commandId": "move-lost-1",
                "sessionEpoch": first_epoch,
            },
            max_messages=80,
        )
        assert stale["sessionEpoch"] < next_epoch

        reconciliation = receive_matching(
            websocket,
            {
                "type": "command_reconciliation",
                "commandId": "move-lost-1",
                "sessionEpoch": next_epoch,
                "originalSessionEpoch": first_epoch,
                "resolvedStatus": "completed",
            },
            max_messages=80,
        )
        assert "Authoritative backend state" in reconciliation["reason"]

        final_state = receive_robot_state_matching(
            websocket,
            lambda state: state["actualPose"]["x"] == 0 and state["actualPose"]["y"] == 1,
        )
        assert final_state["commandedPose"]["y"] == 1


def test_duplicate_command_id_does_not_execute_movement_twice() -> None:
    with client.websocket_connect("/ws") as websocket:
        receive_startup(websocket)

        websocket.send_json(command_message("move_forward", "move-once"))
        receive_until_command_status(websocket, "completed")

        websocket.send_json(command_message("move_forward", "move-once"))

        receive_matching(
            websocket,
            {
                "type": "command_reconciliation",
                "commandId": "move-once",
                "resolvedStatus": "completed",
            },
        )

        state = receive_robot_state_matching(
            websocket,
            lambda message: message["actualPose"]["y"] == 1,
        )
        assert state["actualPose"]["x"] == 0
        assert state["actualPose"]["y"] == 1
