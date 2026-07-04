import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import EventLog from './EventLog'

describe('EventLog', () => {
  it('expands and collapses command details', async () => {
    const user = userEvent.setup()

    render(
      <EventLog
        isOpen
        onClose={vi.fn()}
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

    await user.click(command)

    expect(command).toHaveAttribute(
      'aria-expanded',
      'false',
    )
  })
})
