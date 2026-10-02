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
  it('plays a full typed round and shows a points scorecard', async () => {
    const user = userEvent.setup()
    render(<App />)

    expect(
      screen.getByRole('heading', { name: /out-think a quantum supervillain/i }),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: /Tunneling/i }))
    await user.click(screen.getByRole('button', { name: /Face Nocturne/i }))

    expect(screen.getByText(/Question 1 of 3/i)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /get through a wall/i })).toBeInTheDocument()

    const answers = [
      'The particle is a spread out wave, so the wave leaks into and through the barrier.',
      'A thicker barrier makes tunneling less likely and the chance drops exponentially.',
      'Nuclear fusion in stars needs particles crossing an energy barrier.',
    ]

    for (const [index, answer] of answers.entries()) {
      // jsdom has no speech recognition, so the typed answer box shows straight away.
      const box = await screen.findByRole('textbox', { name: /Your answer/i })
      await user.clear(box)
      await user.type(box, answer)
      await user.click(screen.getByRole('button', { name: index === 2 ? /Final answer/i : /Lock it in/i }))
    }

    const results = await screen.findByRole('region', { name: /Results/i }, { timeout: 6000 })
    expect(within(results).getByLabelText(/points/i)).toBeInTheDocument()
    expect(within(results).getAllByText(/^Q[123]$/)).toHaveLength(3)
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
