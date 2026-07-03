import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import App from './App'

class MockWebSocket {
  static instance: MockWebSocket

  onmessage: ((event: MessageEvent) => void) | null = null
  onclose: (() => void) | null = null

  constructor() {
    MockWebSocket.instance = this
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
