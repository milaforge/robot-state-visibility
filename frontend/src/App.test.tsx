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
        name: /Move forward/,
      }),
    ).toBeDisabled()

    expect(
      screen.getByRole('switch', {
        name: 'Emergency stop',
      }),
    ).toBeEnabled()
  })

  it('shows a failure after an acknowledged rotation', async () => {
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
        name: /Demo scenarios/,
      }),
    )

    await user.click(
      screen.getByRole('switch', {
        name: /Rotation failure/,
      }),
    )

    act(() => {
      MockWebSocket.instance.emit({
        type: 'fault_status',
        fault: 'rotation_failure',
        enabled: true,
      })
    })

    await user.click(
      screen.getByRole('button', {
        name: /Rotate right/,
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
          'Rotation did not complete. Robot state is unchanged. Clear the fault and retry.',
      })
    })

    expect(screen.getAllByText('FAILED').length).toBeGreaterThan(0)

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Rotation did not complete',
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

    expect(screen.getByText(/stale/i)).toBeInTheDocument()

    expect(
      screen.getByRole('button', {
        name: /Move forward/,
      }),
    ).toBeDisabled()
  })

  it('closes the demo scenarios menu when clicking outside it', async () => {
    vi.stubGlobal('WebSocket', MockWebSocket)

    const user = userEvent.setup()

    render(<App />)

    await user.click(
      screen.getByRole('button', {
        name: /Demo scenarios/,
      }),
    )

    expect(
      screen.getByRole('switch', {
        name: /Telemetry delay/,
      }),
    ).toBeInTheDocument()

    await user.click(
      screen.getByText('Stop control is simulated and not safety-rated.'),
    )

    expect(
      screen.queryByRole('switch', {
        name: /Telemetry delay/,
      }),
    ).not.toBeInTheDocument()
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
        commandedPose: { x: 0, y: 0, heading: 0 },
        actualPose: { x: 0, y: 0, heading: 0 },
      })
    })

    expect(screen.getByText('Commanded')).toBeInTheDocument()
    expect(screen.getByText('Observed')).toBeInTheDocument()
    expect(screen.getByText('X')).toBeInTheDocument()
    expect(screen.getAllByText('0.0').length).toBeGreaterThan(0)

    await user.click(
      screen.getByRole('button', {
        name: /Move forward/,
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

    expect(screen.getByTestId('commanded-robot')).toHaveStyle({
      left: '60%',
      top: '50%',
    })
    expect(screen.getAllByText('EXECUTING').length).toBeGreaterThan(0)
  })

  it('shows live when the backend reports a live connection', () => {
    vi.stubGlobal('WebSocket', MockWebSocket)

    render(<App />)

    expect(screen.getByText('Offline')).toBeInTheDocument()

    act(() => {
      MockWebSocket.instance.emit({
        type: 'connection_status',
        status: 'live',
      })
    })

    expect(screen.getByText('Connection LIVE')).toBeInTheDocument()
  })

  it('shows connecting, live, then disconnected', () => {
    vi.stubGlobal('WebSocket', MockWebSocket)

    render(<App />)

    expect(screen.getByText('Offline')).toBeInTheDocument()

    act(() => {
      MockWebSocket.instance.emit({
        type: 'connection_status',
        status: 'live',
      })
    })

    expect(screen.getByText('Connection LIVE')).toBeInTheDocument()

    act(() => {
      MockWebSocket.instance.disconnect()
    })

    expect(screen.getByText('Offline')).toBeInTheDocument()
  })

  it('renders the project title', () => {
    render(<App />)

    expect(
      screen.getByRole('heading', {
        name: 'Robot State',
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
        name: /Move forward/,
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
      screen.getByRole('switch', {
        name: 'Emergency stop',
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

    expect(screen.getAllByText('ABORTED').length).toBeGreaterThan(0)
    expect(
      screen.getByText('Emergency stop active'),
    ).toBeInTheDocument()

    expect(
      screen.getByRole('button', {
        name: /Move forward/,
      }),
    ).toBeDisabled()
  })

  it('records the command sent by the operator', async () => {
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
        name: /Move forward/,
      }),
    )

    expect(
      screen.getByText('MOVE FORWARD'),
    ).toBeInTheDocument()
  })

  it('toggles emergency stop and faults with one click', async () => {
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

    const emergencyStop = screen.getByRole('switch', {
      name: 'Emergency stop',
    })

    expect(emergencyStop).toHaveAttribute(
      'aria-checked',
      'false',
    )

    await user.click(emergencyStop)

    let sent =
      MockWebSocket.instance.sent[
        MockWebSocket.instance.sent.length - 1
      ]

    expect(JSON.parse(sent)).toEqual({
      type: 'command',
      command: 'emergency_stop',
    })

    act(() => {
      MockWebSocket.instance.emit({
        type: 'robot_state',
        sequence: 2,
        observedAtMs: Date.now(),
        mode: 'emergency_stopped',
        commandedPose: { x: 0, y: 0, heading: 0 },
        actualPose: { x: 0, y: 0, heading: 0 },
      })
    })

    const releaseStop = screen.getByRole('switch', {
      name: 'Release emergency stop',
    })

    expect(releaseStop).toHaveAttribute(
      'aria-checked',
      'true',
    )

    await user.click(releaseStop)

    sent =
      MockWebSocket.instance.sent[
        MockWebSocket.instance.sent.length - 1
      ]

    expect(JSON.parse(sent)).toEqual({
      type: 'command',
      command: 'reset',
    })

    await user.click(
      screen.getByRole('button', {
        name: /Demo scenarios/,
      }),
    )

    const telemetryDelay = screen.getByRole('switch', {
      name: /Telemetry delay/,
    })

    expect(telemetryDelay).toHaveAttribute(
      'aria-checked',
      'false',
    )

    await user.click(telemetryDelay)

    sent =
      MockWebSocket.instance.sent[
        MockWebSocket.instance.sent.length - 1
      ]

    expect(JSON.parse(sent)).toEqual({
      type: 'set_fault',
      fault: 'telemetry_delay',
    })

    act(() => {
      MockWebSocket.instance.emit({
        type: 'fault_status',
        fault: 'telemetry_delay',
        enabled: true,
      })
    })

    expect(telemetryDelay).toHaveAttribute(
      'aria-checked',
      'true',
    )

    await user.click(telemetryDelay)

    sent =
      MockWebSocket.instance.sent[
        MockWebSocket.instance.sent.length - 1
      ]

    expect(JSON.parse(sent)).toEqual({
      type: 'clear_fault',
    })
  })

})
