from enum import StrEnum


class Command(StrEnum):
    EMERGENCY_STOP = "emergency_stop"
    MOVE_FORWARD = "move_forward"
    RESET = "reset"
    ROTATE_RIGHT = "rotate_right"


class CommandStatus(StrEnum):
    ACKNOWLEDGED = "acknowledged"
    ABORTED = "aborted"
    COMPLETED = "completed"
    EXECUTING = "executing"
    FAILED = "failed"
    REJECTED = "rejected"


class Fault(StrEnum):
    LOST_COMPLETION_AFTER_EXECUTION = "lost_completion_after_execution"
    ROTATION_FAILURE = "rotation_failure"
    TELEMETRY_DELAY = "telemetry_delay"


class MessageType(StrEnum):
    COMMAND = "command"
    COMMAND_RECONCILIATION = "command_reconciliation"
    COMMAND_STATUS = "command_status"
    CONNECTION_STATUS = "connection_status"
    CLEAR_FAULT = "clear_fault"
    ERROR = "error"
    FAULT_STATUS = "fault_status"
    ROBOT_STATE = "robot_state"
    SESSION_STARTED = "session_started"
    SET_FAULT = "set_fault"


class RobotMode(StrEnum):
    EMERGENCY_STOPPED = "emergency_stopped"
    IDLE = "idle"


SUPPORTED_FAULTS = {fault.value for fault in Fault}
