import { useEffect, useRef, useState } from 'react'

import type {
  ActiveFault,
  CommandStatus,
  ConnectionState,
  RobotMode,
} from './useRobotSocket'

export type EventEntry = {
  id: number
  message: string
}

type EventHistoryInput = {
  connectionState: ConnectionState
  commandStatus: CommandStatus | null
  activeFault: ActiveFault
  robotMode: RobotMode | undefined
}

export function useEventHistory({
  connectionState,
  commandStatus,
  activeFault,
  robotMode,
}: EventHistoryInput) {
  const [events, setEvents] = useState<EventEntry[]>([])
  const nextId = useRef(1)
  const previousFault = useRef<ActiveFault>(null)

  function append(message: string) {
    setEvents((current) =>
      [
        {
          id: nextId.current++,
          message,
        },
        ...current,
      ].slice(0, 20),
    )
  }

  useEffect(() => {
    if (connectionState !== 'connecting') {
      append(`Connection: ${connectionState.toUpperCase()}`)
    }
  }, [connectionState])

  useEffect(() => {
    if (commandStatus) {
      append(`Command: ${commandStatus.toUpperCase()}`)
    }
  }, [commandStatus])

  useEffect(() => {
    if (activeFault) {
      append(`Fault enabled: ${activeFault}`)
    } else if (previousFault.current) {
      append(`Fault cleared: ${previousFault.current}`)
    }

    previousFault.current = activeFault
  }, [activeFault])

  useEffect(() => {
    if (robotMode === 'emergency_stopped') {
      append('Robot entered emergency-stop mode')
    }

    if (robotMode === 'idle') {
      append('Robot mode: IDLE')
    }
  }, [robotMode])

  return events
}
