import { useCallback, useEffect, useRef, useState } from 'react'

import {
  classifyTelemetry,
  computeTelemetryAge,
  type TelemetryState,
} from './telemetry'
import { isCommandProblem } from './utils'

const RECONNECT_DELAY_MS = 500

export type ConnectionState =
  | 'connecting'
  | 'live'
  | 'disconnected'

export type CommandStatus =
  | 'sent'
  | 'acknowledged'
  | 'executing'
  | 'unknown'
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
  | 'lost_completion_after_execution'
  | null

export type CommandName =
  | 'move_forward'
  | 'rotate_right'
  | 'emergency_stop'
  | 'reset'

export type SentCommand = {
  id: string
  command: CommandName
}

export type SocketSystemEvent = {
  id: number
  title: string
}

type ServerMessage =
  | {
    type: 'session_started'
    sessionEpoch: number
  }
  | {
    type: 'connection_status'
    status: 'live' | 'disconnected'
    sessionEpoch?: number
  }
  | {
    type: 'robot_state'
    sessionEpoch?: number
    sequence: number
    observedAtMs: number
    mode: RobotMode
    commandedPose: Pose
    actualPose: Pose
  }
  | {
    type: 'command_status'
    sessionEpoch?: number
    commandId?: string
    status: CommandStatus
    message?: string
  }
  | {
    type: 'command_reconciliation'
    sessionEpoch: number
    commandId: string
    originalSessionEpoch: number
    resolvedStatus: CommandStatus
    reason: string
  }
  | {
    type: 'fault_status'
    sessionEpoch?: number
    fault: Exclude<ActiveFault, null>
    enabled: boolean
  }

function createCommandId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID()
  }

  return `command-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function isExpired(message: ServerMessage, currentEpoch: number | null) {
  return (
    currentEpoch !== null &&
    'sessionEpoch' in message &&
    typeof message.sessionEpoch === 'number' &&
    message.sessionEpoch < currentEpoch
  )
}

export function useRobotSocket(url: string) {
  const socketRef = useRef<WebSocket | null>(null)
  const observedAtRef = useRef<number | null>(null)
  const reconnectTimerRef = useRef<number | null>(null)
  const currentSessionEpochRef = useRef<number | null>(null)
  const commandStatusRef = useRef<CommandStatus | null>(null)
  const sentCommandRef = useRef<SentCommand | null>(null)
  const nextSystemEventId = useRef(1)

  const [connectionState, setConnectionState] =
    useState<ConnectionState>('connecting')

  const [robotState, setRobotState] =
    useState<RobotState | null>(null)

  const [commandStatus, setCommandStatusState] =
    useState<CommandStatus | null>(null)

  const [commandReconciled, setCommandReconciled] = useState(false)

  const [failureMessage, setFailureMessage] =
    useState<string | null>(null)

  const [telemetryState, setTelemetryState] =
    useState<TelemetryState>('stale')

  const [telemetryAgeMs, setTelemetryAgeMs] = useState(0)

  const [activeFault, setActiveFault] =
    useState<ActiveFault>(null)

  const [sentCommand, setSentCommandState] =
    useState<SentCommand | null>(null)

  const [systemEvents, setSystemEvents] = useState<SocketSystemEvent[]>([])

  const appendSystemEvent = useCallback((title: string) => {
    setSystemEvents((current) => [
      ...current,
      {
        id: nextSystemEventId.current++,
        title,
      },
    ])
  }, [])

  const setCommandStatus = useCallback((status: CommandStatus | null) => {
    commandStatusRef.current = status
    setCommandStatusState(status)
  }, [])

  useEffect(() => {
    let active = true

    function scheduleReconnect() {
      if (!active || reconnectTimerRef.current !== null) return

      reconnectTimerRef.current = window.setTimeout(() => {
        reconnectTimerRef.current = null
        connect()
      }, RECONNECT_DELAY_MS)
    }

    function markDisconnected() {
      setConnectionState('disconnected')

      if (
        sentCommandRef.current &&
        (
          commandStatusRef.current === 'acknowledged' ||
          commandStatusRef.current === 'executing'
        )
      ) {
        setCommandStatus('unknown')
        setCommandReconciled(false)
        setFailureMessage(
          'Connection was lost after acknowledgement. The command may have completed. Automatic retry is disabled until reconciliation.',
        )
        appendSystemEvent('connection lost')
      }
    }

    function connect() {
      if (!active) return

      setConnectionState('connecting')
      const socket = new WebSocket(url)
      socketRef.current = socket

      socket.onmessage = (event) => {
        if (!active) return

        const message = JSON.parse(event.data) as ServerMessage

        if (isExpired(message, currentSessionEpochRef.current)) {
          appendSystemEvent(
            `ignored event from expired session epoch ${message.sessionEpoch}`,
          )
          return
        }

        if (message.type === 'session_started') {
          currentSessionEpochRef.current = message.sessionEpoch
          appendSystemEvent(`new session epoch started ${message.sessionEpoch}`)
          return
        }

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
          if (
            message.commandId &&
            sentCommandRef.current &&
            message.commandId !== sentCommandRef.current.id
          ) {
            return
          }

          setCommandStatus(message.status)
          setCommandReconciled(false)

          setFailureMessage(
            isCommandProblem(message.status)
              ? message.message ?? 'Command did not complete.'
              : null,
          )
        }

        if (message.type === 'command_reconciliation') {
          if (message.commandId !== sentCommandRef.current?.id) {
            return
          }

          setCommandStatus(message.resolvedStatus)
          setCommandReconciled(true)
          setFailureMessage(null)
          appendSystemEvent('command outcome reconciled')
        }

        if (message.type === 'fault_status') {
          setActiveFault(
            message.enabled ? message.fault : null,
          )
          if (!message.enabled) {
            setCommandStatus(null)
            setCommandReconciled(false)
            setFailureMessage(null)
          }
        }
      }

      socket.onclose = () => {
        if (!active) return

        markDisconnected()
        scheduleReconnect()
      }
    }

    connect()

    const timer = window.setInterval(() => {
      if (observedAtRef.current === null) return

      const age = computeTelemetryAge(observedAtRef.current)

      setTelemetryAgeMs(age)
      setTelemetryState(classifyTelemetry(age))
    }, 100)

    return () => {
      window.clearInterval(timer)
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current)
      }
      active = false
      socketRef.current?.close()
    }
  }, [appendSystemEvent, setCommandStatus, url])

  const send = useCallback((message: unknown) => {
    socketRef.current?.send(JSON.stringify(message))
  }, [])

  const sendCommand = useCallback(
    (command: CommandName) => {
      setCommandStatus('sent')
      setCommandReconciled(false)
      setFailureMessage(null)

      const commandId = createCommandId()
      const nextCommand = {
        id: commandId,
        command,
      }

      sentCommandRef.current = nextCommand
      setSentCommandState(nextCommand)

      send({
        type: 'command',
        commandId,
        command,
        sessionEpoch: currentSessionEpochRef.current ?? 0,
      })
    },
    [send, setCommandStatus],
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
    commandReconciled,
    failureMessage,
    telemetryState,
    telemetryAgeMs,
    activeFault,
    sentCommand,
    systemEvents,
    moveForward,
    rotateRight,
    enableFault,
    clearFault,
    emergencyStop,
    reset,
  }
}
