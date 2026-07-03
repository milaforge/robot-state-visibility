import { useCallback, useEffect, useRef, useState } from 'react'

import {
  classifyTelemetry,
  type TelemetryState,
} from './telemetry'

export type ConnectionState =
  | 'connecting'
  | 'live'
  | 'disconnected'

type ConnectionMessage = {
  type: 'connection_status'
  status: 'live'
}

export type CommandStatus =
  | 'acknowledged'
  | 'executing'
  | 'completed'

export type Pose = {
  x: number
  y: number
  heading: number
}

export type RobotState = {
  commandedPose: Pose
  actualPose: Pose
}

type ServerMessage =
  | ConnectionMessage
  | {
    type: 'robot_state'
    observedAtMs: number
    commandedPose: Pose
    actualPose: Pose
  }
  | {
    type: 'command_status'
    status: CommandStatus
  }


export function useRobotSocket(url: string) {
  const socketRef = useRef<WebSocket | null>(null)
  const observedAtRef = useRef<number | null>(null)

  const [connectionState, setConnectionState] = useState<ConnectionState>('connecting')
  const [robotState, setRobotState] = useState<RobotState | null>(null)
  const [commandStatus, setCommandStatus] = useState<CommandStatus | null>(null)
  const [telemetryState, setTelemetryState] = useState<TelemetryState>('stale')
  const [telemetryAgeMs, setTelemetryAgeMs] = useState(0)

  useEffect(() => {
    let active = true

    const socket = new WebSocket(url)
    socketRef.current = socket

    socket.onmessage = (event) => {
      if (!active) return

      const message = JSON.parse(event.data) as ServerMessage

      if (message.type === 'connection_status') {
        setConnectionState(message.status)
      }

      if (message.type === 'robot_state') {
        observedAtRef.current = message.observedAtMs

        setRobotState({
          commandedPose: message.commandedPose,
          actualPose: message.actualPose,
        })
      }

      if (message.type === 'command_status') {
        setCommandStatus(message.status)
      }
    }

    socket.onclose = () => {
      if (active) {
        setConnectionState('disconnected')
      }
    }

    const timer = window.setInterval(() => {
      if (observedAtRef.current === null) return

      const age = Math.max(0, Date.now() - observedAtRef.current)

      setTelemetryAgeMs(age)
      setTelemetryState(classifyTelemetry(age))
    })

    return () => {
      window.clearInterval(timer)
      active = false
      socket.close()
    }
  }, [url])

  const moveForward = useCallback(() => {
    socketRef.current?.send(
      JSON.stringify({
        type: 'command',
        command: 'move_forward',
      }),
    )
  }, [])

  return {
    connectionState,
    robotState,
    commandStatus,
    telemetryState,
    telemetryAgeMs,
    moveForward,
  }
}
