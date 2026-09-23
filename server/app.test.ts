import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createApp } from './app'
import type { ExamMetrics } from '../src/domain/schemas'
import { getTopicById } from '../src/domain/topics'

const metrics: ExamMetrics = {
  sessionStartedAt: '2026-09-23T18:00:00.000Z',
  sessionEndedAt: '2026-09-23T18:01:00.000Z',
  durationMs: 60_000,
  firstResponseLatencyMs: null,
  promptLatenciesMs: [],
  interruptions: 0,
  transcriptItems: 0,
}

describe('API routes', () => {
  it('reports missing key before creating realtime credentials', async () => {
    const app = createApp({ apiKey: '' })
    const response = await request(app)
      .post('/api/realtime-token')
      .send({ topicId: 'tunneling' })

    expect(response.status).toBe(503)
    expect(response.body.error.code).toBe('missing_openai_api_key')
  })

  it('rejects an invalid topic', async () => {
    const app = createApp({ apiKey: '' })
    const response = await request(app)
      .post('/api/realtime-token')
      .send({ topicId: 'alchemy' })

    expect(response.status).toBe(400)
  })

  it('rejects malformed grading requests', async () => {
    const app = createApp({ apiKey: '' })
    const response = await request(app).post('/api/grade-exam').send({ topicId: 'spin' })

    expect(response.status).toBe(400)
  })

  it('returns local scorecards when no key is configured', async () => {
    const topic = getTopicById('entanglement')
    const app = createApp({ apiKey: '' })
    const response = await request(app)
      .post('/api/grade-exam')
      .send({
        topicId: topic.id,
        turns: [
          {
            questionId: topic.questions[0].id,
            question: topic.questions[0].prompt,
            answer: 'An entangled state cannot be factored into individual particle states.',
          },
        ],
        metrics,
      })

    expect(response.status).toBe(200)
    expect(response.body.source).toBe('local-heuristic')
    expect(response.body.topicId).toBe('entanglement')
  })

  it('returns a created client secret when the key boundary is mocked', async () => {
    const app = createApp({
      apiKey: 'sk-test',
      createClientSecret: async () => ({
        value: 'ek_test',
        expires_at: 1_800_000_000,
        session: {
          id: 'sess_test',
          object: 'realtime.session',
          type: 'realtime',
        },
      }),
    })
    const response = await request(app)
      .post('/api/realtime-token')
      .send({ topicId: 'harmonic-oscillator' })

    expect(response.status).toBe(200)
    expect(response.body.clientSecret).toBe('ek_test')
    expect(response.body.realtimeVoice).toBe('marin')
  })
})
