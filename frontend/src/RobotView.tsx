import type { CSSProperties } from "react";

import type { RobotState } from "./useRobotSocket";

type RobotViewProps = {
  robotState: RobotState | null;
};

const ROBOT_X = 50;
const ROBOT_Y = 21;
const POSITION_SCALE = 12;
const GRID_SIZE = 12;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

function headingStyle(heading: number, x: number, y: number): CSSProperties {
  return {
    transform: `rotate(${heading}deg)`,
    transformOrigin: `${x}px ${y}px`,
    transformBox: "view-box",
  };
}

export default function RobotView({ robotState }: RobotViewProps) {
  const actualX = robotState?.actualPose.x ?? 0;
  const actualY = robotState?.actualPose.y ?? 0;

  const commandedX = robotState?.commandedPose.x ?? 0;
  const commandedY = robotState?.commandedPose.y ?? 0;

  const actualHeading = robotState?.actualPose.heading ?? 0;
  const commandedHeading = robotState?.commandedPose.heading ?? 0;

  const commandedScreenX = clamp(
    ROBOT_X + (commandedX - actualX) * POSITION_SCALE,
    7,
    93,
  );

  const commandedScreenY = clamp(
    ROBOT_Y - (commandedY - actualY) * POSITION_SCALE,
    7,
    35,
  );

  const treadmillOffsetX = -((actualX * POSITION_SCALE) % GRID_SIZE);

  const treadmillOffsetY = (actualY * POSITION_SCALE) % GRID_SIZE;

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
            height={GRID_SIZE}
            patternUnits="userSpaceOnUse"
            x={treadmillOffsetX}
            y={treadmillOffsetY}
          >
            <path
              d={`M ${GRID_SIZE} 0 L 0 0 0 ${GRID_SIZE}`}
              className="robot-grid-line"
            />
          </pattern>

          <linearGradient id="observed-shell" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="#1f2a44" />
            <stop offset="100%" stopColor="#0f172a" />
          </linearGradient>

          <radialGradient id="observed-gloss" cx="35%" cy="30%" r="70%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.85)" />
            <stop offset="45%" stopColor="rgba(255,255,255,0.22)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </radialGradient>

          <linearGradient id="commanded-shell" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="#8b7cff" />
            <stop offset="100%" stopColor="#5b50e6" />
          </linearGradient>

          <filter
            id="robot-shadow"
            x="-50%"
            y="-50%"
            width="200%"
            height="200%"
          >
            <feDropShadow
              dx="0"
              dy="1.2"
              stdDeviation="1"
              floodColor="#0f172a"
              floodOpacity="0.18"
            />
          </filter>

          <filter
            id="commanded-glow"
            x="-80%"
            y="-80%"
            width="260%"
            height="260%"
          >
            <feDropShadow
              dx="0"
              dy="0"
              stdDeviation="1.2"
              floodColor="#6c5ce7"
              floodOpacity="0.28"
            />
          </filter>
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

        {robotState?.mode === "emergency_stopped" && (
          <>
            <rect
              className="robot-emergency-overlay"
              x="2"
              y="4"
              width="96"
              height="34"
              rx="3"
            />

            <circle
              className="robot-emergency-halo"
              cx={ROBOT_X}
              cy={ROBOT_Y}
              r="8"
            />
          </>
        )}

        <circle
          className="robot-commanded-aura"
          cx={commandedScreenX}
          cy={commandedScreenY}
          r="7.2"
        />

        <circle
          data-testid="commanded-robot"
          aria-label="Commanded robot position"
          className="robot-commanded"
          cx={commandedScreenX}
          cy={commandedScreenY}
          r="6"
        />

        <circle
          className="robot-commanded-inner"
          cx={commandedScreenX}
          cy={commandedScreenY}
          r="4.15"
        />

        <g
          data-testid="commanded-heading"
          className="commanded-heading-indicator"
          style={headingStyle(
            commandedHeading,
            commandedScreenX,
            commandedScreenY,
          )}
        >
          <path
            className="robot-commanded-direction"
            d={`
              M ${commandedScreenX} ${commandedScreenY - 8.1}
              L ${commandedScreenX - 2.1} ${commandedScreenY - 5.1}
              L ${commandedScreenX + 2.1} ${commandedScreenY - 5.1}
              Z
            `}
          />
        </g>

        <g filter="url(#robot-shadow)">
          <circle
            className="robot-observed-ring"
            cx={ROBOT_X}
            cy={ROBOT_Y}
            r="6.1"
          />

          <circle
            data-testid="observed-robot"
            aria-label="Observed robot position"
            className="robot-observed"
            cx={ROBOT_X}
            cy={ROBOT_Y}
            r="4.85"
          />

          <circle
            className="robot-observed-gloss"
            cx={ROBOT_X - 0.9}
            cy={ROBOT_Y - 1.1}
            r="3.6"
          />

          <circle
            className="robot-observed-core"
            cx={ROBOT_X}
            cy={ROBOT_Y}
            r="1.55"
          />
        </g>

        <g
          data-testid="observed-heading"
          className="observed-heading-indicator"
          style={headingStyle(actualHeading, ROBOT_X, ROBOT_Y)}
        >
          <path
            className="robot-observed-direction"
            d={`
              M ${ROBOT_X} ${ROBOT_Y - 5.25}
              L ${ROBOT_X - 2.05} ${ROBOT_Y - 1.9}
              L ${ROBOT_X + 2.05} ${ROBOT_Y - 1.9}
              Z
            `}
          />
        </g>
      </svg>

      <div className="workcell-hud">
        <div className="workcell-legend">
          <span>
            <i className="legend-marker legend-marker--observed" />
            Observed
          </span>

          <span>
            <i className="legend-marker legend-marker--commanded" />
            Commanded
          </span>
        </div>

        <div className="workcell-pose">
          <span>
            X <strong>{actualX.toFixed(1)}</strong>
          </span>

          <span>
            Y <strong>{actualY.toFixed(1)}</strong>
          </span>

          <span>
            H <strong>{Math.round(actualHeading % 360)}°</strong>
          </span>
        </div>
      </div>
    </div>
  );
}
