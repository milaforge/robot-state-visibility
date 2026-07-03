import { useEffect, useState } from 'react'

export type ConnectionState =
  | 'connecting'
  | 'live'
  | 'disconnected'

type ConnectionMessage = {
  type: 'connection_status'
  status: 'live'
}

export function useRobotSocket(url: string): ConnectionState {
  const [state, setState] = useState<ConnectionState>('connecting')

  useEffect(() => {
    let active = true

    const socket = new WebSocket(url)

    socket.onmessage = (event) => {
      if (!active) return

      const message = JSON.parse(event.data) as ConnectionMessage

      if (message.type === 'connection_status') {
        setState(message.status)
      }
    }

    socket.onclose = () => {
      if (active) {
        setState('disconnected')
      }
    }

    return () => {
      active = false
      socket.close()
    }
  }, [url])

  return state
}
