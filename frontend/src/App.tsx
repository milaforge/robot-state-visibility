import { useRobotSocket } from './useRobotSocket'

const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
const websocketUrl = `${protocol}//${window.location.host}/ws`

export default function App() {

  const connectionState = useRobotSocket(websocketUrl)

  return (
    <main>
      <h1>Robot State and Command Visibility</h1>

      <p>
        Connection: <strong>{connectionState.toUpperCase()}</strong>
      </p>

    </main>
  )
}
