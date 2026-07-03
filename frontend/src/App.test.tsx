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
})
