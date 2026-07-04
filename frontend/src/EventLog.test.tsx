import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import EventLog from './EventLog'

describe('EventLog', () => {
  it('expands and collapses a command lifecycle', async () => {
    const user = userEvent.setup()

    render(
      <EventLog
        events={[
          {
            id: 1,
            category: 'command',
            title: 'move_forward',
            details: [
              'ACKNOWLEDGED',
              'EXECUTING',
              'COMPLETED',
            ],
          },
        ]}
      />,
    )

    const command = screen.getByRole('button', {
      name: /MOVE FORWARD/,
    })

    expect(command).toHaveAttribute(
      'aria-expanded',
      'true',
    )

    expect(
      screen.getByText('ACKNOWLEDGED'),
    ).toBeInTheDocument()

    await user.click(command)

    expect(command).toHaveAttribute(
      'aria-expanded',
      'false',
    )
  })
})
