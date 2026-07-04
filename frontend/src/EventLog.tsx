import type { EventEntry } from './useEventHistory'

type EventLogProps = {
  events: EventEntry[]
}

export default function EventLog({
  events,
}: EventLogProps) {
  return (
    <section aria-labelledby="event-history-title">
      <h2 id="event-history-title">Recent events</h2>

      {events.length === 0 ? (
        <p>No events</p>
      ) : (
        <ol>
          {events.map((event) => (
            <li key={event.id}>{event.message}</li>
          ))}
        </ol>
      )}
    </section>
  )
}
