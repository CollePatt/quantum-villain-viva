import type { IncomingMessage, ServerResponse } from 'node:http'

const TOPICS = [
  {
    id: 'tunneling',
    title: 'Quantum Tunneling',
    premise:
      'Can the candidate explain why a classically forbidden barrier is not necessarily forbidden to a wavefunction?',
  },
  {
    id: 'measurement',
    title: 'Measurement and Collapse',
    premise:
      'Can the candidate distinguish states, observables, probabilities, and post-measurement updates?',
  },
  {
    id: 'spin',
    title: 'Spin and Stern-Gerlach',
    premise:
      'Can the candidate reason about two-level spin systems and basis changes?',
  },
  {
    id: 'harmonic-oscillator',
    title: 'Quantum Harmonic Oscillator',
    premise:
      'Can the candidate connect ladder operators, quantized energy, and zero-point motion?',
  },
  {
    id: 'entanglement',
    title: 'Entanglement and Bell States',
    premise:
      'Can the candidate distinguish correlation, entanglement, and faster-than-light signaling?',
  },
] as const

const DEFAULT_ALLOWED_ORIGINS = [
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
  'http://localhost:5173',
  'http://localhost:5174',
  'https://collepatt.github.io',
  'https://quantum-villain-viva.vercel.app',
]

type TopicId = (typeof TOPICS)[number]['id']

type RuntimeConfig = {
  apiKey: string
  accessCode: string
  adminCode: string
  hasApiKey: boolean
  requiresAccessCode: boolean
  realtimeModel: string
  realtimeVoice: string
  allowedOrigins: string[]
  rateLimitEnabled: boolean
  rateLimitMax: number
  rateLimitAdminMax: number
  rateLimitWindowMinutes: number
}

type RateLimitBucket = {
  count: number
  resetAt: number
}

const rateLimitBuckets = new Map<string, RateLimitBucket>()

export default async function handler(request: IncomingMessage, response: ServerResponse) {
  if (applyCors(request, response)) {
    return
  }

  if (request.method !== 'POST') {
    sendMethodNotAllowed(response)
    return
  }

  let body: unknown
  try {
    body = await readJsonBody(request)
  } catch {
    sendValidationError(response)
    return
  }

  const topicId = readTopicId(body)
  if (!topicId) {
    sendValidationError(response)
    return
  }

  const config = getRuntimeConfig()
  if (!enforceHostedAccess(request, response, config, body)) {
    return
  }

  if (!config.hasApiKey) {
    sendJson(response, 503, {
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

  const topic = getTopic(topicId)

  try {
    const { default: OpenAI } = await import('openai')
    const client = new OpenAI({ apiKey: config.apiKey })
    const secret = await client.realtime.clientSecrets.create({
      expires_after: {
        anchor: 'created_at',
        seconds: 600,
      },
      session: {
        type: 'realtime',
        model: config.realtimeModel,
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
            voice: config.realtimeVoice,
            speed: 0.86,
          },
        },
        reasoning: {
          effort: 'low',
        },
      },
    })

    sendJson(response, 200, {
      clientSecret: secret.value,
      expiresAt: secret.expires_at,
      realtimeModel: config.realtimeModel,
      realtimeVoice: config.realtimeVoice,
    })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Could not create a Realtime client secret.'
    sendServerError(response, message)
  }
}

function getRuntimeConfig(): RuntimeConfig {
  const apiKey = process.env.OPENAI_API_KEY ?? ''
  const accessCode = process.env.VIVA_ACCESS_CODE ?? ''
  const adminCode = process.env.VIVA_ADMIN_CODE ?? ''

  return {
    apiKey,
    accessCode,
    adminCode,
    hasApiKey: apiKey.trim().length > 0 && !apiKey.includes('paste-your-key'),
    requiresAccessCode: Boolean(accessCode.trim() || adminCode.trim()),
    realtimeModel: process.env.OPENAI_REALTIME_MODEL ?? 'gpt-realtime-2.1',
    realtimeVoice: process.env.OPENAI_REALTIME_VOICE ?? 'cedar',
    allowedOrigins: parseCsv(process.env.ALLOWED_ORIGINS, DEFAULT_ALLOWED_ORIGINS),
    rateLimitEnabled: parseBoolean(process.env.RATE_LIMIT_ENABLED, false),
    rateLimitMax: parseInteger(process.env.RATE_LIMIT_MAX, 20),
    rateLimitAdminMax: parseInteger(process.env.RATE_LIMIT_ADMIN_MAX, 200),
    rateLimitWindowMinutes: parseInteger(process.env.RATE_LIMIT_WINDOW_MINUTES, 60),
  }
}

function buildVillainInstructions(topic: (typeof TOPICS)[number]): string {
  return `
# Role and Objective
You are Professor Nocturne, a theatrical villain conducting a quantum mechanics oral exam.
Your job is to make the user feel trapped in a brisk quantum viva while staying bound to the application-controlled exam.

# Personality and Tone
Sound elegant, intimidating, and amused. You may be dramatic, but never cruel, profane, discriminatory, or personally abusive.
Use short spoken turns. Prefer a low, resonant, slower delivery: controlled, ominous, and dryly amused. No lectures unless the application explicitly asks you to summarize.

# Exam Rules
The application controls the exam sequence. Do not invent extra questions.
When asked to deliver a question, follow-up, transition, or final beat, obey that exact task and then stop.
You may react to the user's answer using the supplied rubric concepts, but do not reveal scores or full grading.
The scorecard is generated after the exam.

# Current Topic
${topic.title}: ${topic.premise}

# Unclear Audio
If the user's audio is unclear, ask them to repeat the last answer in one sentence.
`.trim()
}

function readTopicId(body: unknown): TopicId | null {
  if (!body || typeof body !== 'object' || !('topicId' in body)) {
    return null
  }

  const topicId = (body as { topicId?: unknown }).topicId
  return typeof topicId === 'string' && TOPICS.some((topic) => topic.id === topicId)
    ? (topicId as TopicId)
    : null
}

function getTopic(topicId: TopicId) {
  return TOPICS.find((topic) => topic.id === topicId) ?? TOPICS[0]
}

function applyCors(request: IncomingMessage, response: ServerResponse): boolean {
  const config = getRuntimeConfig()
  const origin = readHeader(request, 'origin')

  if (origin && isAllowedOrigin(request, origin, config.allowedOrigins)) {
    response.setHeader('Access-Control-Allow-Origin', origin)
    response.setHeader('Vary', 'Origin')
    response.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, X-Viva-Access-Code',
    )
    response.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  }

  if (request.method === 'OPTIONS') {
    response.statusCode = 204
    response.end()
    return true
  }

  return false
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const preParsedBody = (request as IncomingMessage & { body?: unknown }).body

  if (preParsedBody !== undefined) {
    if (typeof preParsedBody === 'string') {
      return preParsedBody.trim() ? JSON.parse(preParsedBody) : {}
    }

    return preParsedBody
  }

  const chunks: Buffer[] = []
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }

  const rawBody = Buffer.concat(chunks).toString('utf8')
  return rawBody.trim() ? JSON.parse(rawBody) : {}
}

function enforceHostedAccess(
  request: IncomingMessage,
  response: ServerResponse,
  config: RuntimeConfig,
  body: unknown,
): boolean {
  const access = checkAccess(request, config, body)
  if (!access.ok) {
    sendJson(response, 401, {
      error: {
        code: 'invalid_access_code',
        message: 'Enter the private review access code to unlock hosted voice mode.',
      },
    })
    return false
  }

  return enforceRateLimit(request, response, config, access.isAdmin)
}

function checkAccess(request: IncomingMessage, config: RuntimeConfig, body: unknown) {
  if (!config.requiresAccessCode) {
    return { ok: true, isAdmin: false }
  }

  const submittedCode = readAccessCode(request, body)
  const isAdmin = Boolean(config.adminCode && submittedCode === config.adminCode)
  const isReviewer = Boolean(config.accessCode && submittedCode === config.accessCode)

  return {
    ok: isAdmin || isReviewer,
    isAdmin,
  }
}

function enforceRateLimit(
  request: IncomingMessage,
  response: ServerResponse,
  config: RuntimeConfig,
  isAdmin: boolean,
): boolean {
  if (!config.rateLimitEnabled) {
    return true
  }

  const now = Date.now()
  const max = isAdmin ? config.rateLimitAdminMax : config.rateLimitMax
  const windowMs = config.rateLimitWindowMinutes * 60 * 1000
  const key = `${isAdmin ? 'admin' : 'review'}:${getClientKey(request)}:${request.url ?? 'api'}`
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
    sendJson(response, 429, {
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

function readAccessCode(request: IncomingMessage, body: unknown): string {
  const headerCode = readHeader(request, 'x-viva-access-code')
  if (headerCode) {
    return headerCode.trim()
  }

  const authHeader = readHeader(request, 'authorization')
  if (authHeader?.toLowerCase().startsWith('bearer ')) {
    return authHeader.slice('bearer '.length).trim()
  }

  if (body && typeof body === 'object' && 'accessCode' in body) {
    const accessCode = (body as { accessCode?: unknown }).accessCode
    return typeof accessCode === 'string' ? accessCode.trim() : ''
  }

  return ''
}

function sendJson(response: ServerResponse, statusCode: number, body: unknown) {
  response.statusCode = statusCode
  response.setHeader('Content-Type', 'application/json')
  response.end(JSON.stringify(body))
}

function sendValidationError(response: ServerResponse, message = 'Request payload is invalid.') {
  sendJson(response, 400, {
    error: {
      code: 'invalid_request',
      message,
    },
  })
}

function sendServerError(response: ServerResponse, message: string) {
  sendJson(response, 502, {
    error: {
      code: 'openai_request_failed',
      message,
    },
  })
}

function sendMethodNotAllowed(response: ServerResponse) {
  sendJson(response, 405, {
    error: {
      code: 'method_not_allowed',
      message: 'Method not allowed.',
    },
  })
}

function readHeader(request: IncomingMessage, name: string): string | undefined {
  const value = request.headers[name.toLowerCase()]
  if (Array.isArray(value)) {
    return value[0]
  }

  return value
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

function getRuntimeOrigin(request: IncomingMessage): string | null {
  const host = readHeader(request, 'host')
  if (!host) {
    return null
  }

  const protocol = host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https'
  return `${protocol}://${host}`
}

function isAllowedOrigin(request: IncomingMessage, origin: string, allowedOrigins: string[]) {
  if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
    return true
  }

  return origin === getRuntimeOrigin(request)
}

function getClientKey(request: IncomingMessage): string {
  const forwardedFor = readHeader(request, 'x-forwarded-for')
  const firstForwarded = forwardedFor?.split(',')[0]?.trim()
  return firstForwarded || request.socket.remoteAddress || 'unknown'
}
