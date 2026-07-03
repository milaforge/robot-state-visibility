import { useCallback, useEffect, useRef, useState } from 'react'

import {
  classifyTelemetry,
  type TelemetryState,
} from './telemetry'

export type ConnectionState =
  | 'connecting'
  | 'live'
  | 'disconnected'

export type CommandStatus =
  | 'acknowledged'
  | 'executing'
  | 'completed'
  | 'failed'
  | 'rejected'

export type Pose = {
  x: number
  y: number
  heading: number
}

export type RobotState = {
  commandedPose: Pose
  actualPose: Pose
}

export type ActiveFault = 'telemetry_delay' | null

type ServerMessage =
  | {
    type: 'connection_status'
    status: 'live'
  }
  | {
    type: 'robot_state'
    sequence: number
    observedAtMs: number
    commandedPose: Pose
    actualPose: Pose
  }
  | {
    type: 'command_status'
    status: CommandStatus
  }
  | {
    type: 'fault_status'
    fault: 'telemetry_delay'
    enabled: boolean
  }

export function useRobotSocket(url: string) {
  const socketRef = useRef<WebSocket | null>(null)
  const observedAtRef = useRef<number | null>(null)

  const [connectionState, setConnectionState] =
    useState<ConnectionState>('connecting')

  const [robotState, setRobotState] =
    useState<RobotState | null>(null)

  const [commandStatus, setCommandStatus] =
    useState<CommandStatus | null>(null)

  const [telemetryState, setTelemetryState] =
    useState<TelemetryState>('stale')

  const [telemetryAgeMs, setTelemetryAgeMs] = useState(0)

  const [activeFault, setActiveFault] =
    useState<ActiveFault>(null)

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

        const age = Math.max(
          0,
          Date.now() - message.observedAtMs,
        )

        setTelemetryAgeMs(age)
        setTelemetryState(classifyTelemetry(age))

        setRobotState({
          commandedPose: message.commandedPose,
          actualPose: message.actualPose,
        })
      }

      if (message.type === 'command_status') {
        setCommandStatus(message.status)
      }

      if (message.type === 'fault_status') {
        setActiveFault(
          message.enabled ? message.fault : null,
        )
      }
    }

    socket.onclose = () => {
      if (active) {
      setConnectionState('disconnected')
      }
    }

    const timer = window.setInterval(() => {
      if (observedAtRef.current === null) return

      const age = Math.max(
        0,
        Date.now() - observedAtRef.current,
      )

      setTelemetryAgeMs(age)
      setTelemetryState(classifyTelemetry(age))
    }, 100)

    return () => {
      window.clearInterval(timer)
      active = false
      socket.close()
    }
  }, [url])

  const send = useCallback((message: unknown) => {
    socketRef.current?.send(JSON.stringify(message))
  }, [])

  const moveForward = useCallback(() => {
    send({
      type: 'command',
      command: 'move_forward',
    })
  }, [send])

  const enableTelemetryDelay = useCallback(() => {
    send({
      type: 'set_fault',
      fault: 'telemetry_delay',
    })
  }, [send])

  const clearFault = useCallback(() => {
    send({
      type: 'clear_fault',
    })
  }, [send])

  return {
    connectionState,
    robotState,
    commandStatus,
    telemetryState,
    telemetryAgeMs,
    activeFault,
    moveForward,
    enableTelemetryDelay,
    clearFault,
  }
}
