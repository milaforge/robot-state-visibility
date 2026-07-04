import { useEffect, useRef, useState, type CSSProperties } from "react";

import EventLog from "./EventLog";
import RobotView from "./RobotView";
import { useEventHistory } from "./useEventHistory";
import { useRobotSocket } from "./useRobotSocket";

const websocketUrl =
  import.meta.env.VITE_WEBSOCKET_URL ?? "ws://localhost:8000/ws";

type ScenarioId = "telemetry_delay" | "rotation_failure";

const demoScenarios: Array<{
  id: ScenarioId;
  label: string;
  icon: string;
  description: string;
}> = [
  {
    id: "telemetry_delay",
    label: "Telemetry delay",
    icon: "◷",
    description: "Delays telemetry until the observation becomes stale.",
  },
  {
    id: "rotation_failure",
    label: "Rotation failure",
    icon: "↻",
    description: "Accepts the rotation command, then fails before completion.",
  },
];

function formatToken(value: string) {
  return value.replaceAll("_", " ");
}

export default function App() {
  const [eventsOpen, setEventsOpen] = useState(false);
  const [connectionDetailsOpen, setConnectionDetailsOpen] = useState(false);
  const [scenarioHint, setScenarioHint] = useState<string | null>(null);
  const [scenarioMenuOpen, setScenarioMenuOpen] = useState(false);
  const scenarioMenuRef = useRef<HTMLDivElement | null>(null);
  const {
    connectionState,
    robotState,
    commandStatus,
    failureMessage,
    telemetryState,
    telemetryAgeMs,
    activeFault,
    sentCommand,
    moveForward,
    rotateRight,
    emergencyStop,
    reset,
    enableTelemetryDelay,
    enableInteractionFailure: enableRotationFailure,
    clearFault,
  } = useRobotSocket(websocketUrl);

  const events = useEventHistory({
    connectionState,
    commandStatus,
    activeFault,
    robotMode: robotState?.mode,
    sentCommand,
  });

  const emergencyStopped = robotState?.mode === "emergency_stopped";

  const normalControlsDisabled =
    connectionState !== "live" ||
    telemetryState === "stale" ||
    emergencyStopped;

  const commandBusy =
    commandStatus === "acknowledged" || commandStatus === "executing";

  const commandProblem =
    commandStatus === "failed" ||
    commandStatus === "aborted" ||
    commandStatus === "rejected";

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

  useEffect(() => {
    if (!scenarioMenuOpen) {
      return;
    }

    function closeScenarioMenuOnOutsidePointer(event: PointerEvent) {
      if (
        event.target instanceof Node &&
        scenarioMenuRef.current?.contains(event.target)
      ) {
        return;
      }

      setScenarioHint(null);
      setScenarioMenuOpen(false);
    }

    document.addEventListener("pointerdown", closeScenarioMenuOnOutsidePointer);

    return () => {
      document.removeEventListener(
        "pointerdown",
        closeScenarioMenuOnOutsidePointer,
      );
    };
  }, [scenarioMenuOpen]);

  function toggleEmergencyStop() {
    if (emergencyStopped) {
      reset();
      return;
    }

    emergencyStop();
  }

  function toggleFault(fault: ScenarioId) {
    if (activeFault === fault) {
      clearFault();
      return;
    }

    if (fault === "telemetry_delay") {
      enableTelemetryDelay();
      return;
    }

    enableRotationFailure();
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="header-left">
          <div className="brand">
            <span className="brand-mark">R</span>

            <div>
              <h1>Robot State</h1>
              <p>Intent versus observation</p>
            </div>
          </div>

          <button
            type="button"
            className={`liveness-button liveness-button--${livenessState}`}
            aria-label="Open connection details"
            onClick={() => setConnectionDetailsOpen(true)}
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
              <h2>Robot position</h2>
            </div>
          </header>

          <RobotView robotState={robotState} rotationFailed={rotationFailed} />

          {failureMessage && (
            <div className="failure-alert" role="alert">
              <span>!</span>

              <div>
                <strong>Command did not complete</strong>
                <p>{failureMessage}</p>
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
            <span className="section-label">Operator controls</span>
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
              <span>One command at a time</span>
            </header>

            <div className="motion-pad">
              <button
                className={[
                  "motion-control",
                  "motion-control--forward",
                  moveBusy ? "motion-control--busy" : "",
                  moveFailed ? "motion-control--failed" : "",
                ].join(" ")}
                type="button"
                disabled={normalControlsDisabled || commandBusy}
                onClick={moveForward}
              >
                <span className="motion-control-icon">
                  {moveBusy ? <i className="command-spinner" /> : "↑"}
                </span>

                <span className="motion-control-copy">
                  <strong>
                    {moveBusy
                      ? "Moving forward"
                      : moveFailed
                        ? "Movement failed"
                        : "Move forward"}
                  </strong>

                  <small>
                    {moveBusy ? "Executing command" : "Advance one unit"}
                  </small>
                </span>
              </button>

              <button
                className={[
                  "motion-control",
                  "motion-control--rotate",
                  rotationBusy ? "motion-control--busy" : "",
                  rotationFailed ? "motion-control--failed" : "",
                ].join(" ")}
                type="button"
                disabled={normalControlsDisabled || commandBusy}
                onClick={rotateRight}
              >
                <span className="motion-control-icon">
                  {rotationBusy ? <i className="command-spinner" /> : "↻"}
                </span>

                <span className="motion-control-copy">
                  <strong>
                    {rotationBusy
                      ? "Rotating right"
                      : rotationFailed
                        ? "Rotation failed"
                        : "Rotate right"}
                  </strong>

                  <small>
                    {rotationBusy
                      ? "Executing command"
                      : "Rotate 90° clockwise"}
                  </small>
                </span>
              </button>
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
                  <strong>Demo scenarios</strong>
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
                      <strong>Demo scenarios</strong>
                      <small>One scenario can be active</small>
                    </div>

                    <span>{demoScenarios.length}</span>
                  </header>

                  <div className="scenario-menu-list">
                    {demoScenarios.map((scenario) => {
                      const active = activeFault === scenario.id;

                      return (
                        <button
                          key={scenario.id}
                          type="button"
                          role="switch"
                          aria-checked={active}
                          className="scenario-menu-item"
                          onMouseEnter={() =>
                            setScenarioHint(scenario.description)
                          }
                          onMouseLeave={() => setScenarioHint(null)}
                          onFocus={() => setScenarioHint(scenario.description)}
                          onBlur={() => setScenarioHint(null)}
                          onClick={() => toggleFault(scenario.id)}
                        >
                          <span className="scenario-menu-icon">
                            {scenario.icon}
                          </span>

                          <span className="scenario-menu-label">
                            <strong>{scenario.label}</strong>
                            <small>{active ? "Active" : "Disabled"}</small>
                          </span>

                          <span className="mini-switch" aria-hidden="true">
                            <span />
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  <div
                    className={
                      scenarioHint
                        ? "scenario-tooltip scenario-tooltip--visible"
                        : "scenario-tooltip"
                    }
                    role="tooltip"
                  >
                    {scenarioHint ?? "Select a deterministic failure scenario."}
                  </div>
                </div>
              )}
            </div>
          </section>

          <p className="safety-note">
            Stop control is simulated and not safety-rated.
          </p>
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
