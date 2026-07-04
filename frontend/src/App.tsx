import {
  useState,
  type CSSProperties,
} from 'react'

import EventLog from './EventLog'
import RobotView from './RobotView'
import { useEventHistory } from './useEventHistory'
import { useRobotSocket } from './useRobotSocket'

const websocketUrl =
  import.meta.env.VITE_WEBSOCKET_URL ??
  'ws://localhost:8000/ws'

function formatToken(value: string) {
  return value.replaceAll('_', ' ')
}

export default function App() {
  const [eventsOpen, setEventsOpen] = useState(false)
  const [connectionDetailsOpen, setConnectionDetailsOpen] =
    useState(false)

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
    interact,
    emergencyStop,
    reset,
    enableTelemetryDelay,
    enableInteractionFailure,
    clearFault,
  } = useRobotSocket(websocketUrl)

  const events = useEventHistory({
    connectionState,
    commandStatus,
    activeFault,
    robotMode: robotState?.mode,
    sentCommand,
  })

  const emergencyStopped =
    robotState?.mode === 'emergency_stopped'

  const normalControlsDisabled =
    connectionState !== 'live' ||
    telemetryState === 'stale' ||
    emergencyStopped

  const commandBusy =
    commandStatus === 'acknowledged' ||
    commandStatus === 'executing'

  const commandProblem =
    commandStatus === 'failed' ||
    commandStatus === 'aborted' ||
    commandStatus === 'rejected'

  const moveBusy =
    commandBusy &&
    sentCommand?.command === 'move_forward'

  const interactBusy =
    commandBusy &&
    sentCommand?.command === 'interact'

  const moveFailed =
    commandProblem &&
    sentCommand?.command === 'move_forward'

  const interactFailed =
    commandProblem &&
    sentCommand?.command === 'interact'

  const livenessState =
    connectionState !== 'live'
      ? 'offline'
      : telemetryState

  const livenessScale = Math.min(
    1 + telemetryAgeMs / 700,
    2.4,
  )

  const livenessStyle = {
    '--liveness-scale': livenessScale,
  } as CSSProperties

  function toggleEmergencyStop() {
    if (emergencyStopped) {
      reset()
      return
    }

    emergencyStop()
  }

  function toggleFault(
    fault: 'telemetry_delay' | 'interaction_failure',
  ) {
    if (activeFault === fault) {
      clearFault()
      return
    }

    if (fault === 'telemetry_delay') {
      enableTelemetryDelay()
      return
    }

    enableInteractionFailure()
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
            <span
              className="liveness-visual"
              style={livenessStyle}
            >
              <i />
              <b />
            </span>

            <span>
              <small>System</small>
              <strong>
                {connectionState !== 'live'
                  ? 'Offline'
                  : telemetryState === 'live'
                    ? 'Operational'
                    : telemetryState}
              </strong>
            </span>
          </button>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={emergencyStopped}
          aria-label={
            emergencyStopped
              ? 'Release emergency stop'
              : 'Emergency stop'
          }
          className={
            emergencyStopped
              ? 'top-stop-button top-stop-button--active'
              : 'top-stop-button'
          }
          disabled={connectionState !== 'live'}
          onClick={toggleEmergencyStop}
        >
          <span className="media-stop-icon" />
          <small>
            {emergencyStopped ? 'STOPPED' : 'STOP'}
          </small>
        </button>

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
              ? 'visualization-panel visualization-panel--emergency'
              : 'visualization-panel'
          }
        >
          <header className="visualization-header">
            <div>
              <span className="section-label">
                Workcell
              </span>
              <h2>Robot position</h2>
            </div>
          </header>

          <RobotView robotState={robotState} />

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
              ? 'control-panel control-panel--emergency'
              : 'control-panel'
          }
        >
          <section className="primary-controls">
            <span className="section-label">
              Operator controls
            </span>

            <button
              className={[
                'action-button',
                'action-button--primary',
                moveBusy ? 'action-button--busy' : '',
                moveFailed ? 'action-button--failed' : '',
              ].join(' ')}
              type="button"
              disabled={
                normalControlsDisabled || commandBusy
              }
              onClick={moveForward}
            >
              <span className="action-icon">
                {moveBusy ? (
                  <i className="command-spinner" />
                ) : (
                  '↑'
                )}
              </span>

              <span>
                <strong>
                  {moveBusy
                    ? 'Moving'
                    : moveFailed
                      ? 'Movement failed'
                      : 'Move forward'}
                </strong>

                <small>
                  {moveBusy
                    ? 'Following commanded position'
                    : 'Advance one unit'}
                </small>
              </span>
            </button>

            <button
              className={[
                'action-button',
                interactBusy
                  ? 'action-button--busy'
                  : '',
                interactFailed
                  ? 'action-button--failed'
                  : '',
              ].join(' ')}
              type="button"
              disabled={
                normalControlsDisabled || commandBusy
              }
              onClick={interact}
            >
              <span className="action-icon">
                {interactBusy ? (
                  <i className="command-spinner" />
                ) : (
                  '↻'
                )}
              </span>

              <span>
                <strong>
                  {interactBusy
                    ? 'Rotating'
                    : interactFailed
                      ? 'Rotation failed'
                      : 'Rotate right'}
                </strong>

                <small>
                  {interactBusy
                    ? 'Turning toward 90°'
                    : 'Rotate 90° clockwise'}
                </small>
              </span>
            </button>
          </section>

          <details className="scenario-panel">
            <summary className="scenario-panel-header">
              <span>
                <i>⚙</i>
                Demo scenarios
              </span>

              <span
                className={
                  activeFault
                    ? 'scenario-status scenario-status--active'
                    : 'scenario-status'
                }
              >
                {activeFault
                  ? formatToken(activeFault)
                  : 'Off'}
              </span>
            </summary>

            <div
              className="scenario-selector"
              aria-label="Demo scenarios"
            >
              <button
                type="button"
                className="scenario-option"
                aria-pressed={
                  activeFault === 'telemetry_delay'
                }
                onClick={() =>
                  toggleFault('telemetry_delay')
                }
              >
                <span className="scenario-radio">
                  <span />
                </span>

                <span className="scenario-copy">
                  <strong>Telemetry delay</strong>
                  <small>
                    Freshness degrades to stale
                  </small>
                </span>

                <span className="scenario-symbol">
                  ◷
                </span>
              </button>

              <button
                type="button"
                className="scenario-option"
                aria-pressed={
                  activeFault === 'interaction_failure'
                }
                onClick={() =>
                  toggleFault('interaction_failure')
                }
              >
                <span className="scenario-radio">
                  <span />
                </span>

                <span className="scenario-copy">
                  <strong>Interaction failure</strong>
                  <small>
                    Rotation fails after acceptance
                  </small>
                </span>

                <span className="scenario-symbol">
                  ×
                </span>
              </button>
            </div>
          </details>

          <p className="safety-note">
            Stop control is simulated and not safety-rated.
          </p>
        </aside>
      </section>

      {connectionDetailsOpen && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={() =>
            setConnectionDetailsOpen(false)
          }
        >
          <section
            className="connection-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="connection-modal-title"
            onMouseDown={(event) =>
              event.stopPropagation()
            }
          >
            <header>
              <div>
                <span className="section-label">
                  Diagnostics
                </span>
                <h2 id="connection-modal-title">
                  Connection details
                </h2>
              </div>

              <button
                type="button"
                aria-label="Close connection details"
                onClick={() =>
                  setConnectionDetailsOpen(false)
                }
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
                  {robotState?.mode
                    .replaceAll('_', ' ')
                    .toUpperCase() ?? 'UNKNOWN'}
                </dd>
              </div>

              <div>
                <dt>Active fault</dt>
                <dd>
                  {activeFault
                    ? formatToken(
                        activeFault,
                      ).toUpperCase()
                    : 'NONE'}
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
  )
}