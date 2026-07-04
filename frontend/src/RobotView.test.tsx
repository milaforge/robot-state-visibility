import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import RobotView from './RobotView'

describe('RobotView', () => {
  it('keeps the observed robot centered', () => {
    render(
      <RobotView
        robotState={{
          mode: 'idle',
          commandedPose: {
            x: 1,
            y: 1,
            heading: 90,
          },
          actualPose: {
            x: 0.5,
            y: 0.5,
            heading: 45,
          },
        }}
      />,
    )

    expect(
      screen.getByTestId('observed-robot'),
    ).toBeInTheDocument()

    expect(
      screen.getByTestId('commanded-robot'),
    ).toHaveStyle({
      left: '55%',
      top: '45%',
    })
  })

  it('shows commanded and observed heading separately', () => {
    render(
      <RobotView
        robotState={{
          mode: 'idle',
          commandedPose: {
            x: 0,
            y: 0,
            heading: 90,
          },
          actualPose: {
            x: 0,
            y: 0,
            heading: 45,
          },
        }}
      />,
    )

    expect(
      screen.getByTestId('commanded-heading'),
    ).toHaveStyle({
      transform: 'rotate(90deg)',
    })

    expect(
      screen.getByTestId('observed-heading'),
    ).toHaveStyle({
      transform: 'rotate(45deg)',
    })
  })
})