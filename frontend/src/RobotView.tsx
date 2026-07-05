import type { CSSProperties } from "react";

import type { RobotState } from "./useRobotSocket";

type LivenessState = "live" | "delayed" | "stale" | "offline";

type RobotViewProps = {
  robotState: RobotState | null;
  rotationFailed?: boolean;
  livenessState?: LivenessState;
  livenessStyle?: CSSProperties;
  connectionState?: string;
  telemetryState?: string;
  onOpenConnectionDetails?: () => void;
};

const POSITION_SCALE = 10;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

function angularDifference(commanded: number, observed: number) {
  const difference = ((commanded - observed + 540) % 360) - 180;

  return Math.abs(difference);
}

export default function RobotView({
  robotState,
  rotationFailed = false,
  livenessState,
  livenessStyle,
  connectionState,
  telemetryState,
  onOpenConnectionDetails,
}: RobotViewProps) {
  const actualX = robotState?.actualPose.x ?? 0;
  const actualY = robotState?.actualPose.y ?? 0;

  const commandedX = robotState?.commandedPose.x ?? 0;
  const commandedY = robotState?.commandedPose.y ?? 0;

  const actualHeading = robotState?.actualPose.heading ?? 0;
  const commandedHeading = robotState?.commandedPose.heading ?? 0;

  const commandedLeft = clamp(
    50 + (commandedX - actualX) * POSITION_SCALE,
    8,
    92,
  );

  const commandedTop = clamp(
    50 - (commandedY - actualY) * POSITION_SCALE,
    10,
    90,
  );

  const headingError = angularDifference(commandedHeading, actualHeading);

  const workcellStyle = {
    "--grid-x": `${-actualX * 42}px`,
    "--grid-y": `${actualY * 42}px`,
  } as CSSProperties;

  const commandedStyle = {
    left: `${commandedLeft}%`,
    top: `${commandedTop}%`,
  };

  return (
    <div
      className="robot-view"
      style={workcellStyle}
      role="img"
      aria-label="Robot moving through the workcell"
    >
      <div className="workcell-surface">
        {robotState?.mode === "emergency_stopped" && (
          <div className="workcell-emergency-layer" />
        )}

        <div
          data-testid="commanded-robot"
          className={
            rotationFailed
              ? "commanded-marker commanded-marker--failed"
              : "commanded-marker"
          }
          style={commandedStyle}
        >
          <span
            data-testid="commanded-heading"
            className="commanded-direction"
            style={{
              transform: `rotate(${commandedHeading}deg)`,
            }}
          />
        </div>
        {rotationFailed && (
          <div
            className="robot-delta-badge"
            style={{
              left: `calc(${commandedLeft}% + 42px)`,
              top: `calc(${commandedTop}% - 6px)`,
            }}
          >
            − {Math.round(headingError)}°
          </div>
        )}

        <div data-testid="observed-robot" className="observed-marker">
          {robotState?.mode === "emergency_stopped" && (
            <span className="emergency-halo" />
          )}

          <span className="observed-shell">
            <span className="observed-gloss" />
            <span className="observed-core" />
          </span>

          <span
            data-testid="observed-heading"
            className="observed-direction"
            style={{
              transform: `rotate(${actualHeading}deg)`,
            }}
          />
        </div>

        {livenessState !== undefined && (
          <button
            type="button"
            className={`workcell-liveness liveness-button liveness-button--${livenessState}`}
            aria-label="Open connection details"
            onClick={onOpenConnectionDetails}
          >
            <span className="liveness-visual" style={livenessStyle}>
              <i />
              <b />
            </span>

            <span>
              <small>System</small>
              <strong>
                {connectionState !== "live"
                  ? "Offline"
                  : telemetryState === "live"
                    ? "Operational"
                    : telemetryState}
              </strong>
            </span>
          </button>
        )}

        <div className="workcell-pose-stack">
          <span>
            X<strong>{actualX.toFixed(1)}</strong>
          </span>

          <span>
            Y<strong>{actualY.toFixed(1)}</strong>
          </span>

          <span>
            H<strong>{Math.round(actualHeading % 360)}°</strong>
          </span>
        </div>

        <div className="workcell-legend">
          <span>
            <i className="legend-marker legend-marker--observed" />
            Observed
          </span>

          <span>
            <i
              className={
                rotationFailed
                  ? "legend-marker legend-marker--failed"
                  : "legend-marker legend-marker--commanded"
              }
            />
            {rotationFailed ? "Failed target" : "Commanded"}
          </span>
        </div>
      </div>
    </div>
  );
}
