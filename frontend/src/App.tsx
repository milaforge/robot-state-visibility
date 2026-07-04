import { useState } from 'react'

import EventLog from './EventLog'
import RobotView from './RobotView'
import { useEventHistory } from './useEventHistory'
import { useRobotSocket } from './useRobotSocket'

const websocketUrl =
  import.meta.env.VITE_WEBSOCKET_URL ??
  'ws://localhost:8000/ws'

type Tone = 'positive' | 'warning' | 'danger' | 'neutral'

type StatusItemProps = {
  icon: string
  label: string
  value: string
  tone?: Tone
}

function formatToken(value: string) {
  return value.replaceAll('_', ' ')
}

function StatusItem({
  icon,
  label,
  value,
  tone = 'neutral',
}: StatusItemProps) {
  return (
    <div className={`status-item status-item--${tone}`}>
      <span className="status-icon">{icon}</span>

      <span>
        <small>{label}</small>
        <strong>{formatToken(value)}</strong>
      </span>
    </div>
  )
}

export default function App() {
  const [eventsOpen, setEventsOpen] = useState(false)

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

  const commandProblem =
    commandStatus === 'failed' ||
    commandStatus === 'aborted' ||
    commandStatus === 'rejected'

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark">R</span>

          <div>
            <h1>Robot State</h1>
            <p>Intent versus observation</p>
          </div>
        </div>

        <div className="header-actions">
          <span className="live-session">
            <i />
            Live
          </span>

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

      <section
        className="status-strip"
        aria-label="System status"
      >
        <StatusItem
          icon="●"
          label="Connection"
          value={connectionState.toUpperCase()}
          tone={
            connectionState === 'live'
              ? 'positive'
              : 'danger'
          }
        />

        <StatusItem
          icon="◌"
          label="Telemetry"
          value={`${telemetryState.toUpperCase()} · ${telemetryAgeMs}ms`}
          tone={
            telemetryState === 'live'
              ? 'positive'
              : telemetryState === 'delayed'
                ? 'warning'
                : 'danger'
          }
        />

        <StatusItem
          icon="◇"
          label="Mode"
          value={
            robotState?.mode.toUpperCase() ?? 'UNKNOWN'
          }
          tone={emergencyStopped ? 'danger' : 'neutral'}
        />

        <StatusItem
          icon="→"
          label="Command"
          value={commandStatus?.toUpperCase() ?? 'IDLE'}
          tone={
            commandProblem
              ? 'danger'
              : commandStatus === 'completed'
                ? 'positive'
                : commandStatus === 'executing'
                  ? 'warning'
                  : 'neutral'
          }
        />
      </section>

      <section className="dashboard-main">
        <section className="visualization-panel">
          <header className="visualization-header">
            <div>
              <span className="section-label">Workcell</span>
              <h2>Robot position</h2>
            </div>

            <div className="position-comparison">
              <span>
                <i className="position-dot position-dot--commanded" />
                {robotState?.commandedPose.x.toFixed(1) ?? '0.0'}
              </span>

              <span>
                <i className="position-dot position-dot--observed" />
                {robotState?.actualPose.x.toFixed(1) ?? '0.0'}
              </span>
            </div>
          </header>

          <RobotView robotState={robotState} />

          {failureMessage && (
            <div className="failure-alert" role="alert">
              <span>!</span>

              <div>
                <strong>Command interrupted</strong>
                <p>{failureMessage}</p>
              </div>
            </div>
          )}
        </section>

        <aside className="control-panel">
          <section className="primary-controls">
            <span className="section-label">
              Operator controls
            </span>

            <button
              className="action-button action-button--primary"
              type="button"
              disabled={normalControlsDisabled}
              onClick={moveForward}
            >
              <span className="action-icon">↑</span>

              <span>
                <strong>Move forward</strong>
                <small>Advance one unit</small>
              </span>
            </button>

            <button
              className="action-button"
              type="button"
              disabled={normalControlsDisabled}
              onClick={interact}
            >
              <span className="action-icon">◎</span>

              <span>
                <strong>Interact</strong>
                <small>Run target action</small>
              </span>
            </button>
          </section>

          <section className="safety-controls">
            <button
              className="emergency-button"
              type="button"
              disabled={connectionState !== 'live'}
              onClick={emergencyStop}
            >
              <span>■</span>
              Emergency stop
            </button>

            <button
              className="reset-button"
              type="button"
              disabled={
                connectionState !== 'live' ||
                !emergencyStopped
              }
              onClick={reset}
            >
              Reset
            </button>
          </section>

          <details className="advanced-controls">
            <summary>
              <span>
                <i>⚙</i>
                Demo scenarios
              </span>

              <strong>
                {activeFault
                  ? formatToken(activeFault)
                  : 'None active'}
              </strong>
            </summary>

            <div className="advanced-content">
              <button
                type="button"
                disabled={activeFault !== null}
                onClick={enableTelemetryDelay}
              >
                <span>◷</span>
                Enable telemetry delay
              </button>

              <button
                type="button"
                disabled={activeFault !== null}
                onClick={enableInteractionFailure}
              >
                <span>×</span>
                Enable interaction failure
              </button>

              <button
                type="button"
                disabled={activeFault === null}
                onClick={clearFault}
              >
                <span>↺</span>
                Clear fault
              </button>
            </div>
          </details>

          <p className="safety-note">
            Emergency stop is simulated and not safety-rated.
          </p>
        </aside>
      </section>

      <EventLog
        events={events}
        isOpen={eventsOpen}
        onClose={() => setEventsOpen(false)}
      />
    </main>
  )
}
