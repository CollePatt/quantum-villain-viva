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

  it('requires the private review code when access control is configured', async () => {
    const app = createApp({ apiKey: 'sk-test', accessCode: 'review-code' })
    const response = await request(app)
      .post('/api/realtime-token')
      .send({ topicId: 'tunneling' })

    expect(response.status).toBe(401)
    expect(response.body.error.code).toBe('invalid_access_code')
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

  it('reuses sealed grades, checks multiple choice, and signs a full round', async () => {
    const topic = getTopicById('spin')
    let graderCalls = 0
    const app = createApp({
      apiKey: 'sk-test',
      gradeWithOpenAI: async (_topic, turns, examMetrics) => {
        graderCalls += 1
        return {
          topicId: 'spin',
          totalScore: 0,
          maxScore: turns.length * 2,
          perQuestion: turns.map((turn) => ({
            questionId: turn.questionId,
            score: 0,
            maxScore: 2,
            correctIdeas: [],
            missingIdeas: [],
            misconception: null,
            feedback: 'Missed the core idea.',
          })),
          summary: '',
          reviewSuggestions: [],
          measuredBehavior: examMetrics,
          source: 'openai',
          createdAt: new Date().toISOString(),
        }
      },
    })
    const measurement = {
      questionId: 'spin-1',
      question: topic.questions[0].prompt,
      answer: 'It is a spinning ball.',
    }

    // The measurement is graded on its own, mid-round.
    const first = await request(app).post('/api/grade-exam').send({ topicId: 'spin', turns: [measurement], metrics })
    expect(first.body.perQuestion[0].score).toBe(0)
    expect(first.body.scoreToken).toBeUndefined()
    const seal = first.body.seals['spin-1']
    expect(seal).toBeTruthy()

    // Collapsed to Curious: right, wrong, right, so no promotion.
    const picks = [true, false, true]
    const turns = [
      { ...measurement, seal },
      ...topic.curiousQuestions.map((question, index) => {
        const choiceIndex = picks[index] ? question.answer! : (question.answer! + 1) % 3
        return {
          questionId: question.id,
          question: question.prompt,
          answer: question.choices![choiceIndex],
          choiceIndex,
        }
      }),
    ]
    const final = await request(app).post('/api/grade-exam').send({ topicId: 'spin', turns, metrics })
    expect(final.status).toBe(200)
    expect(final.body.perQuestion.map((grade: { score: number }) => grade.score)).toEqual([0, 2, 0, 2])
    expect(final.body.scoreToken).toBeTruthy()
    // The sealed measurement was not sent to the grader a second time.
    expect(graderCalls).toBe(1)
  })

  it('returns a created client secret when the key boundary is mocked', async () => {
    const app = createApp({
      apiKey: 'sk-test',
      accessCode: 'review-code',
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
      .set('X-Viva-Access-Code', 'review-code')
      .send({ topicId: 'harmonic-oscillator' })

    expect(response.status).toBe(200)
    expect(response.body.clientSecret).toBe('ek_test')
    expect(response.body.realtimeVoice).toBe('ash')
  })
})
