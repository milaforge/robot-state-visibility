import { useRobotSocket } from './useRobotSocket'

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
    telemetryAgeMs,
    activeFault,
    moveForward,
    interact,
    enableTelemetryDelay,
    enableInteractionFailure,
    clearFault,
  } = useRobotSocket(websocketUrl)

  const controlsDisabled =
    connectionState !== 'live' || telemetryState === 'stale'

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
        {/* {' — '}
        {telemetryAgeMs} ms */}
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

      <button
        type="button"
        disabled={controlsDisabled}
        onClick={moveForward}
      >
        Move forward
      </button>

      <button
        type="button"
        disabled={controlsDisabled}
        onClick={interact}
      >
        Interact
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
    </main>
  )
}