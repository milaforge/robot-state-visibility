import { useEffect, useRef, useState } from 'react'

import type { EventEntry } from './useEventHistory'

type EventLogProps = {
  events: EventEntry[]
  isOpen: boolean
  onClose: () => void
}

function formatToken(value: string) {
  return value.replaceAll('_', ' ')
}

function statusClass(status: string) {
  return `lifecycle-status lifecycle-status--${status.toLowerCase()}`
}

export default function EventLog({
  events,
  isOpen,
  onClose,
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

  const lastOpenedId = useRef<number | null>(null)
  const latestCommandId = commands[0]?.id

  useEffect(() => {
    if (
      latestCommandId === undefined ||
      latestCommandId === lastOpenedId.current
    ) {
      return
    }

    lastOpenedId.current = latestCommandId
    setExpandedIds(new Set([latestCommandId]))
  }, [latestCommandId])

  function toggle(id: number) {
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
    <>
      {isOpen && (
        <button
          className="drawer-backdrop"
          type="button"
          aria-label="Close recent events"
          onClick={onClose}
        />
      )}

      <aside
        className={
          isOpen
            ? 'event-drawer event-drawer--open'
            : 'event-drawer'
        }
        aria-hidden={!isOpen}
        aria-labelledby="event-history-title"
      >
        <header className="drawer-header">
          <div>
            <p className="section-label">Activity</p>
            <h2 id="event-history-title">Recent events</h2>
          </div>

          <button
            className="icon-button"
            type="button"
            aria-label="Close recent events"
            onClick={onClose}
          >
            ×
          </button>
        </header>

        <div className="drawer-content">
          <section className="event-section">
            <header className="event-section-header">
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
                        onClick={() => toggle(event.id)}
                      >
                        <span className="command-event-main">
                          <span className="command-icon">
                            →
                          </span>

                          <span>
                            <small>Command</small>
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
                          >
                            ›
                          </span>
                        </span>
                      </button>

                      {expanded && (
                        <div className="command-event-details">
                          <ol className="command-timeline">
                            {statuses.map((status) => (
                              <li key={status}>
                                <span className="timeline-marker" />
                                <strong>{status}</strong>
                              </li>
                            ))}
                          </ol>
                        </div>
                      )}
                    </article>
                  )
                })
              )}
            </div>
          </section>

          <section className="event-section">
            <header className="event-section-header">
              <h3>System</h3>
              <span>{systemEvents.length}</span>
            </header>

            <div className="system-event-list">
              {systemEvents.map((event) => (
                <article
                  className="system-event"
                  key={event.id}
                >
                  <span
                    className={`system-event-icon system-event-icon--${event.category}`}
                  />

                  <div>
                    <small>
                      {event.category.toUpperCase()}
                    </small>

                    <strong>
                      {formatToken(event.title)}
                    </strong>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>
      </aside>
    </>
  )
}
