import RobotView from './RobotView'
import { useRobotSocket } from './useRobotSocket'
import EventLog from './EventLog'
import { useEventHistory } from './useEventHistory'

const websocketProtocol =
  window.location.protocol === 'https:' ? 'wss:' : 'ws:'

const websocketUrl =
  `${websocketProtocol}//${window.location.host}/ws`

export default function App() {
  const {
    connectionState,
    robotState,
    commandStatus,
    failureMessage,
    telemetryState,
    activeFault,
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
  })

  const emergencyStopped =
    robotState?.mode === 'emergency_stopped'

  const normalControlsDisabled =
    connectionState !== 'live' ||
    telemetryState === 'stale' ||
    emergencyStopped

  return (
    <main>
      <h1>Robot State and Command Visibility</h1>

      <p>
        Connection:{' '}
        <strong>{connectionState.toUpperCase()}</strong>
      </p>

      <p>
        Telemetry:{' '}
        <strong>{telemetryState.toUpperCase()}</strong>
      </p>

      <p>
        Mode:{' '}
        <strong>
          {robotState?.mode.toUpperCase() ?? 'UNKNOWN'}
        </strong>
      </p>

      <p>
        Command:{' '}
        <strong>
          {commandStatus?.toUpperCase() ?? 'IDLE'}
        </strong>
      </p>

      <p>
        Fault:{' '}
        <strong>
          {activeFault?.toUpperCase() ?? 'NONE'}
        </strong>
      </p>

      <p>
        Commanded X: {robotState?.commandedPose?.x ?? 0}
      </p>

      <p>
        Observed X: {robotState?.actualPose?.x ?? 0}
      </p>

      {failureMessage && (
        <p role="alert">{failureMessage}</p>
      )}

      <RobotView robotState={robotState} />

      <button
        type="button"
        disabled={normalControlsDisabled}
        onClick={moveForward}
      >
        Move forward
      </button>

      <button
        type="button"
        disabled={normalControlsDisabled}
        onClick={interact}
      >
        Interact
      </button>

      <button
        type="button"
        disabled={connectionState !== 'live'}
        onClick={emergencyStop}
      >
        Simulated emergency stop
      </button>

      <button
        type="button"
        disabled={
          connectionState !== 'live' || !emergencyStopped
        }
        onClick={reset}
      >
        Reset
      </button>

      <button
        type="button"
        disabled={activeFault !== null}
        onClick={enableTelemetryDelay}
      >
        Enable telemetry delay
      </button>

      <button
        type="button"
        disabled={activeFault !== null}
        onClick={enableInteractionFailure}
      >
        Enable interaction failure
      </button>

      <button
        type="button"
        disabled={activeFault === null}
        onClick={clearFault}
      >
        Clear fault
      </button>

      <EventLog events={events} />
      
    </main>
  )
}
