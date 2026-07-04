import type { RobotState } from './useRobotSocket'

type RobotViewProps = {
  robotState: RobotState | null
}

const ROBOT_X = 50
const CENTER_Y = 21
const POSITION_SCALE = 12
const GRID_SIZE = 12

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum)
}

export default function RobotView({
  robotState,
}: RobotViewProps) {
  const actualX = robotState?.actualPose.x ?? 0
  const commandedX = robotState?.commandedPose.x ?? 0

  const commandedScreenX = clamp(
    ROBOT_X + (commandedX - actualX) * POSITION_SCALE,
    7,
    93,
  )

  const treadmillOffset =
    -((actualX * POSITION_SCALE) % GRID_SIZE)

  return (
    <div className="robot-view">
      <svg
        viewBox="0 0 100 42"
        role="img"
        aria-label="Robot moving over a treadmill-style workcell"
      >
        <defs>
          <pattern
            id="moving-grid"
            width={GRID_SIZE}
            height="8"
            patternUnits="userSpaceOnUse"
            x={treadmillOffset}
          >
            <path
              d={`M ${GRID_SIZE} 0 L 0 0 0 8`}
              className="robot-grid-line"
            />
          </pattern>

          <linearGradient
            id="workcell-fade"
            x1="0"
            x2="1"
          >
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="0.12" stopColor="transparent" />
            <stop offset="0.88" stopColor="transparent" />
            <stop offset="1" stopColor="#ffffff" />
          </linearGradient>
        </defs>

        <rect
          className="robot-workcell"
          x="2"
          y="4"
          width="96"
          height="34"
          rx="3"
        />

        <rect
          data-testid="moving-grid"
          x="2"
          y="4"
          width="96"
          height="34"
          rx="3"
          fill="url(#moving-grid)"
        />

        <line
          className="robot-track"
          x1="4"
          y1={CENTER_Y}
          x2="96"
          y2={CENTER_Y}
        />

        <circle
          data-testid="commanded-robot"
          aria-label="Commanded robot position"
          className="robot-commanded"
          cx={commandedScreenX}
          cy={CENTER_Y}
          r="6"
        />

        <circle
          data-testid="observed-robot"
          aria-label="Observed robot position"
          className="robot-observed"
          cx={ROBOT_X}
          cy={CENTER_Y}
          r="4.5"
        />

        <circle
          className="robot-observed-center"
          cx={ROBOT_X}
          cy={CENTER_Y}
          r="1.5"
        />

        <path
          className="direction-marker"
          d={`M ${ROBOT_X - 2} ${CENTER_Y + 8}
              L ${ROBOT_X + 2} ${CENTER_Y + 8}
              L ${ROBOT_X} ${CENTER_Y + 11}
              Z`}
        />
      </svg>

      <div className="robot-legend">
        <span>
          <i className="legend-marker legend-marker--observed" />
          Observed
        </span>

        <span>
          <i className="legend-marker legend-marker--commanded" />
          Commanded
        </span>

        <span className="world-position">
          World X
          <strong>{actualX.toFixed(1)}</strong>
        </span>
      </div>
    </div>
  )
}
