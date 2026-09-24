import type { IncomingMessage, ServerResponse } from 'node:http'
import { topics } from '../src/domain/topics'

export const DEFAULT_REALTIME_MODEL = 'gpt-realtime-2.1'
export const DEFAULT_REALTIME_VOICE = 'cedar'
export const DEFAULT_GRADER_MODEL = 'gpt-4.1-mini'
export const DEFAULT_ALLOWED_ORIGINS = [
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
  'http://localhost:5173',
  'http://localhost:5174',
  'https://collepatt.github.io',
  'https://quantum-villain-viva.vercel.app',
]

type RateLimitBucket = {
  count: number
  resetAt: number
}

const rateLimitBuckets = new Map<string, RateLimitBucket>()

export type RuntimeConfig = ReturnType<typeof getRuntimeConfig>

export function getRuntimeConfig() {
  const apiKey = process.env.OPENAI_API_KEY ?? ''
  const accessCode = process.env.VIVA_ACCESS_CODE ?? ''
  const adminCode = process.env.VIVA_ADMIN_CODE ?? ''

  return {
    apiKey,
    accessCode,
    adminCode,
    hasApiKey: apiKey.trim().length > 0 && !apiKey.includes('paste-your-key'),
    requiresAccessCode: Boolean(accessCode.trim() || adminCode.trim()),
    realtimeModel: process.env.OPENAI_REALTIME_MODEL ?? DEFAULT_REALTIME_MODEL,
    realtimeVoice: process.env.OPENAI_REALTIME_VOICE ?? DEFAULT_REALTIME_VOICE,
    graderModel: process.env.OPENAI_GRADER_MODEL ?? DEFAULT_GRADER_MODEL,
    allowedOrigins: parseCsv(process.env.ALLOWED_ORIGINS, DEFAULT_ALLOWED_ORIGINS),
    rateLimitEnabled: parseBoolean(process.env.RATE_LIMIT_ENABLED, false),
    rateLimitMax: parseInteger(process.env.RATE_LIMIT_MAX, 20),
    rateLimitAdminMax: parseInteger(process.env.RATE_LIMIT_ADMIN_MAX, 200),
    rateLimitWindowMinutes: parseInteger(process.env.RATE_LIMIT_WINDOW_MINUTES, 60),
  }
}

export function configPayload(config: RuntimeConfig) {
  return {
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
  }
}

export function sendJson(response: ServerResponse, statusCode: number, body: unknown) {
  response.statusCode = statusCode
  response.setHeader('Content-Type', 'application/json')
  response.end(JSON.stringify(body))
}

export function sendValidationError(
  response: ServerResponse,
  message = 'Request payload is invalid.',
) {
  sendJson(response, 400, {
    error: {
      code: 'invalid_request',
      message,
    },
  })
}

export function sendServerError(response: ServerResponse, message: string) {
  sendJson(response, 502, {
    error: {
      code: 'openai_request_failed',
      message,
    },
  })
}

export function sendMethodNotAllowed(response: ServerResponse) {
  sendJson(response, 405, {
    error: {
      code: 'method_not_allowed',
      message: 'Method not allowed.',
    },
  })
}

export function applyCors(request: IncomingMessage, response: ServerResponse): boolean {
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

export async function readJsonBody(request: IncomingMessage): Promise<unknown> {
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

export function enforceHostedAccess(
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

export function readHeader(request: IncomingMessage, name: string): string | undefined {
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

function getClientKey(request: IncomingMessage): string {
  const forwardedFor = readHeader(request, 'x-forwarded-for')
  const firstForwarded = forwardedFor?.split(',')[0]?.trim()
  return firstForwarded || request.socket.remoteAddress || 'unknown'
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
