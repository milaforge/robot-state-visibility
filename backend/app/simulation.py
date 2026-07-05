import asyncio
import math
from collections.abc import Awaitable, Callable
from dataclasses import dataclass

from app.protocol import CommandStatus, Fault
from app.state import RobotState

SendStatus = Callable[[CommandStatus, str | None], Awaitable[None]]
SendState = Callable[[], Awaitable[None]]
GetFault = Callable[[], Fault | None]
Step = Callable[[float], None]
OnCancel = Callable[[], None]


@dataclass(frozen=True)
class SimulationConfig:
    telemetry_interval_seconds: float = 0.5
    telemetry_delay_seconds: float = 1.2
    movement_duration_seconds: float = 2.0
    movement_steps: int = 10
    rotation_duration_seconds: float = 1.2
    rotation_steps: int = 8
    lost_completion_disconnect_seconds: float = 0.45
    stale_completion_delivery_seconds: float = 0.15


class RobotMotion:
    def __init__(
        self,
        state: RobotState,
        send_state: SendState,
        send_status: SendStatus,
        get_fault: GetFault,
        config: SimulationConfig,
    ) -> None:
        self._state = state
        self._send_state = send_state
        self._send_status = send_status
        self._get_fault = get_fault
        self._config = config

    async def move_forward(self) -> None:
        start_x = self._state.actual_pose.x
        start_y = self._state.actual_pose.y
        heading_radians = math.radians(self._state.actual_pose.heading)
        target_x = round(start_x + math.sin(heading_radians), 2)
        target_y = round(start_y + math.cos(heading_radians), 2)

        self._state.commanded_pose.x = target_x
        self._state.commanded_pose.y = target_y

        await self._run_motion(
            duration_seconds=self._config.movement_duration_seconds,
            steps=self._config.movement_steps,
            apply_step=lambda progress: self._apply_position_step(
                start_x,
                start_y,
                target_x,
                target_y,
                progress,
            ),
            on_cancel=self._sync_commanded_position,
            abort_message="Movement was interrupted by the simulated emergency stop.",
        )

    async def rotate_right(self) -> None:
        start_heading = self._state.actual_pose.heading
        target_heading = start_heading + 90.0
        self._state.commanded_pose.heading = target_heading

        await self._send_state()

        if self._get_fault() == Fault.ROTATION_FAILURE:
            await asyncio.sleep(0.4)
            await self._send_status(
                CommandStatus.FAILED,
                (
                    "Rotation did not complete. "
                    "Observed orientation is unchanged. "
                    "Disable the fault and retry."
                ),
            )
            return

        await self._run_motion(
            duration_seconds=self._config.rotation_duration_seconds,
            steps=self._config.rotation_steps,
            apply_step=lambda progress: self._apply_heading_step(
                start_heading,
                progress,
            ),
            on_cancel=self._sync_commanded_heading,
            abort_message="Rotation was interrupted by the simulated emergency stop.",
            send_initial_state=False,
        )

    async def _run_motion(
        self,
        *,
        duration_seconds: float,
        steps: int,
        apply_step: Step,
        on_cancel: OnCancel,
        abort_message: str,
        send_initial_state: bool = True,
    ) -> None:
        try:
            if send_initial_state:
                await self._send_state()

            step_duration = duration_seconds / steps
            for step in range(1, steps + 1):
                await asyncio.sleep(step_duration)
                apply_step(step / steps)
                await self._send_state()

            await self._send_status(CommandStatus.COMPLETED, None)
        except asyncio.CancelledError:
            on_cancel()
            await self._send_status(CommandStatus.ABORTED, abort_message)
            raise

    def _apply_position_step(
        self,
        start_x: float,
        start_y: float,
        target_x: float,
        target_y: float,
        progress: float,
    ) -> None:
        self._state.actual_pose.x = round(start_x + (target_x - start_x) * progress, 2)
        self._state.actual_pose.y = round(start_y + (target_y - start_y) * progress, 2)

    def _apply_heading_step(self, start_heading: float, progress: float) -> None:
        self._state.actual_pose.heading = round(start_heading + 90.0 * progress, 2)

    def _sync_commanded_position(self) -> None:
        self._state.commanded_pose.x = self._state.actual_pose.x
        self._state.commanded_pose.y = self._state.actual_pose.y

    def _sync_commanded_heading(self) -> None:
        self._state.commanded_pose.heading = self._state.actual_pose.heading
