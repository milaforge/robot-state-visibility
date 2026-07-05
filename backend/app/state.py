import time
from dataclasses import dataclass, field
from typing import Any

from app.protocol import MessageType, RobotMode

Message = dict[str, Any]


@dataclass
class Pose:
    x: float = 0.0
    y: float = 0.0
    heading: float = 0.0

    def to_message(self) -> Message:
        return {
            "x": self.x,
            "y": self.y,
            "heading": self.heading,
        }


@dataclass
class RobotState:
    commanded_pose: Pose = field(default_factory=Pose)
    actual_pose: Pose = field(default_factory=Pose)
    sequence: int = 0
    mode: RobotMode = RobotMode.IDLE

    def create_message(self) -> Message:
        self.sequence += 1

        return {
            "type": MessageType.ROBOT_STATE,
            "sequence": self.sequence,
            "observedAtMs": int(time.time() * 1000),
            "mode": self.mode,
            "commandedPose": self.commanded_pose.to_message(),
            "actualPose": self.actual_pose.to_message(),
        }

    def sync_commanded_to_actual(self) -> None:
        self.commanded_pose.x = self.actual_pose.x
        self.commanded_pose.y = self.actual_pose.y
        self.commanded_pose.heading = self.actual_pose.heading
