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
    <section aria-label="Robot visualization">
      <svg
        viewBox="0 0 100 40"
        width="600"
        role="img"
        aria-label="Commanded and observed robot positions"
      >
        <rect
          x="2"
          y="5"
          width="96"
          height="30"
          fill="none"
          stroke="currentColor"
        />

        <circle
          data-testid="commanded-robot"
          aria-label="Commanded robot position"
          cx={commandedX}
          cy={CENTER_Y}
          r="5"
          fill="none"
          stroke="currentColor"
          strokeDasharray="3 2"
        />

        <circle
          data-testid="observed-robot"
          aria-label="Observed robot position"
          cx={observedX}
          cy={CENTER_Y}
          r="4"
          fill="currentColor"
        />
      </svg>

      <p>
        Solid: observed · Dashed: commanded
      </p>
    </section>
  )
}
