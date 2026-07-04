import type { RobotState } from './useRobotSocket'

type RobotViewProps = {
  robotState: RobotState | null
}

const SCALE = 8
const ORIGIN_X = 10
const CENTER_Y = 20

function toScreenX(x: number) {
  return ORIGIN_X + x * SCALE
}

export default function RobotView({
  robotState,
}: RobotViewProps) {
  const commandedX = toScreenX(
    robotState?.commandedPose.x ?? 0,
  )

  const observedX = toScreenX(
    robotState?.actualPose.x ?? 0,
  )

  return (
    <div className="robot-view">
      <svg
        viewBox="0 0 100 40"
        role="img"
        aria-label="Commanded and observed robot positions"
      >
        <defs>
          <pattern
            id="grid"
            width="5"
            height="5"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 5 0 L 0 0 0 5"
              className="robot-grid-line"
            />
          </pattern>
        </defs>

        <rect
          className="robot-workcell"
          x="2"
          y="4"
          width="96"
          height="32"
          rx="2"
        />

        <rect
          x="2"
          y="4"
          width="96"
          height="32"
          rx="2"
          fill="url(#grid)"
        />

        <line
          className="robot-track"
          x1="7"
          y1={CENTER_Y}
          x2="93"
          y2={CENTER_Y}
        />

        <circle
          data-testid="commanded-robot"
          aria-label="Commanded robot position"
          className="robot-commanded"
          cx={commandedX}
          cy={CENTER_Y}
          r="5"
        />

        <circle
          data-testid="observed-robot"
          aria-label="Observed robot position"
          className="robot-observed"
          cx={observedX}
          cy={CENTER_Y}
          r="4"
        />

        <circle
          className="robot-observed-center"
          cx={observedX}
          cy={CENTER_Y}
          r="1.4"
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
      </div>
    </div>
  )
}
