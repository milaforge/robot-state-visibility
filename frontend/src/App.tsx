import { useRobotSocket } from './useRobotSocket'

const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
const websocketUrl = `${protocol}//${window.location.host}/ws`

export default function App() {

  const {
    connectionState,
    robotState,
    commandStatus,
    moveForward,
  } = useRobotSocket(websocketUrl)

  return (
    <main>
      <h1>Robot State and Command Visibility</h1>

      <p>
        Connection: {' '}
        <strong>{connectionState.toUpperCase()}</strong>
      </p>

      <p>
        Command:{' '}
        <strong>
          {commandStatus?.toUpperCase() ?? 'IDLE'}
        </strong>
      </p>

      <p>
        Commanded X: {robotState?.commandedPose?.x ?? 0}
      </p>

      <p>
        Observed X: {robotState?.actualPose?.x ?? 0}
      </p>


      <button type="button" onClick={moveForward}>
        Move forward
      </button>

    </main>
  )
}
