import EventLog from './EventLog'
import RobotView from './RobotView'
import { useEventHistory } from './useEventHistory'
import { useRobotSocket } from './useRobotSocket'

const websocketUrl =
  import.meta.env.VITE_WEBSOCKET_URL ??
  'ws://localhost:8000/ws'

type Tone = 'positive' | 'warning' | 'danger' | 'neutral'

type StatusCardProps = {
  label: string
  value: string
  detail?: string
  tone?: Tone
}

function formatToken(value: string) {
  return value.replaceAll('_', ' ')
}

function StatusCard({
  label,
  value,
  detail,
  tone = 'neutral',
}: StatusCardProps) {
  return (
    <article className={`status-card status-card--${tone}`}>
      <span>{label}</span>
      <strong>{formatToken(value)}</strong>
      {detail && <small>{detail}</small>}
    </article>
  )
}

export default function App() {
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

  const connectionTone: Tone =
    connectionState === 'live' ? 'positive' : 'danger'

  const telemetryTone: Tone =
    telemetryState === 'live'
      ? 'positive'
      : telemetryState === 'delayed'
        ? 'warning'
        : 'danger'

  const modeTone: Tone = emergencyStopped
    ? 'danger'
    : 'neutral'

  const commandTone: Tone =
    commandStatus === 'completed'
      ? 'positive'
      : commandStatus === 'executing' ||
          commandStatus === 'acknowledged'
        ? 'warning'
        : commandStatus === 'failed' ||
            commandStatus === 'aborted' ||
            commandStatus === 'rejected'
          ? 'danger'
          : 'neutral'

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">
            Real-time operator experiment
          </p>

          <h1>Robot State &amp; Command Visibility</h1>

          <p className="app-description">
            Separate intent, acknowledgement, observed
            behavior, and uncertainty.
          </p>
        </div>

        <div className="session-status">
          <span
            className={
              connectionState === 'live'
                ? 'session-indicator session-indicator--live'
                : 'session-indicator'
            }
          />

          {connectionState === 'live'
            ? 'Live session'
            : 'Session unavailable'}
        </div>
      </header>

      <section
        className="status-grid"
        aria-label="System status"
      >
        <StatusCard
          label="Connection"
          value={connectionState.toUpperCase()}
          tone={connectionTone}
        />

        <StatusCard
          label="Telemetry"
          value={telemetryState.toUpperCase()}
          detail={`${telemetryAgeMs} ms old`}
          tone={telemetryTone}
        />

        <StatusCard
          label="Robot mode"
          value={
            robotState?.mode.toUpperCase() ?? 'UNKNOWN'
          }
          tone={modeTone}
        />

        <StatusCard
          label="Latest command"
          value={commandStatus?.toUpperCase() ?? 'IDLE'}
          tone={commandTone}
        />
      </section>

      {failureMessage && (
        <div className="failure-alert" role="alert">
          <strong>Command did not complete</strong>
          <span>{failureMessage}</span>
        </div>
      )}

      <div className="workspace-grid">
        <section className="panel visualization-panel">
          <header className="panel-header">
            <div>
              <p className="section-label">
                Workcell
              </p>
              <h2>Robot position</h2>
            </div>

            <div className="position-values">
              <span>
                Commanded
                <strong>
                  {robotState?.commandedPose.x ?? 0}
                </strong>
              </span>

              <span>
                Observed
                <strong>
                  {robotState?.actualPose.x ?? 0}
                </strong>
              </span>
            </div>
          </header>

          <RobotView robotState={robotState} />
        </section>

        <aside className="panel control-panel">
          <header className="panel-header">
            <div>
              <p className="section-label">
                Operator controls
              </p>
              <h2>Commands</h2>
            </div>
          </header>

          <section className="control-group">
            <h3>Movement</h3>

            <div className="control-buttons">
              <button
                className="button button--primary"
                type="button"
                disabled={normalControlsDisabled}
                onClick={moveForward}
              >
                Move forward
              </button>

              <button
                className="button button--secondary"
                type="button"
                disabled={normalControlsDisabled}
                onClick={interact}
              >
                Interact
              </button>
            </div>
          </section>

          <section className="control-group">
            <h3>Safety</h3>

            <div className="control-buttons">
              <button
                className="button button--danger"
                type="button"
                disabled={connectionState !== 'live'}
                onClick={emergencyStop}
              >
                Emergency stop
              </button>

              <button
                className="button button--secondary"
                type="button"
                disabled={
                  connectionState !== 'live' ||
                  !emergencyStopped
                }
                onClick={reset}
              >
                Reset
              </button>
            </div>

            <small>
              Simulated control. Not safety-rated.
            </small>
          </section>

          <section className="control-group">
            <h3>Fault injection</h3>

            <div className="control-buttons control-buttons--stacked">
              <button
                className="button button--secondary"
                type="button"
                disabled={activeFault !== null}
                onClick={enableTelemetryDelay}
              >
                Delay telemetry
              </button>

              <button
                className="button button--secondary"
                type="button"
                disabled={activeFault !== null}
                onClick={enableInteractionFailure}
              >
                Fail interaction
              </button>

              <button
                className="button button--ghost"
                type="button"
                disabled={activeFault === null}
                onClick={clearFault}
              >
                Clear active fault
              </button>
            </div>
          </section>

          <div className="active-fault">
            <span>Active fault</span>
            <strong>
              {activeFault
                ? formatToken(activeFault).toUpperCase()
                : 'NONE'}
            </strong>
          </div>
        </aside>
      </div>

      <EventLog events={events} />
    </main>
  )
}
