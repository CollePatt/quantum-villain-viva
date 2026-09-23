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
  it('shows the immersive exam shell and supports local preview flow', async () => {
    const user = userEvent.setup()
    render(<App />)

    expect(await screen.findByRole('heading', { name: /Transmission received/i })).toBeInTheDocument()
    expect(screen.queryByText(/Setup status/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Begin transmission/i })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Enter chamber/i }))

    expect(screen.getByRole('button', { name: /Begin transmission/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Transcript/i })).not.toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText(/Topic/i), 'measurement')
    await user.click(screen.getByRole('button', { name: /Begin transmission/i }))

    expect(await screen.findByText(/Question 1 transmitted/i)).toBeInTheDocument()
    expect(
      await screen.findByText(/What does it mean to measure an observable/i, undefined, {
        timeout: 3000,
      }),
    ).toBeInTheDocument()
  })
})
