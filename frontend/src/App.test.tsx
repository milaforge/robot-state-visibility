import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import App from './App'

class MockWebSocket {
  static instance: MockWebSocket

  onmessage: ((event: MessageEvent) => void) | null = null
  onclose: (() => void) | null = null

  sent: string[] = []

  constructor() {
    MockWebSocket.instance = this
  }

  send(data: string) {
    this.sent.push(data)
  }

  close() { }

  emit(message: unknown) {
    this.onmessage?.(
      new MessageEvent('message', {
        data: JSON.stringify(message),
      }),
    )
  }

  disconnect() {
    this.onclose?.()
  }
}

describe('App', () => {

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('keeps emergency stop available when telemetry is stale', () => {
    vi.stubGlobal('WebSocket', MockWebSocket)

    render(<App />)

    act(() => {
      MockWebSocket.instance.emit({
        type: 'connection_status',
        status: 'live',
      })

      MockWebSocket.instance.emit({
        type: 'robot_state',
        sequence: 1,
        observedAtMs: Date.now() - 1100,
        mode: 'idle',
        commandedPose: { x: 1, y: 0, heading: 0 },
        actualPose: { x: 0, y: 0, heading: 0 },
      })
    })

    expect(
      screen.getByRole('button', {
        name: 'Move forward',
      }),
    ).toBeDisabled()

    expect(
      screen.getByRole('button', {
        name: 'Simulated emergency stop',
      }),
    ).toBeEnabled()
  })

  it('shows a failure after an acknowledged interaction', async () => {
    vi.stubGlobal('WebSocket', MockWebSocket)

    const user = userEvent.setup()

    render(<App />)

    act(() => {
      MockWebSocket.instance.emit({
        type: 'connection_status',
        status: 'live',
      })

      MockWebSocket.instance.emit({
        type: 'robot_state',
        mode: 'idle',
        sequence: 1,
        observedAtMs: Date.now(),
        commandedPose: { x: 0, y: 0, heading: 0 },
        actualPose: { x: 0, y: 0, heading: 0 },
      })
    })

    await user.click(
      screen.getByRole('button', {
        name: 'Enable interaction failure',
      }),
    )

    act(() => {
      MockWebSocket.instance.emit({
        type: 'fault_status',
        fault: 'interaction_failure',
        enabled: true,
      })
    })

    await user.click(
      screen.getByRole('button', {
        name: 'Interact',
      }),
    )

    act(() => {
      MockWebSocket.instance.emit({
        type: 'command_status',
        status: 'acknowledged',
      })

      MockWebSocket.instance.emit({
        type: 'command_status',
        status: 'executing',
      })

      MockWebSocket.instance.emit({
        type: 'command_status',
        status: 'failed',
        message:
          'Interaction did not complete. Robot state is unchanged. Clear the fault and retry.',
      })
    })

    expect(screen.getByText('FAILED')).toBeInTheDocument()

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Interaction did not complete',
    )
  })

  it('disables movement when telemetry is stale', () => {
    vi.stubGlobal('WebSocket', MockWebSocket)

    render(<App />)

    act(() => {
      MockWebSocket.instance.emit({
        type: 'connection_status',
        status: 'live',
      })

      MockWebSocket.instance.emit({
        type: 'robot_state',
        mode: 'idle',
        sequence: 1,
        observedAtMs: Date.now() - 1100,
        commandedPose: { x: 0, y: 0, heading: 0 },
        actualPose: { x: 0, y: 0, heading: 0 },
      })
    })

    expect(screen.getByText('STALE')).toBeInTheDocument()

    expect(
      screen.getByRole('button', {
        name: 'Move forward',
      }),
    ).toBeDisabled()
  })

  it('shows commanded and observed state separately', async () => {
    vi.stubGlobal('WebSocket', MockWebSocket)

    const user = userEvent.setup()

    render(<App />)

    act(() => {
      MockWebSocket.instance.emit({
        type: 'connection_status',
        status: 'live',
      })

      MockWebSocket.instance.emit({
        type: 'robot_state',
        mode: 'idle',
        observedAtMs: Date.now(),
        sequence: 1,
        commandedPost: { x: 0, y: 0, heading: 0 },
        actualPose: { x: 0, y: 0, heading: 0 },
      })
    })

    expect(screen.getByText('Commanded X: 0')).toBeInTheDocument()
    expect(screen.getByText('Observed X: 0')).toBeInTheDocument()

    await user.click(
      screen.getByRole('button', {
        name: 'Move forward',
      }),
    )

    expect(JSON.parse(MockWebSocket.instance.sent[0])).toEqual({
      type: 'command',
      command: 'move_forward',
    })

    act(() => {
      MockWebSocket.instance.emit({
        type: 'command_status',
        status: 'executing',
      })

      MockWebSocket.instance.emit({
        type: 'robot_state',
        mode: 'idle',
        sequence: 1,
        observedAtMs: Date.now(),
        commandedPose: { x: 1, y: 0, heading: 0 },
        actualPose: { x: 0, y: 0, heading: 0 },
      })
    })

    expect(screen.getByText('Commanded X: 1')).toBeInTheDocument()
    expect(screen.getByText('Observed X: 0')).toBeInTheDocument()
    expect(screen.getByText('EXECUTING')).toBeInTheDocument()
  })

  it('shows live when the backend reports a live connection', () => {
    vi.stubGlobal('WebSocket', MockWebSocket)

    render(<App />)

    expect(screen.getByText('CONNECTING')).toBeInTheDocument()

    act(() => {
      MockWebSocket.instance.emit({
        type: 'connection_status',
        status: 'live',
      })
    })

    expect(screen.getByText('LIVE')).toBeInTheDocument()
  })

  it('shows connecting, live, then disconnected', () => {
    vi.stubGlobal('WebSocket', MockWebSocket)

    render(<App />)

    expect(screen.getByText('CONNECTING')).toBeInTheDocument()

    act(() => {
      MockWebSocket.instance.emit({
        type: 'connection_status',
        status: 'live',
      })
    })

    expect(screen.getByText('LIVE')).toBeInTheDocument()

    act(() => {
      MockWebSocket.instance.disconnect()
    })

    expect(screen.getByText('DISCONNECTED')).toBeInTheDocument()
  })

  it('renders the project title', () => {
    render(<App />)

    expect(
      screen.getByRole('heading', {
        name: 'Robot State and Command Visibility',
      }),
    ).toBeInTheDocument()
  })
  it('shows when emergency stop interrupts movement', async () => {
    vi.stubGlobal('WebSocket', MockWebSocket)

    const user = userEvent.setup()

    render(<App />)

    act(() => {
      MockWebSocket.instance.emit({
        type: 'connection_status',
        status: 'live',
      })

      MockWebSocket.instance.emit({
        type: 'robot_state',
        sequence: 1,
        observedAtMs: Date.now(),
        mode: 'idle',
        commandedPose: { x: 0, y: 0, heading: 0 },
        actualPose: { x: 0, y: 0, heading: 0 },
      })
    })

    await user.click(
      screen.getByRole('button', {
        name: 'Move forward',
      }),
    )

    act(() => {
      MockWebSocket.instance.emit({
        type: 'command_status',
        status: 'executing',
      })

      MockWebSocket.instance.emit({
        type: 'robot_state',
        sequence: 2,
        observedAtMs: Date.now(),
        mode: 'idle',
        commandedPose: { x: 1, y: 0, heading: 0 },
        actualPose: { x: 0.3, y: 0, heading: 0 },
      })
    })

    await user.click(
      screen.getByRole('button', {
        name: 'Simulated emergency stop',
      }),
    )

    act(() => {
      MockWebSocket.instance.emit({
        type: 'command_status',
        status: 'aborted',
        message:
          'Movement was interrupted by the simulated emergency stop.',
      })

      MockWebSocket.instance.emit({
        type: 'robot_state',
        sequence: 3,
        observedAtMs: Date.now(),
        mode: 'emergency_stopped',
        commandedPose: { x: 0.3, y: 0, heading: 0 },
        actualPose: { x: 0.3, y: 0, heading: 0 },
      })
    })

    expect(screen.getByText('ABORTED')).toBeInTheDocument()
    expect(screen.getByText('EMERGENCY_STOPPED')).toBeInTheDocument()

    expect(
      screen.getByRole('button', {
        name: 'Move forward',
      }),
    ).toBeDisabled()
  })

})
