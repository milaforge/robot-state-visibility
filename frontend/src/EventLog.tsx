import {
  useEffect,
  useRef,
  useState,
} from 'react'

import type { EventEntry } from './useEventHistory'

type EventLogProps = {
  events: EventEntry[]
}

function formatToken(value: string) {
  return value.replaceAll('_', ' ')
}

function statusClass(status: string) {
  return `lifecycle-status lifecycle-status--${status.toLowerCase()}`
}

export default function EventLog({
  events,
}: EventLogProps) {
  const commands = events.filter(
    (event) => event.category === 'command',
  )

  const systemEvents = events.filter(
    (event) => event.category !== 'command',
  )

  const [expandedIds, setExpandedIds] = useState<Set<number>>(
    new Set(),
  )

  const lastAutoOpenedId = useRef<number | null>(null)
  const latestCommandId = commands[0]?.id

  useEffect(() => {
    if (
      latestCommandId === undefined ||
      latestCommandId === lastAutoOpenedId.current
    ) {
      return
    }

    lastAutoOpenedId.current = latestCommandId

    setExpandedIds((current) => {
      const next = new Set(current)
      next.add(latestCommandId)
      return next
    })
  }, [latestCommandId])

  function toggleEvent(id: number) {
    setExpandedIds((current) => {
      const next = new Set(current)

      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }

      return next
    })
  }

  return (
    <section
      className="panel event-panel"
      aria-labelledby="event-history-title"
    >
      <header className="panel-header">
        <div>
          <p className="section-label">Activity</p>
          <h2 id="event-history-title">Recent events</h2>
        </div>

        <span className="event-count">
          {events.length} events
        </span>
      </header>

      <div className="event-columns">
        <section className="event-column">
          <header className="event-column-header">
            <h3>Commands</h3>
            <span>{commands.length}</span>
          </header>

          <div className="command-list">
            {commands.length === 0 ? (
              <p className="empty-state">
                No commands issued
              </p>
            ) : (
              commands.map((event) => {
                const expanded = expandedIds.has(event.id)
                const statuses = event.details ?? []
                const currentStatus =
                  statuses[statuses.length - 1] ??
                  'REQUESTED'

                return (
                  <article
                    className="command-event"
                    key={event.id}
                  >
                    <button
                      type="button"
                      className="command-event-summary"
                      aria-expanded={expanded}
                      onClick={() => toggleEvent(event.id)}
                    >
                      <span className="command-event-main">
                        <span className="command-icon">
                          ↗
                        </span>

                        <span>
                          <span className="command-label">
                            Command
                          </span>

                          <strong>
                            {formatToken(
                              event.title,
                            ).toUpperCase()}
                          </strong>
                        </span>
                      </span>

                      <span className="command-event-meta">
                        <span
                          className={statusClass(
                            currentStatus,
                          )}
                        >
                          {currentStatus}
                        </span>

                        <span
                          className={
                            expanded
                              ? 'event-chevron event-chevron--open'
                              : 'event-chevron'
                          }
                          aria-hidden="true"
                        >
                          ›
                        </span>
                      </span>
                    </button>

                    {expanded && (
                      <div className="command-event-details">
                        {statuses.length === 0 ? (
                          <p>Waiting for acknowledgement</p>
                        ) : (
                          <ol className="command-timeline">
                            {statuses.map(
                              (status, index) => (
                                <li key={status}>
                                  <span className="timeline-marker" />

                                  <span>
                                    <strong>
                                      {status}
                                    </strong>

                                    {index === 0 && (
                                      <small>
                                        Backend accepted the
                                        command
                                      </small>
                                    )}
                                  </span>
                                </li>
                              ),
                            )}
                          </ol>
                        )}
                      </div>
                    )}
                  </article>
                )
              })
            )}
          </div>
        </section>

        <section className="event-column event-column--system">
          <header className="event-column-header">
            <h3>System</h3>
            <span>{systemEvents.length}</span>
          </header>

          <div className="system-event-list">
            {systemEvents.length === 0 ? (
              <p className="empty-state">
                No system events
              </p>
            ) : (
              systemEvents.map((event) => (
                <article
                  className="system-event"
                  key={event.id}
                >
                  <span
                    className={`system-event-icon system-event-icon--${event.category}`}
                  />

                  <div>
                    <span>
                      {event.category.toUpperCase()}
                    </span>

                    <strong>
                      {formatToken(event.title)}
                    </strong>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>
      </div>
    </section>
  )
}
