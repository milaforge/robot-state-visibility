import { useEffect, useRef, useState } from 'react'

import type {
  ActiveFault,
  CommandStatus,
  ConnectionState,
  RobotMode,
  SentCommand,
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
  activeFault: ActiveFault
  robotMode: RobotMode | undefined
  sentCommand: SentCommand | null
}

export function useEventHistory({
  connectionState,
  commandStatus,
  activeFault,
  robotMode,
  sentCommand,
}: EventHistoryInput) {
  const [events, setEvents] = useState<EventEntry[]>([])
  const nextId = useRef(1)
  const previousFault = useRef<ActiveFault>(null)
  const activeCommandEventId = useRef<number | null>(null)

  function append(
    category: EventCategory,
    title: string,
  ) {
    const id = nextId.current++

    setEvents((current) =>
      [{ id, category, title }, ...current].slice(0, 30),
    )

    return id
  }

  useEffect(() => {
    if (!sentCommand) return

    const id = nextId.current++
    const event: EventEntry = {
      id,
      category: 'command',
      title: sentCommand.command,
      details: [],
    }

    activeCommandEventId.current = id

    setEvents((current) =>
      [event, ...current].slice(0, 30),
    )
  }, [sentCommand])

  useEffect(() => {
    if (
      !commandStatus ||
      activeCommandEventId.current === null
    ) {
      return
    }

    const eventId = activeCommandEventId.current
    const status = commandStatus.toUpperCase()

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
  }, [commandStatus])

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
