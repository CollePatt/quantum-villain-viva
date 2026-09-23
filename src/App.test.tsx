import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

vi.mock('@openai/agents/realtime', () => ({
  RealtimeAgent: vi.fn(),
  RealtimeSession: vi.fn(),
}))

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({
      hasApiKey: false,
      realtimeModel: 'gpt-realtime-2.1',
      realtimeVoice: 'cedar',
      graderModel: 'gpt-5.6-luna',
      openSourceRoadmap: ['Ollama local grader'],
    }),
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  fetchMock.mockReset()
})

describe('App smoke test', () => {
  it('shows the setup state and supports typed demo flow', async () => {
    const user = userEvent.setup()
    render(<App />)

    expect(await screen.findByText('Setup needed')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Typed demo/i })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Measurement/i }))
    await user.click(screen.getByRole('button', { name: /Start exam/i }))

    expect(await screen.findByText(/Typed demo mode is active/i)).toBeInTheDocument()
    expect(screen.getByText(/What does it mean to measure an observable/i)).toBeInTheDocument()
  })
})
