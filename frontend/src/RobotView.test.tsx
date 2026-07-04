import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import RobotView from './RobotView'

describe('RobotView', () => {
  it('renders commanded and observed positions separately', () => {
    render(
      <RobotView
        robotState={{
          mode: 'idle',
          commandedPose: {
            x: 1,
            y: 0,
            heading: 0,
          },
          actualPose: {
            x: 0.5,
            y: 0,
            heading: 0,
          },
        }}
      />,
    )

    expect(
      screen.getByTestId('commanded-robot'),
    ).toHaveAttribute('cx', '18')

    expect(
      screen.getByTestId('observed-robot'),
    ).toHaveAttribute('cx', '14')
  })
})
