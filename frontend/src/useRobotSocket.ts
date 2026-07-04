import { useCallback, useEffect, useRef, useState } from 'react'

import {
  classifyTelemetry,
  computeTelemetryAge,
  type TelemetryState,
} from './telemetry'
import { isCommandProblem } from './utils'

export type ConnectionState =
  | 'connecting'
  | 'live'
  | 'disconnected'

export type CommandStatus =
  | 'acknowledged'
  | 'executing'
  | 'completed'
  | 'failed'
  | 'aborted'
  | 'rejected'

export type Pose = {
  x: number
  y: number
  heading: number
}

export type RobotState = {
  mode: RobotMode
  commandedPose: Pose
  actualPose: Pose
}

export type RobotMode = 'idle' | 'emergency_stopped'

export type ActiveFault =
  | 'telemetry_delay'
  | 'rotation_failure'
  | null

export type CommandName =
  | 'move_forward'
  | 'rotate_right'
  | 'emergency_stop'
  | 'reset'

export type SentCommand = {
  id: number
  command: CommandName
}

type ServerMessage =
  | {
    type: 'connection_status'
    status: 'live'
  }
  | {
    type: 'robot_state'
    sequence: number
    observedAtMs: number
    mode: RobotMode
    commandedPose: Pose
    actualPose: Pose
  }
  | {
    type: 'command_status'
    status: CommandStatus
    message?: string
  }
  | {
    type: 'fault_status'
    fault: Exclude<ActiveFault, null>
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

  const [failureMessage, setFailureMessage] =
    useState<string | null>(null)

  const [telemetryState, setTelemetryState] =
    useState<TelemetryState>('stale')

  const [telemetryAgeMs, setTelemetryAgeMs] = useState(0)

  const [activeFault, setActiveFault] =
    useState<ActiveFault>(null)

  const sentCommandId = useRef(0)

  const [sentCommand, setSentCommand] =
    useState<SentCommand | null>(null)

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

        const age = computeTelemetryAge(message.observedAtMs)

        setTelemetryAgeMs(age)
        setTelemetryState(classifyTelemetry(age))

        setRobotState({
          mode: message.mode,
          commandedPose: message.commandedPose,
          actualPose: message.actualPose,
        })
      }

      if (message.type === 'command_status') {
        setCommandStatus(message.status)

        setFailureMessage(
          isCommandProblem(message.status)
            ? message.message ?? 'Command did not complete.'
            : null,
        )
      }

      if (message.type === 'fault_status') {
        setActiveFault(
          message.enabled ? message.fault : null,
        )
        if (!message.enabled) {
          setCommandStatus(null)
          setFailureMessage(null)
        }
      }
    }

    socket.onclose = () => {
      if (active) {
        setConnectionState('disconnected')
      }
    }

    const timer = window.setInterval(() => {
      if (observedAtRef.current === null) return

      const age = computeTelemetryAge(observedAtRef.current)

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

  const sendCommand = useCallback(
    (command: CommandName) => {
      setCommandStatus(null)
      setFailureMessage(null)

      sentCommandId.current += 1

      setSentCommand({
        id: sentCommandId.current,
        command,
      })

      send({
        type: 'command',
        command,
      })
    },
    [send],
  )

  const moveForward = useCallback(() => {
    sendCommand('move_forward')
  }, [sendCommand])

  const rotateRight = useCallback(() => {
    sendCommand('rotate_right')
  }, [sendCommand])

  const enableFault = useCallback(
    (fault: Exclude<ActiveFault, null>) => {
      send({ type: 'set_fault', fault })
    },
    [send],
  )

  const clearFault = useCallback(() => {
    send({ type: 'clear_fault' })
  }, [send])

  const emergencyStop = useCallback(() => {
    sendCommand('emergency_stop')
  }, [sendCommand])

  const reset = useCallback(() => {
    sendCommand('reset')
  }, [sendCommand])

  return {
    connectionState,
    robotState,
    commandStatus,
    failureMessage,
    telemetryState,
    telemetryAgeMs,
    activeFault,
    sentCommand,
    moveForward,
    rotateRight,
    enableFault,
    clearFault,
    emergencyStop,
    reset,
  }
}
