import 'dotenv/config'
import express, { type Express, type Request, type Response } from 'express'
import OpenAI from 'openai'
import { zodTextFormat } from 'openai/helpers/zod'
import type {
  ClientSecretCreateParams,
  ClientSecretCreateResponse,
} from 'openai/resources/realtime/client-secrets'
import { z } from 'zod'
import { gradeExamLocally } from '../src/domain/grading'
import {
  ExamReportSchema,
  GradeRequestSchema,
  TokenRequestSchema,
  type ExamMetrics,
  type ExamReport,
  type ExamTurn,
  type Topic,
} from '../src/domain/schemas'
import { getTopicById, topics } from '../src/domain/topics'
import { buildGradingPrompt, buildVillainInstructions } from '../src/lib/examPrompts'

const DEFAULT_REALTIME_MODEL = 'gpt-realtime-2.1'
const DEFAULT_REALTIME_VOICE = 'cedar'
const DEFAULT_GRADER_MODEL = 'gpt-4.1-mini'

type CreateClientSecret = (
  params: ClientSecretCreateParams,
) => Promise<ClientSecretCreateResponse>

type GradeWithOpenAI = (
  topic: Topic,
  turns: ExamTurn[],
  metrics: ExamMetrics,
) => Promise<ExamReport>

export type ServerDeps = {
  apiKey?: string
  createClientSecret?: CreateClientSecret
  gradeWithOpenAI?: GradeWithOpenAI
  realtimeModel?: string
  realtimeVoice?: string
  graderModel?: string
}

const ErrorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
})

function getConfig(deps: ServerDeps) {
  const apiKey = deps.apiKey ?? process.env.OPENAI_API_KEY ?? ''
  return {
    apiKey,
    hasApiKey: apiKey.trim().length > 0 && !apiKey.includes('paste-your-key'),
    realtimeModel:
      deps.realtimeModel ?? process.env.OPENAI_REALTIME_MODEL ?? DEFAULT_REALTIME_MODEL,
    realtimeVoice:
      deps.realtimeVoice ?? process.env.OPENAI_REALTIME_VOICE ?? DEFAULT_REALTIME_VOICE,
    graderModel: deps.graderModel ?? process.env.OPENAI_GRADER_MODEL ?? DEFAULT_GRADER_MODEL,
  }
}

function sendValidationError(response: Response, message = 'Request payload is invalid.') {
  response.status(400).json({
    error: {
      code: 'invalid_request',
      message,
    },
  })
}

function sendServerError(response: Response, message: string) {
  response.status(502).json({
    error: {
      code: 'openai_request_failed',
      message,
    },
  })
}

async function defaultCreateClientSecret(
  apiKey: string,
  params: ClientSecretCreateParams,
): Promise<ClientSecretCreateResponse> {
  const client = new OpenAI({ apiKey })
  return client.realtime.clientSecrets.create(params)
}

async function defaultGradeWithOpenAI(
  apiKey: string,
  graderModel: string,
  topic: Topic,
  turns: ExamTurn[],
  metrics: ExamMetrics,
): Promise<ExamReport> {
  const client = new OpenAI({ apiKey })
  const result = await client.responses.parse({
    model: graderModel,
    input: [
      {
        role: 'system',
        content: buildGradingPrompt(topic),
      },
      {
        role: 'user',
        content: JSON.stringify(
          {
            rubric: topic.questions,
            turns,
            requiredShape:
              'Return an ExamReport. Use source "openai", maxScore 6, and preserve measuredBehavior exactly.',
            measuredBehavior: metrics,
          },
          null,
          2,
        ),
      },
    ],
    text: {
      format: zodTextFormat(ExamReportSchema, 'quantum_viva_exam_report'),
    },
  })

  const parsed = result.output_parsed
  if (!parsed) {
    throw new Error('OpenAI returned no structured scorecard.')
  }

  return ExamReportSchema.parse({
    ...parsed,
    topicId: topic.id,
    maxScore: topic.questions.length * 2,
    measuredBehavior: metrics,
    source: 'openai',
    createdAt: new Date().toISOString(),
  })
}

function realtimeSessionParams(
  topic: Topic,
  realtimeModel: string,
  realtimeVoice: string,
): ClientSecretCreateParams {
  return {
    expires_after: {
      anchor: 'created_at',
      seconds: 600,
    },
    session: {
      type: 'realtime',
      model: realtimeModel,
      instructions: buildVillainInstructions(topic),
      output_modalities: ['audio'],
      max_output_tokens: 900,
      tracing: null,
      audio: {
        input: {
          noise_reduction: {
            type: 'near_field',
          },
          transcription: {
            model: 'gpt-transcribe',
            prompt:
              'Quantum mechanics oral exam answer. Preserve physics vocabulary and symbols when possible.',
          },
          turn_detection: {
            type: 'semantic_vad',
            create_response: false,
            interrupt_response: true,
            eagerness: 'medium',
          },
        },
        output: {
          voice: realtimeVoice,
          speed: 0.93,
        },
      },
      reasoning: {
        effort: 'low',
      },
    },
  }
}

export function createApp(deps: ServerDeps = {}): Express {
  const app = express()

  app.use(express.json({ limit: '1mb' }))

  app.get('/api/health', (_request: Request, response: Response) => {
    response.json({ ok: true })
  })

  app.get('/api/config', (_request: Request, response: Response) => {
    const config = getConfig(deps)
    response.json({
      hasApiKey: config.hasApiKey,
      realtimeModel: config.realtimeModel,
      realtimeVoice: config.realtimeVoice,
      graderModel: config.graderModel,
      topics: topics.map((topic) => ({
        id: topic.id,
        title: topic.title,
        shortName: topic.shortName,
      })),
      openSourceRoadmap: [
        'Ollama local grader',
        'Whisper or local STT transcription path',
        'Local TTS layer behind the same exam state machine',
      ],
    })
  })

  app.post('/api/realtime-token', async (request: Request, response: Response) => {
    const parsed = TokenRequestSchema.safeParse(request.body)
    if (!parsed.success) {
      sendValidationError(response)
      return
    }

    const config = getConfig(deps)
    if (!config.hasApiKey) {
      response.status(503).json({
        error: {
          code: 'missing_openai_api_key',
          message:
            'Add OPENAI_API_KEY to .env to enable the live microphone exam. The typed demo and local grader still work.',
        },
        hasApiKey: false,
        realtimeModel: config.realtimeModel,
        realtimeVoice: config.realtimeVoice,
      })
      return
    }

    const topic = getTopicById(parsed.data.topicId)
    const createClientSecret =
      deps.createClientSecret ??
      ((params: ClientSecretCreateParams) => defaultCreateClientSecret(config.apiKey, params))

    try {
      const secret = await createClientSecret(
        realtimeSessionParams(topic, config.realtimeModel, config.realtimeVoice),
      )

      response.json({
        clientSecret: secret.value,
        expiresAt: secret.expires_at,
        realtimeModel: config.realtimeModel,
        realtimeVoice: config.realtimeVoice,
      })
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Could not create a Realtime client secret.'
      sendServerError(response, message)
    }
  })

  app.post('/api/grade-exam', async (request: Request, response: Response) => {
    const parsed = GradeRequestSchema.safeParse(request.body)
    if (!parsed.success) {
      sendValidationError(response, 'Expected topicId, one to three turns, and metrics.')
      return
    }

    const config = getConfig(deps)
    const topic = getTopicById(parsed.data.topicId)

    if (!config.hasApiKey) {
      response.json(gradeExamLocally(topic, parsed.data.turns, parsed.data.metrics))
      return
    }

    const gradeWithOpenAI =
      deps.gradeWithOpenAI ??
      ((examTopic: Topic, turns: ExamTurn[], metrics: ExamMetrics) =>
        defaultGradeWithOpenAI(config.apiKey, config.graderModel, examTopic, turns, metrics))

    try {
      response.json(await gradeWithOpenAI(topic, parsed.data.turns, parsed.data.metrics))
    } catch {
      response.json(gradeExamLocally(topic, parsed.data.turns, parsed.data.metrics))
    }
  })

  app.use((_request: Request, response: Response) => {
    response.status(404).json(
      ErrorResponseSchema.parse({
        error: {
          code: 'not_found',
          message: 'Route not found.',
        },
      }),
    )
  })

  return app
}

export function startServer() {
  const port = Number(process.env.PORT ?? 8787)
  const host = process.env.HOST ?? '127.0.0.1'
  const app = createApp()

  app.listen(port, host, () => {
    console.log(`Quantum Villain Viva API listening on http://${host}:${port}`)
  })
}
