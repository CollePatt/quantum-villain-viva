// @vitest-environment node
// The OpenAI SDK refuses to run in a browser-like (jsdom) environment, so these run in Node.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import gradeExam from '../api/grade-exam'
import realtimeToken from '../api/realtime-token'

type Handler = (request: IncomingMessage, response: ServerResponse) => Promise<void>

const servers: Server[] = []
const savedEnv = { ...process.env }

async function listen(handle: (request: IncomingMessage, response: ServerResponse) => void) {
  const server = createServer(handle)
  servers.push(server)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`
}

const serve = (handler: Handler) => listen((request, response) => void handler(request, response))

// Stands in for api.openai.com and keeps the body of every request it receives.
async function fakeOpenAI(status: number, body: unknown) {
  const received: string[] = []
  const url = await listen((request, response) => {
    let text = ''
    request.on('data', (chunk) => (text += chunk))
    request.on('end', () => {
      received.push(text)
      response.writeHead(status, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify(body))
    })
  })
  process.env.OPENAI_BASE_URL = `${url}/v1`
  return received
}

const metrics = {
  sessionStartedAt: null,
  sessionEndedAt: null,
  durationMs: 0,
  firstResponseLatencyMs: null,
  promptLatenciesMs: [],
  interruptions: 0,
  transcriptItems: 0,
}

// Multiple choice grades locally, so these calls never need OpenAI.
const choiceRound = JSON.stringify({
  topicId: 'spin',
  turns: [{ questionId: 'spin-c2', question: 'How many results?', answer: 'B. Two', choiceIndex: 1 }],
  metrics,
})

function post(url: string, body: string, ip: string, headers: Record<string, string> = {}) {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip, ...headers },
    body,
  })
}

beforeEach(() => {
  // As deployed: Vercel turns the rate limit on by default.
  process.env.VERCEL = '1'
  process.env.RATE_LIMIT_MAX = '2'
  delete process.env.RATE_LIMIT_ENABLED
  delete process.env.VIVA_ACCESS_CODE
  delete process.env.VIVA_ADMIN_CODE
  process.env.OPENAI_API_KEY = ''
})

afterEach(() => {
  servers.splice(0).forEach((server) => server.close())
  process.env = { ...savedEnv }
  vi.restoreAllMocks()
})

describe('hosted API routes', () => {
  it('counts requests per route, whatever the query string', async () => {
    const url = `${await serve(gradeExam)}/api/grade-exam`
    const statuses = []
    for (const query of ['?a=1', '?a=2', '?a=3']) {
      statuses.push((await post(`${url}${query}`, choiceRound, '203.0.113.1')).status)
    }
    expect(statuses).toEqual([200, 200, 429])
  })

  it('counts wrong access codes toward the limit', async () => {
    process.env.VIVA_ACCESS_CODE = 'right-code'
    const url = `${await serve(realtimeToken)}/api/realtime-token`
    const body = JSON.stringify({ topicId: 'spin' })
    const statuses = []
    for (const guess of ['guess-1', 'guess-2', 'guess-3']) {
      statuses.push((await post(url, body, '203.0.113.2', { 'X-Viva-Access-Code': guess })).status)
    }
    expect(statuses).toEqual([401, 401, 429])
  })

  it('caps what a grading request can send to the grader', async () => {
    process.env.OPENAI_API_KEY = 'sk-test'
    const received = await fakeOpenAI(400, { error: { message: 'rejected by the fake' } })
    const url = `${await serve(gradeExam)}/api/grade-exam`
    const response = await post(
      url,
      JSON.stringify({
        topicId: 'tunneling',
        turns: [{ questionId: 'tunneling-1', question: 'Why?', answer: 'tunneling '.repeat(100_000) }],
        metrics: { ...metrics, promptLatenciesMs: Array(10_000).fill(5), smuggled: 'x'.repeat(100_000) },
      }),
      '203.0.113.3',
    )

    // The grader failed, so the round falls back to the local grader.
    expect(response.status).toBe(200)
    expect(received).toHaveLength(1)
    expect(received[0].length).toBeLessThan(30_000)
    expect(received[0]).not.toContain('smuggled')
  })

  it('keeps OpenAI error text out of the response and mints short-lived secrets', async () => {
    process.env.OPENAI_API_KEY = 'sk-test'
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const received = await fakeOpenAI(401, {
      error: { message: 'Incorrect API key provided: sk-proj-abc***wxyz.', code: 'invalid_api_key' },
    })
    const url = `${await serve(realtimeToken)}/api/realtime-token`
    const response = await post(url, JSON.stringify({ topicId: 'spin' }), '203.0.113.4')

    expect(response.status).toBe(502)
    const text = await response.text()
    expect(text).not.toContain('sk-proj')
    expect(JSON.parse(text).error.message).toBe('Could not start live voice.')
    expect(JSON.parse(received[0]).expires_after.seconds).toBe(120)
  })
})
