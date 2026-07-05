import { useEffect, useRef, useState } from 'react'

import type {
  ActiveFault,
  CommandStatus,
  ConnectionState,
  RobotMode,
  SentCommand,
  SocketSystemEvent,
} from './useRobotSocket'

export type EventCategory =
  | 'command'
  | 'connection'
  | 'fault'
  | 'mode'

export type EventEntry = {
  id: number
  category: EventCategory
  title: string
  details?: string[]
}

type EventHistoryInput = {
  connectionState: ConnectionState
  commandStatus: CommandStatus | null
  commandReconciled: boolean
  activeFault: ActiveFault
  robotMode: RobotMode | undefined
  sentCommand: SentCommand | null
  systemEvents: SocketSystemEvent[]
}

export function useEventHistory({
  connectionState,
  commandStatus,
  commandReconciled,
  activeFault,
  robotMode,
  sentCommand,
  systemEvents,
}: EventHistoryInput) {
  const [events, setEvents] = useState<EventEntry[]>([])
  const nextId = useRef(1)
  const previousFault = useRef<ActiveFault>(null)
  const activeCommandEventId = useRef<number | null>(null)
  const lastSystemEventId = useRef(0)

  function append(
    category: EventCategory,
    title: string,
    details?: string[],
  ) {
    const id = nextId.current++

    setEvents((current) =>
      [{ id, category, title, details }, ...current].slice(0, 30),
    )

    return id
  }

  useEffect(() => {
    if (!sentCommand) return

    const id = append('command', sentCommand.command, [])
    activeCommandEventId.current = id
  }, [sentCommand])

  useEffect(() => {
    if (
      !commandStatus ||
      activeCommandEventId.current === null
    ) {
      return
    }

    const eventId = activeCommandEventId.current
    const status =
      commandStatus === 'completed' && commandReconciled
        ? 'COMPLETED — RECONCILED'
        : commandStatus.toUpperCase()

    setEvents((current) =>
      current.map((event) => {
        if (event.id !== eventId) return event

        const details = event.details ?? []

        if (details.includes(status)) {
          return event
        }

        return {
          ...event,
          details: [...details, status],
        }
      }),
    )
  }, [commandReconciled, commandStatus])

  useEffect(() => {
    const nextEvents = systemEvents.filter(
      (event) => event.id > lastSystemEventId.current,
    )

    nextEvents.forEach((event) => {
      append('connection', event.title)
      lastSystemEventId.current = event.id
    })
  }, [systemEvents])

  useEffect(() => {
    if (connectionState !== 'connecting') {
      append(
        'connection',
        `Connection ${connectionState.toUpperCase()}`,
      )
    }
  }, [connectionState])

  useEffect(() => {
    if (activeFault) {
      append(
        'fault',
        `Enabled ${activeFault}`,
      )
    } else if (previousFault.current) {
      append(
        'fault',
        `Cleared ${previousFault.current}`,
      )
    }

    previousFault.current = activeFault
  }, [activeFault])

  useEffect(() => {
    if (robotMode === 'emergency_stopped') {
      append('mode', 'Emergency stop activated')
    }

    if (robotMode === 'idle') {
      append('mode', 'Robot entered idle mode')
    }
  }, [robotMode])

  return events
}
