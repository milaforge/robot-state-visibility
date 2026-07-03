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
    telemetryState,
    telemetryAgeMs,
    activeFault,
    moveForward,
    enableTelemetryDelay,
    clearFault,
  } = useRobotSocket(websocketUrl)

  const movementDisabled =
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
        Observed X: {robotState?.actualPose.x ?? 0}
      </p>

      <button
        type="button"
        disabled={movementDisabled}
        onClick={moveForward}
      >
        Move forward
      </button>

      <button
        type="button"
        onClick={
          activeFault
            ? clearFault
            : enableTelemetryDelay
        }
      >
        {activeFault
          ? 'Clear telemetry delay'
          : 'Enable telemetry delay'}
      </button>
    </main>
  )
}
