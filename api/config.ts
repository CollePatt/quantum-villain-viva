import type { IncomingMessage, ServerResponse } from 'node:http'

const DEFAULT_ALLOWED_ORIGINS = [
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
  'http://localhost:5173',
  'http://localhost:5174',
  'https://collepatt.github.io',
  'https://quantum-villain-viva.vercel.app',
]

const TOPIC_SUMMARIES = [
  { id: 'tunneling', title: 'Quantum Tunneling', shortName: 'Tunneling' },
  { id: 'measurement', title: 'Measurement and Collapse', shortName: 'Measurement' },
  { id: 'spin', title: 'Spin and Stern-Gerlach', shortName: 'Spin' },
  {
    id: 'harmonic-oscillator',
    title: 'Quantum Harmonic Oscillator',
    shortName: 'Oscillator',
  },
  { id: 'entanglement', title: 'Entanglement and Bell States', shortName: 'Entanglement' },
]

export default function handler(request: IncomingMessage, response: ServerResponse) {
  if (applyCors(request, response)) {
    return
  }

  if (request.method !== 'GET') {
    sendJson(response, 405, {
      error: {
        code: 'method_not_allowed',
        message: 'Method not allowed.',
      },
    })
    return
  }

  const apiKey = process.env.OPENAI_API_KEY ?? ''
  const accessCode = process.env.VIVA_ACCESS_CODE ?? ''
  const adminCode = process.env.VIVA_ADMIN_CODE ?? ''

  sendJson(response, 200, {
    hasApiKey: apiKey.trim().length > 0 && !apiKey.includes('paste-your-key'),
    requiresAccessCode: Boolean(accessCode.trim() || adminCode.trim()),
    realtimeModel: process.env.OPENAI_REALTIME_MODEL ?? 'gpt-realtime-2.1',
    realtimeVoice: process.env.OPENAI_REALTIME_VOICE ?? 'cedar',
    graderModel: process.env.OPENAI_GRADER_MODEL ?? 'gpt-4.1-mini',
    topics: TOPIC_SUMMARIES,
    openSourceRoadmap: [
      'Ollama local grader',
      'Whisper or local STT transcription path',
      'Local TTS layer behind the same exam state machine',
    ],
  })
}

function applyCors(request: IncomingMessage, response: ServerResponse): boolean {
  const origin = readHeader(request, 'origin')
  const allowedOrigins = parseCsv(process.env.ALLOWED_ORIGINS, DEFAULT_ALLOWED_ORIGINS)

  if (origin && isAllowedOrigin(request, origin, allowedOrigins)) {
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

function sendJson(response: ServerResponse, statusCode: number, body: unknown) {
  response.statusCode = statusCode
  response.setHeader('Content-Type', 'application/json')
  response.end(JSON.stringify(body))
}

function readHeader(request: IncomingMessage, name: string): string | undefined {
  const value = request.headers[name.toLowerCase()]
  if (Array.isArray(value)) {
    return value[0]
  }

  return value
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
