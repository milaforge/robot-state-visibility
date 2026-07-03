import { describe, expect, it } from 'vitest'

import { classifyTelemetry } from './telemetry'

describe('classifyTelemetry', () => {
  it.each([
    [0, 'live'],
    [249, 'live'],
    [250, 'delayed'],
    [999, 'delayed'],
    [1000, 'stale'],
  ])('classifies %i ms as %s', (age, expected) => {
    expect(classifyTelemetry(age)).toBe(expected)
  })
})
