import { useRef, useState, type CSSProperties } from "react";

import EventLog from "./EventLog";
import { MotionControlButton } from "./MotionControlButton";
import RobotView from "./RobotView";
import { useClickOutside } from "./useClickOutside";
import { useEventHistory } from "./useEventHistory";
import { useRobotSocket } from "./useRobotSocket";
import { formatToken, isCommandProblem } from "./utils";

const websocketUrl =
  import.meta.env.VITE_WEBSOCKET_URL ?? "ws://localhost:8000/ws";

type ScenarioId =
  | "telemetry_delay"
  | "rotation_failure"
  | "lost_completion_after_execution";

const demoScenarios: Array<{
  id: ScenarioId;
  label: string;
  icon: string;
  description: string;
  detail: string;
}> = [
  {
    id: "telemetry_delay",
    label: "Observation Delay",
    icon: "◷",
    description: "Fresh robot observations stop reaching the operator.",
    detail:
      "The connection remains open, but telemetry becomes stale. Normal controls lock while emergency stop remains available.",
  },
  {
    id: "rotation_failure",
    label: "Execution Error",
    icon: "↻",
    description: "The command is accepted but fails during execution.",
    detail:
      "Rotate right is acknowledged and begins executing, then fails before the robot heading changes.",
  },
  {
    id: "lost_completion_after_execution",
    label: "Completion Delivery",
    icon: "⇄",
    description: "Execution succeeds, but completion is not delivered.",
    detail:
      "The robot finishes moving, then the connection drops before the completion event reaches the UI. The outcome remains unknown until reconciliation.",
  },
];

export default function App() {
  const [eventsOpen, setEventsOpen] = useState(false);
  const [connectionDetailsOpen, setConnectionDetailsOpen] = useState(false);
  const [tooltipScenarioId, setTooltipScenarioId] = useState<ScenarioId | null>(
    null,
  );
  const [scenarioMenuOpen, setScenarioMenuOpen] = useState(false);
  const scenarioMenuRef = useRef<HTMLDivElement | null>(null);
  const tooltipTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(
    null,
  );
  const {
    connectionState,
    robotState,
    commandStatus,
    commandReconciled,
    failureMessage,
    telemetryState,
    telemetryAgeMs,
    activeFault,
    sentCommand,
    systemEvents,
    moveForward,
    rotateRight,
    emergencyStop,
    reset,
    enableFault,
    clearFault,
  } = useRobotSocket(websocketUrl);

  const events = useEventHistory({
    connectionState,
    commandStatus,
    commandReconciled,
    activeFault,
    robotMode: robotState?.mode,
    sentCommand,
    systemEvents,
  });

  const emergencyStopped = robotState?.mode === "emergency_stopped";

  const normalControlsDisabled =
    connectionState !== "live" ||
    telemetryState === "stale" ||
    emergencyStopped ||
    commandStatus === "unknown";

  const commandBusy =
    commandStatus === "sent" ||
    commandStatus === "acknowledged" ||
    commandStatus === "executing";

  const commandProblem =
    commandStatus !== null && isCommandProblem(commandStatus);

  const moveBusy = commandBusy && sentCommand?.command === "move_forward";

  const rotationBusy = commandBusy && sentCommand?.command === "rotate_right";

  const moveFailed = commandProblem && sentCommand?.command === "move_forward";

  const rotationFailed =
    commandProblem && sentCommand?.command === "rotate_right";

  const livenessState = connectionState !== "live" ? "offline" : telemetryState;

  const livenessScale = Math.min(1 + telemetryAgeMs / 700, 2.4);

  const livenessStyle = {
    "--liveness-scale": livenessScale,
  } as CSSProperties;

  const outcomeUnknown = commandStatus === "unknown";

  const commandReconciledCompleted =
    commandStatus === "completed" && commandReconciled;

  useClickOutside(
    scenarioMenuRef,
    () => {
      clearScenarioTooltip();
      setScenarioMenuOpen(false);
    },
    scenarioMenuOpen,
  );

  function toggleEmergencyStop() {
    if (emergencyStopped) {
      reset();
      return;
    }

    emergencyStop();
  }

  function selectFault(fault: ScenarioId) {
    enableFault(fault);
  }

  function clearScenarioTooltip() {
    if (tooltipTimerRef.current !== null) {
      window.clearTimeout(tooltipTimerRef.current);
      tooltipTimerRef.current = null;
    }

    setTooltipScenarioId(null);
  }

  function scheduleScenarioTooltip(fault: ScenarioId) {
    clearScenarioTooltip();

    tooltipTimerRef.current = window.setTimeout(() => {
      setTooltipScenarioId(fault);
      tooltipTimerRef.current = null;
    }, 150);
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="header-left">
          <div className="brand">
            <span className="brand-mark">R</span>

            <div>
              <h1>Robot Monitoring</h1>
              <p>Intent versus observation</p>
            </div>
          </div>
        </div>

        <div className="header-actions">
          <button
            className="events-button"
            type="button"
            aria-label="Open recent events"
            onClick={() => setEventsOpen(true)}
          >
            <span>☷</span>
            Events
            <strong>{events.length}</strong>
          </button>
        </div>
      </header>

      <section className="dashboard-main">
        <section
          className={
            emergencyStopped
              ? "visualization-panel visualization-panel--emergency"
              : "visualization-panel"
          }
        >
          <header className="visualization-header">
            <div>
              <span className="section-label">Workcell</span>
              <h2>Visualization</h2>
            </div>
          </header>

          <RobotView
            robotState={robotState}
            rotationFailed={rotationFailed}
            livenessState={livenessState}
            livenessStyle={livenessStyle}
            connectionState={connectionState}
            telemetryState={telemetryState}
            onOpenConnectionDetails={() => setConnectionDetailsOpen(true)}
          />

          {(failureMessage || outcomeUnknown || commandReconciledCompleted) && (
            <div
              className={
                outcomeUnknown
                  ? "failure-alert failure-alert--unknown"
                  : commandReconciledCompleted
                    ? "failure-alert failure-alert--reconciled"
                    : "failure-alert"
              }
              role="alert"
            >
              <span>{commandReconciledCompleted ? "✓" : "!"}</span>

              <div>
                <strong>
                  {outcomeUnknown
                    ? "Outcome unknown"
                    : commandReconciledCompleted
                      ? "Completed — reconciled from authoritative backend state"
                      : "Command did not complete"}
                </strong>
                {failureMessage && <p>{failureMessage}</p>}
              </div>
            </div>
          )}
        </section>

        <aside
          className={
            emergencyStopped
              ? "control-panel control-panel--emergency"
              : "control-panel"
          }
        >
          <header className="control-panel-header">
            <span className="section-label">Control</span>
            <span className="control-availability">
              {normalControlsDisabled ? "Locked" : "Ready"}
            </span>
          </header>

          <section
            className="control-zone control-zone--motion"
            aria-labelledby="motion-controls-title"
          >
            <header className="control-zone-header">
              <h3 id="motion-controls-title">Motion</h3>
            </header>

            <div className="motion-pad">
              <MotionControlButton
                modifier="forward"
                icon="↑"
                busy={moveBusy}
                failed={moveFailed}
                disabled={normalControlsDisabled || commandBusy}
                idleLabel="Move forward"
                busyLabel="Moving forward"
                failedLabel="Movement failed"
                idleHint="Advance one unit"
                onClick={moveForward}
              />

              <MotionControlButton
                modifier="rotate"
                icon="↻"
                busy={rotationBusy}
                failed={rotationFailed}
                disabled={normalControlsDisabled || commandBusy}
                idleLabel="Rotate right"
                busyLabel="Rotating right"
                failedLabel="Rotation failed"
                idleHint="Rotate 90° clockwise"
                onClick={rotateRight}
              />
            </div>
          </section>

          <section
            className="control-zone control-zone--safety"
            aria-labelledby="safety-controls-title"
          >
            <header className="control-zone-header">
              <h3 id="safety-controls-title">Safety</h3>
            </header>

            <button
              type="button"
              role="switch"
              aria-checked={emergencyStopped}
              aria-label={
                emergencyStopped ? "Release emergency stop" : "Emergency stop"
              }
              className={
                emergencyStopped
                  ? "panel-stop-button panel-stop-button--active"
                  : "panel-stop-button"
              }
              disabled={connectionState !== "live"}
              onClick={toggleEmergencyStop}
            >
              <span className="panel-stop-icon" />

              <span className="panel-stop-copy">
                <strong>
                  {emergencyStopped
                    ? "Emergency stop active"
                    : "Emergency stop"}
                </strong>

                <small>
                  {emergencyStopped
                    ? "Press to release"
                    : "Interrupt the active command"}
                </small>
              </span>

              <span className="panel-stop-state" aria-hidden="true">
                {emergencyStopped ? "ACTIVE" : "READY"}
              </span>
            </button>

            <p className="safety-note">
              Demonstration only; not safety control.
            </p>
          </section>

          <section
            className="control-zone control-zone--settings"
            aria-labelledby="settings-controls-title"
          >
            <header className="control-zone-header">
              <h3 id="settings-controls-title">Settings</h3>
            </header>

            <div className="scenario-menu" ref={scenarioMenuRef}>
              <button
                type="button"
                className={
                  activeFault
                    ? "scenario-launcher scenario-launcher--active"
                    : "scenario-launcher"
                }
                aria-expanded={scenarioMenuOpen}
                aria-controls="scenario-popover"
                onClick={() => setScenarioMenuOpen((current) => !current)}
              >
                <span className="scenario-launcher-icon">⚙</span>

                <span className="scenario-launcher-copy">
                  <strong>Possible Failure</strong>
                  <small>
                    {activeFault
                      ? formatToken(activeFault)
                      : `${demoScenarios.length} available`}
                  </small>
                </span>

                {activeFault && (
                  <span
                    className="scenario-launcher-dot"
                    aria-label="Scenario active"
                  />
                )}

                <span
                  className={
                    scenarioMenuOpen
                      ? "scenario-launcher-chevron scenario-launcher-chevron--open"
                      : "scenario-launcher-chevron"
                  }
                  aria-hidden="true"
                >
                  ›
                </span>
              </button>

              {scenarioMenuOpen && (
                <div id="scenario-popover" className="scenario-menu-popover">
                  <header className="scenario-menu-header">
                    <div>
                      <strong>Possible Failure</strong>
                    </div>

                    <span>{demoScenarios.length}</span>
                  </header>

                  <div className="scenario-menu-list" role="radiogroup">
                    <button
                      type="button"
                      role="radio"
                      aria-checked={activeFault === null}
                      className="scenario-menu-item"
                      onMouseEnter={clearScenarioTooltip}
                      onMouseLeave={clearScenarioTooltip}
                      onFocus={clearScenarioTooltip}
                      onBlur={clearScenarioTooltip}
                      onClick={clearFault}
                    >
                      <span className="scenario-menu-icon">○</span>

                      <span className="scenario-menu-label">
                        <strong>None</strong>
                        <small>
                          {activeFault === null ? "Active" : "Available"}
                        </small>
                      </span>

                      <span className="mini-radio" aria-hidden="true">
                        <span />
                      </span>
                    </button>

                    {demoScenarios.map((scenario) => {
                      const active = activeFault === scenario.id;

                      return (
                        <button
                          key={scenario.id}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          aria-describedby={
                            tooltipScenarioId === scenario.id
                              ? `scenario-tooltip-${scenario.id}`
                              : undefined
                          }
                          className="scenario-menu-item"
                          onMouseEnter={() =>
                            scheduleScenarioTooltip(scenario.id)
                          }
                          onMouseLeave={clearScenarioTooltip}
                          onFocus={() => scheduleScenarioTooltip(scenario.id)}
                          onBlur={clearScenarioTooltip}
                          onClick={() => selectFault(scenario.id)}
                        >
                          <span className="scenario-menu-icon">
                            {scenario.icon}
                          </span>

                          <span className="scenario-menu-label">
                            <strong>{scenario.label}</strong>
                            <small>{active ? "Active" : "Disabled"}</small>
                          </span>

                          <span className="mini-radio" aria-hidden="true">
                            <span />
                          </span>

                          {tooltipScenarioId === scenario.id && (
                            <span
                              id={`scenario-tooltip-${scenario.id}`}
                              className="scenario-tooltip"
                              role="tooltip"
                            >
                              {scenario.detail}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </section>
        </aside>
      </section>

      {connectionDetailsOpen && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={() => setConnectionDetailsOpen(false)}
        >
          <section
            className="connection-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="connection-modal-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <span className="section-label">Diagnostics</span>
                <h2 id="connection-modal-title">Connection details</h2>
              </div>

              <button
                type="button"
                aria-label="Close connection details"
                onClick={() => setConnectionDetailsOpen(false)}
              >
                ×
              </button>
            </header>

            <dl className="connection-details">
              <div>
                <dt>Transport</dt>
                <dd>{connectionState.toUpperCase()}</dd>
              </div>

              <div>
                <dt>Telemetry freshness</dt>
                <dd>{telemetryState.toUpperCase()}</dd>
              </div>

              <div>
                <dt>Latest observation age</dt>
                <dd>{telemetryAgeMs} ms</dd>
              </div>

              <div>
                <dt>Robot mode</dt>
                <dd>
                  {robotState?.mode.replaceAll("_", " ").toUpperCase() ??
                    "UNKNOWN"}
                </dd>
              </div>

              <div>
                <dt>Active fault</dt>
                <dd>
                  {activeFault
                    ? formatToken(activeFault).toUpperCase()
                    : "NONE"}
                </dd>
              </div>
            </dl>
          </section>
        </div>
      )}

      <EventLog
        events={events}
        isOpen={eventsOpen}
        onClose={() => setEventsOpen(false)}
      />
    </main>
  );
}
