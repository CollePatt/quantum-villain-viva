import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

vi.mock('@openai/agents/realtime', () => ({
  RealtimeAgent: vi.fn(),
  RealtimeSession: vi.fn(),
}))

const fetchMock = vi.fn()

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve({
    ok: status < 400,
    status,
    statusText: 'OK',
    json: async () => body,
  })
}

beforeEach(() => {
  fetchMock.mockImplementation((url: string) => {
    if (url.includes('/api/config')) {
      return jsonResponse({
        hasApiKey: false,
        requiresAccessCode: false,
        realtimeModel: 'gpt-realtime-2.1',
        realtimeVoice: 'ash',
        graderModel: 'gpt-4.1-mini',
      })
    }
    if (url.includes('/api/leaderboard')) {
      return jsonResponse({ enabled: true, entries: [] })
    }
    // Grading falls back to the local heuristic.
    return jsonResponse({ error: { message: 'offline' } }, 503)
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  fetchMock.mockReset()
})

describe('App', () => {
  it('collapses a player who misses the measurement, then lets them climb back', async () => {
    const user = userEvent.setup()
    render(<App />)

    expect(
      screen.getByRole('heading', { name: /collapses your score/i }),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: /Tunneling/i }))
    await user.click(screen.getByRole('button', { name: /Be observed/i }))

    // Question 1 is the hard measurement.
    expect(screen.getByLabelText(/Question 1 of 4/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Tier: Physicist/i)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /finite potential barrier/i })).toBeInTheDocument()

    // jsdom has no speech recognition, so the typed answer box shows straight away.
    await user.type(await screen.findByRole('textbox', { name: /Your answer/i }), 'No idea, honestly.')
    await user.click(screen.getByRole('button', { name: /Lock it in/i }))

    // Missed: collapsed to Curious multiple choice.
    expect(await screen.findByRole('status')).toHaveTextContent(/Collapsed/i)
    expect(screen.getByLabelText(/Tier: Curious, 0 of 2/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Its wave leaks through the wall/i }))
    expect(await screen.findByLabelText(/Tier: Curious, 1 of 2/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /It drops off a cliff/i }))

    // Two right in a row: promoted for one more hard question.
    expect(await screen.findByLabelText(/Tier: Physicist/i)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /wider or taller/i })).toBeInTheDocument()
    await user.type(
      await screen.findByRole('textbox', { name: /Your answer/i }),
      'The probability decreases exponentially with barrier width, and decreases as the barrier height exceeds the particle energy.',
    )
    await user.click(screen.getByRole('button', { name: /Final answer/i }))

    const results = await screen.findByRole('region', { name: /Results/i }, { timeout: 6000 })
    expect(within(results).getByText(/Climbed back to Physicist/i)).toBeInTheDocument()
    expect(within(results).getByLabelText(/points/i)).toBeInTheDocument()
    expect(within(results).getAllByText(/^Q[1234]$/)).toHaveLength(4)
    expect(within(results).getByRole('button', { name: /Share score/i })).toBeInTheDocument()
  }, 15000)

  it('opens the scoreboard sheet from the home screen', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: /Open scoreboard/i }))
    expect(await screen.findByRole('dialog', { name: /Scoreboard/i })).toBeInTheDocument()
    expect(await screen.findByText(/No scores yet/i)).toBeInTheDocument()
  })
})
