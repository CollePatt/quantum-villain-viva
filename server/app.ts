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
const DEFAULT_ALLOWED_ORIGINS = [
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
  'http://localhost:5173',
  'http://localhost:5174',
  'https://collepatt.github.io',
]

type RateLimitBucket = {
  count: number
  resetAt: number
}

const rateLimitBuckets = new Map<string, RateLimitBucket>()

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
  accessCode?: string
  adminCode?: string
  allowedOrigins?: string[]
  createClientSecret?: CreateClientSecret
  gradeWithOpenAI?: GradeWithOpenAI
  realtimeModel?: string
  realtimeVoice?: string
  graderModel?: string
  rateLimitEnabled?: boolean
  rateLimitMax?: number
  rateLimitAdminMax?: number
  rateLimitWindowMinutes?: number
}

const ErrorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
})

function getConfig(deps: ServerDeps) {
  const apiKey = deps.apiKey ?? process.env.OPENAI_API_KEY ?? ''
  const accessCode = deps.accessCode ?? process.env.VIVA_ACCESS_CODE ?? ''
  const adminCode = deps.adminCode ?? process.env.VIVA_ADMIN_CODE ?? ''
  return {
    apiKey,
    accessCode,
    adminCode,
    hasApiKey: apiKey.trim().length > 0 && !apiKey.includes('paste-your-key'),
    requiresAccessCode: Boolean(accessCode.trim() || adminCode.trim()),
    realtimeModel:
      deps.realtimeModel ?? process.env.OPENAI_REALTIME_MODEL ?? DEFAULT_REALTIME_MODEL,
    realtimeVoice:
      deps.realtimeVoice ?? process.env.OPENAI_REALTIME_VOICE ?? DEFAULT_REALTIME_VOICE,
    graderModel: deps.graderModel ?? process.env.OPENAI_GRADER_MODEL ?? DEFAULT_GRADER_MODEL,
    allowedOrigins:
      deps.allowedOrigins ?? parseCsv(process.env.ALLOWED_ORIGINS, DEFAULT_ALLOWED_ORIGINS),
    rateLimitEnabled:
      deps.rateLimitEnabled ?? parseBoolean(process.env.RATE_LIMIT_ENABLED, false),
    rateLimitMax: deps.rateLimitMax ?? parseInteger(process.env.RATE_LIMIT_MAX, 20),
    rateLimitAdminMax:
      deps.rateLimitAdminMax ?? parseInteger(process.env.RATE_LIMIT_ADMIN_MAX, 200),
    rateLimitWindowMinutes:
      deps.rateLimitWindowMinutes ??
      parseInteger(process.env.RATE_LIMIT_WINDOW_MINUTES, 60),
  }
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback
  }

  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase())
}

function parseInteger(value: string | undefined, fallback: number): number {
  if (value === undefined) {
    return fallback
  }

  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function parseCsv(value: string | undefined, fallback: string[]): string[] {
  const parsed =
    value
      ?.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean) ?? []

  return parsed.length > 0 ? parsed : fallback
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

function sendAuthError(response: Response) {
  response.status(401).json({
    error: {
      code: 'invalid_access_code',
      message: 'Enter the private review access code to unlock hosted voice mode.',
    },
  })
}

function getRuntimeOrigin(request: Request): string | null {
  const host = request.headers.host
  if (!host) {
    return null
  }

  const protocol = host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https'
  return `${protocol}://${host}`
}

function isAllowedOrigin(request: Request, origin: string, allowedOrigins: string[]) {
  if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
    return true
  }

  return origin === getRuntimeOrigin(request)
}

function readAccessCode(request: Request): string {
  const headerCode = request.header('x-viva-access-code')
  if (headerCode) {
    return headerCode.trim()
  }

  const authHeader = request.header('authorization')
  if (authHeader?.toLowerCase().startsWith('bearer ')) {
    return authHeader.slice('bearer '.length).trim()
  }

  const body = request.body as { accessCode?: unknown } | undefined
  return typeof body?.accessCode === 'string' ? body.accessCode.trim() : ''
}

function checkAccess(request: Request, config: ReturnType<typeof getConfig>) {
  if (!config.requiresAccessCode) {
    return { ok: true, isAdmin: false }
  }

  const submittedCode = readAccessCode(request)
  const isAdmin = Boolean(config.adminCode && submittedCode === config.adminCode)
  const isReviewer = Boolean(config.accessCode && submittedCode === config.accessCode)

  return {
    ok: isAdmin || isReviewer,
    isAdmin,
  }
}

function getClientKey(request: Request): string {
  const forwardedFor = request.header('x-forwarded-for')
  const firstForwarded = forwardedFor?.split(',')[0]?.trim()
  return firstForwarded || request.ip || request.socket.remoteAddress || 'unknown'
}

function enforceRateLimit(
  request: Request,
  response: Response,
  config: ReturnType<typeof getConfig>,
  isAdmin: boolean,
): boolean {
  if (!config.rateLimitEnabled) {
    return true
  }

  const now = Date.now()
  const max = isAdmin ? config.rateLimitAdminMax : config.rateLimitMax
  const windowMs = config.rateLimitWindowMinutes * 60 * 1000
  const key = `${isAdmin ? 'admin' : 'review'}:${getClientKey(request)}:${request.path}`
  const current = rateLimitBuckets.get(key)

  if (!current || current.resetAt <= now) {
    rateLimitBuckets.set(key, { count: 1, resetAt: now + windowMs })
    response.setHeader('X-RateLimit-Limit', String(max))
    response.setHeader('X-RateLimit-Remaining', String(Math.max(0, max - 1)))
    return true
  }

  if (current.count >= max) {
    const retryAfterSeconds = Math.ceil((current.resetAt - now) / 1000)
    response.setHeader('Retry-After', String(retryAfterSeconds))
    response.setHeader('X-RateLimit-Limit', String(max))
    response.setHeader('X-RateLimit-Remaining', '0')
    response.status(429).json({
      error: {
        code: 'rate_limited',
        message: 'Too many hosted voice requests. Wait a bit, then try again.',
      },
      retryAfterSeconds,
    })
    return false
  }

  current.count += 1
  response.setHeader('X-RateLimit-Limit', String(max))
  response.setHeader('X-RateLimit-Remaining', String(Math.max(0, max - current.count)))
  return true
}

function enforceHostedAccess(
  request: Request,
  response: Response,
  config: ReturnType<typeof getConfig>,
): { ok: true; isAdmin: boolean } | { ok: false } {
  const access = checkAccess(request, config)
  if (!access.ok) {
    sendAuthError(response)
    return { ok: false }
  }

  if (!enforceRateLimit(request, response, config, access.isAdmin)) {
    return { ok: false }
  }

  return { ok: true, isAdmin: access.isAdmin }
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
          speed: 0.86,
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

  app.use((request, response, next) => {
    const config = getConfig(deps)
    const origin = request.header('origin')

    if (origin && isAllowedOrigin(request, origin, config.allowedOrigins)) {
      response.setHeader('Access-Control-Allow-Origin', origin)
      response.setHeader('Vary', 'Origin')
      response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Viva-Access-Code')
      response.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
    }

    if (request.method === 'OPTIONS') {
      response.status(204).end()
      return
    }

    next()
  })

  app.use(express.json({ limit: '1mb' }))

  app.get('/api/health', (_request: Request, response: Response) => {
    response.json({ ok: true })
  })

  app.get('/api/config', (_request: Request, response: Response) => {
    const config = getConfig(deps)
    response.json({
      hasApiKey: config.hasApiKey,
      requiresAccessCode: config.requiresAccessCode,
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
    const access = enforceHostedAccess(request, response, config)
    if (!access.ok) {
      return
    }

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
    const access = enforceHostedAccess(request, response, config)
    if (!access.ok) {
      return
    }

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
