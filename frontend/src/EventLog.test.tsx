import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import EventLog from './EventLog'

describe('EventLog', () => {
  it('shows newest events first', () => {
    render(
      <EventLog
        events={[
          {
            id: 2,
            message: 'Command: EXECUTING',
          },
          {
            id: 1,
            message: 'Command: ACKNOWLEDGED',
          },
        ]}
      />,
    )

    const events = screen.getAllByRole('listitem')

    expect(events[0]).toHaveTextContent(
      'Command: EXECUTING',
    )

    expect(events[1]).toHaveTextContent(
      'Command: ACKNOWLEDGED',
    )
  })
})
