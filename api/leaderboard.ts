import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'

// Kept standalone (no imports from src/) like the other Vercel routes.
// Scoring numbers mirror src/domain/scoring.ts, and the tier rules mirror src/domain/round.ts.
const TIER_MAX_POINTS = {
  physicist: { accuracy: [0, 125, 200], speedMax: 50 },
  curious: { accuracy: [0, 40, 80], speedMax: 20 },
}
const MAX_POINTS = 999
const ROUND_LENGTH = 4
const PROMOTION_STREAK = 2
const SEAL_MAX_AGE_MS = 60 * 60 * 1000
const LEVELS = ['curious', 'physicist'] as const
const TOPIC_IDS = ['tunneling', 'measurement', 'spin', 'harmonic-oscillator', 'entanglement']
const TOKEN_MAX_AGE_MS = 30 * 60 * 1000
const BOARD_SIZE = 10
const NAME_MAX_LENGTH = 18
const BLOCKED_NAME = /(fuck|shit|cunt|nigg|fag|bitch|whore|rape|nazi|hitler)/i
const DEFAULT_ALLOWED_ORIGINS = [
  'http://127.0.0.1:5173',
  'http://localhost:5173',
  'https://collepatt.github.io',
  'https://quantum-villain-viva.vercel.app',
]

type Level = (typeof LEVELS)[number]

export type LeaderboardEntry = {
  id: string
  name: string
  points: number
  topicId: string
  level: Level
  createdAt: string
}

type NewEntry = Omit<LeaderboardEntry, 'id' | 'createdAt'> & { tokenHash: string }

export type LeaderboardStore = {
  list(level: Level, limit: number): Promise<LeaderboardEntry[]>
  insert(entry: NewEntry): Promise<LeaderboardEntry | 'duplicate'>
  countAbove(level: Level, points: number): Promise<number>
}

export type ScoreTokenPayload = {
  topicId: string
  level: Level
  // One letter per question, p (physicist) or c (curious), in the order they were asked.
  tiers: string
  scores: number[]
  issuedAt: number
  nonce: string
}

// ---------- score tokens ----------

export function getScoreSecret(): string {
  const configured =
    process.env.LEADERBOARD_SECRET ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    ''
  if (configured.trim()) {
    return configured.trim()
  }

  // Local dev keeps the board working without any setup; hosted builds need a real secret.
  return process.env.VERCEL ? '' : 'local-dev-leaderboard-secret'
}

// Curious-level question ids end in -c1, -c2, -c3.
export function isCuriousId(questionId: string): boolean {
  return /-c\d+$/.test(questionId)
}

// Replays the tier rules for a finished round. Returns the final tier, or null when the
// question sequence could not have come from the rules.
export function replayRound(questionIds: string[], scores: number[]): Level | null {
  if (questionIds.length !== ROUND_LENGTH || scores.length !== ROUND_LENGTH) {
    return null
  }
  let tier: Level = 'physicist'
  let streak = 0
  for (const [index, questionId] of questionIds.entries()) {
    if ((isCuriousId(questionId) ? 'curious' : 'physicist') !== tier) {
      return null
    }
    const score = scores[index]
    if (tier === 'physicist') {
      if (score < 1) {
        tier = 'curious'
        streak = 0
      }
      continue
    }
    streak = score >= 2 ? streak + 1 : 0
    if (streak >= PROMOTION_STREAK && index < ROUND_LENGTH - 1) {
      tier = 'physicist'
      streak = 0
    }
  }
  return tier
}

export function signScoreToken(
  topicId: string,
  questionIds: string[],
  scores: number[],
  secret = getScoreSecret(),
): string | undefined {
  const rounded = scores.map((score) => Math.max(0, Math.min(2, Math.round(score))))
  const level = replayRound(questionIds, rounded)
  if (!secret || !level) {
    return undefined
  }

  const payload: ScoreTokenPayload = {
    topicId,
    level,
    tiers: questionIds.map((id) => (isCuriousId(id) ? 'c' : 'p')).join(''),
    scores: rounded,
    issuedAt: Date.now(),
    nonce: randomBytes(8).toString('hex'),
  }
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${body}.${hmac(body, secret)}`
}

export function verifyScoreToken(
  token: string,
  secret = getScoreSecret(),
  now = Date.now(),
): ScoreTokenPayload | null {
  if (!secret || typeof token !== 'string') {
    return null
  }

  const [body, signature] = token.split('.')
  if (!body || !signature) {
    return null
  }

  const expected = Buffer.from(hmac(body, secret))
  const received = Buffer.from(signature)
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
    return null
  }

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as ScoreTokenPayload
    if (
      !TOPIC_IDS.includes(payload.topicId) ||
      !LEVELS.includes(payload.level) ||
      !Array.isArray(payload.scores) ||
      payload.scores.length !== ROUND_LENGTH ||
      typeof payload.tiers !== 'string' ||
      !/^[pc]{4}$/.test(payload.tiers) ||
      typeof payload.issuedAt !== 'number' ||
      now - payload.issuedAt > TOKEN_MAX_AGE_MS
    ) {
      return null
    }
    return payload
  } catch {
    return null
  }
}

export function maxPointsForScores(scores: number[], tiers: string): number {
  const total = scores.reduce((sum, score, index) => {
    const rules = tiers[index] === 'c' ? TIER_MAX_POINTS.curious : TIER_MAX_POINTS.physicist
    const accuracy = rules.accuracy[Math.max(0, Math.min(2, Math.round(score)))]
    return sum + (accuracy > 0 ? accuracy + rules.speedMax : 0)
  }, 0)
  return Math.min(MAX_POINTS, total)
}

// ---------- grade seals ----------
// A hard answer is graded the moment it is locked in, because the grade decides the
// player's tier. The seal lets the final grading call reuse that exact grade.

export function sealGrade(
  topicId: string,
  questionId: string,
  answer: string,
  grade: unknown,
  secret = getScoreSecret(),
): string | undefined {
  if (!secret) {
    return undefined
  }
  const body = Buffer.from(
    JSON.stringify({ topicId, questionId, answer: answerHash(answer), grade, issuedAt: Date.now() }),
  ).toString('base64url')
  return `${body}.${hmac(body, secret)}`
}

export function openSeal(
  seal: string,
  topicId: string,
  questionId: string,
  answer: string,
  secret = getScoreSecret(),
  now = Date.now(),
): unknown | null {
  const [body, signature] = typeof seal === 'string' ? seal.split('.') : []
  if (!secret || !body || !signature) {
    return null
  }
  const expected = Buffer.from(hmac(body, secret))
  const received = Buffer.from(signature)
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
    return null
  }
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
    return payload.topicId === topicId &&
      payload.questionId === questionId &&
      payload.answer === answerHash(answer) &&
      now - payload.issuedAt <= SEAL_MAX_AGE_MS
      ? payload.grade
      : null
  } catch {
    return null
  }
}

function answerHash(answer: string): string {
  return createHash('sha256').update(answer.trim()).digest('base64url')
}

function hmac(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body).digest('base64url')
}

export function cleanName(raw: unknown): string | null {
  if (typeof raw !== 'string') {
    return null
  }

  const name = raw
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N} ._'-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NAME_MAX_LENGTH)
    .trim()

  if (!name || BLOCKED_NAME.test(name.replace(/[^a-z]/gi, ''))) {
    return null
  }

  return name
}

// ---------- stores ----------

const memoryEntries: Array<LeaderboardEntry & { tokenHash: string }> = []

export function createMemoryStore(
  entries: Array<LeaderboardEntry & { tokenHash: string }> = memoryEntries,
): LeaderboardStore {
  return {
    async list(level, limit) {
      return entries
        .filter((entry) => entry.level === level)
        .sort((a, b) => b.points - a.points || a.createdAt.localeCompare(b.createdAt))
        .slice(0, limit)
        .map(({ tokenHash: _tokenHash, ...entry }) => entry)
    },
    async insert(entry) {
      if (entries.some((candidate) => candidate.tokenHash === entry.tokenHash)) {
        return 'duplicate'
      }
      const created = {
        ...entry,
        id: randomBytes(6).toString('hex'),
        createdAt: new Date().toISOString(),
      }
      entries.push(created)
      const { tokenHash: _tokenHash, ...publicEntry } = created
      return publicEntry
    },
    async countAbove(level, points) {
      return entries.filter((entry) => entry.level === level && entry.points > points).length
    },
  }
}

type SupabaseRow = {
  id: string | number
  name: string
  points: number
  topic_id: string
  level: Level
  created_at: string
}

function fromRow(row: SupabaseRow): LeaderboardEntry {
  return {
    id: String(row.id),
    name: row.name,
    points: row.points,
    topicId: row.topic_id,
    level: row.level,
    createdAt: row.created_at,
  }
}

export function createSupabaseStore(url: string, key: string): LeaderboardStore {
  const base = `${url.replace(/\/+$/, '')}/rest/v1/leaderboard_scores`
  const headers: Record<string, string> = {
    apikey: key,
    'Content-Type': 'application/json',
  }
  // Legacy service-role keys are JWTs and also go in Authorization; new sb_secret_ keys do not.
  if (key.startsWith('eyJ')) {
    headers.Authorization = `Bearer ${key}`
  }

  return {
    async list(level, limit) {
      const query = new URLSearchParams({
        select: 'id,name,points,topic_id,level,created_at',
        level: `eq.${level}`,
        order: 'points.desc,created_at.asc',
        limit: String(limit),
      })
      const response = await fetch(`${base}?${query}`, { headers })
      if (!response.ok) {
        throw new Error(`Supabase list failed: ${response.status}`)
      }
      return ((await response.json()) as SupabaseRow[]).map(fromRow)
    },
    async insert(entry) {
      const response = await fetch(base, {
        method: 'POST',
        headers: { ...headers, Prefer: 'return=representation' },
        body: JSON.stringify({
          name: entry.name,
          points: entry.points,
          topic_id: entry.topicId,
          level: entry.level,
          token_hash: entry.tokenHash,
        }),
      })
      if (response.status === 409) {
        return 'duplicate'
      }
      if (!response.ok) {
        throw new Error(`Supabase insert failed: ${response.status}`)
      }
      const [row] = (await response.json()) as SupabaseRow[]
      return fromRow(row)
    },
    async countAbove(level, points) {
      const query = new URLSearchParams({
        select: 'id',
        level: `eq.${level}`,
        points: `gt.${points}`,
      })
      const response = await fetch(`${base}?${query}`, {
        headers: { ...headers, Prefer: 'count=exact', Range: '0-0' },
      })
      if (!response.ok) {
        throw new Error(`Supabase count failed: ${response.status}`)
      }
      const total = response.headers.get('content-range')?.split('/')[1]
      return total && total !== '*' ? Number(total) : 0
    },
  }
}

export function getStore(): LeaderboardStore | null {
  const url = process.env.SUPABASE_URL ?? ''
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  if (url.trim() && key.trim()) {
    return createSupabaseStore(url.trim(), key.trim())
  }

  // In-memory boards would silently reset between serverless invocations, so only use them locally.
  return process.env.VERCEL ? null : createMemoryStore()
}

// ---------- handler ----------

const postBuckets = new Map<string, { count: number; resetAt: number }>()

export default async function handler(
  request: IncomingMessage,
  response: ServerResponse,
  store: LeaderboardStore | null = getStore(),
) {
  if (applyCors(request, response)) {
    return
  }

  if (request.method === 'GET') {
    const level = readLevel(new URL(request.url ?? '/', 'http://localhost').searchParams.get('level'))
    if (!store) {
      sendJson(response, 200, { enabled: false, entries: [] })
      return
    }
    try {
      sendJson(response, 200, { enabled: true, entries: await store.list(level, BOARD_SIZE) })
    } catch {
      sendJson(response, 502, error('leaderboard_unavailable', 'The scoreboard is unavailable.'))
    }
    return
  }

  if (request.method !== 'POST') {
    sendJson(response, 405, error('method_not_allowed', 'Method not allowed.'))
    return
  }

  if (!store) {
    sendJson(response, 503, error('leaderboard_disabled', 'The scoreboard is not configured.'))
    return
  }

  if (isRateLimited(request)) {
    sendJson(response, 429, error('rate_limited', 'Too many score submissions. Try again later.'))
    return
  }

  let body: Record<string, unknown>
  try {
    body = (await readJsonBody(request)) as Record<string, unknown>
  } catch {
    sendJson(response, 400, error('invalid_request', 'Request payload is invalid.'))
    return
  }

  const name = cleanName(body?.name)
  if (!name) {
    sendJson(response, 400, error('invalid_name', 'Pick a different name.'))
    return
  }

  const token = typeof body.token === 'string' ? body.token : ''
  const payload = verifyScoreToken(token)
  if (!payload) {
    sendJson(response, 400, error('invalid_token', 'This score can no longer be posted.'))
    return
  }

  const points = Number(body.points)
  if (
    !Number.isInteger(points) ||
    points < 0 ||
    points > maxPointsForScores(payload.scores, payload.tiers)
  ) {
    sendJson(response, 400, error('invalid_points', 'That score does not add up.'))
    return
  }

  const level = payload.level
  try {
    const created = await store.insert({
      name,
      points,
      topicId: payload.topicId,
      level,
      tokenHash: createHash('sha256').update(token).digest('hex'),
    })
    if (created === 'duplicate') {
      sendJson(response, 409, error('duplicate', 'This score is already on the board.'))
      return
    }
    const rank = (await store.countAbove(level, points)) + 1
    sendJson(response, 201, {
      entry: created,
      rank,
      entries: await store.list(level, BOARD_SIZE),
    })
  } catch {
    sendJson(response, 502, error('leaderboard_unavailable', 'The scoreboard is unavailable.'))
  }
}

function readLevel(value: unknown): Level {
  return LEVELS.includes(value as Level) ? (value as Level) : 'curious'
}

function isRateLimited(request: IncomingMessage): boolean {
  const now = Date.now()
  const forwarded = readHeader(request, 'x-forwarded-for')?.split(',')[0]?.trim()
  const key = forwarded || request.socket?.remoteAddress || 'unknown'
  const bucket = postBuckets.get(key)
  if (!bucket || bucket.resetAt <= now) {
    postBuckets.set(key, { count: 1, resetAt: now + 60 * 60 * 1000 })
    return false
  }
  bucket.count += 1
  return bucket.count > 30
}

function error(code: string, message: string) {
  return { error: { code, message } }
}

function applyCors(request: IncomingMessage, response: ServerResponse): boolean {
  const origin = readHeader(request, 'origin')
  const allowed = (process.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((candidate) => candidate.trim())
    .filter(Boolean)
  const allowedOrigins = allowed.length > 0 ? allowed : DEFAULT_ALLOWED_ORIGINS
  const host = readHeader(request, 'host')
  const sameOrigin =
    host && origin
      ? origin === `https://${host}` || origin === `http://${host}`
      : false

  if (origin && (allowedOrigins.includes('*') || allowedOrigins.includes(origin) || sameOrigin)) {
    response.setHeader('Access-Control-Allow-Origin', origin)
    response.setHeader('Vary', 'Origin')
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type')
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
    return typeof preParsedBody === 'string'
      ? preParsedBody.trim()
        ? JSON.parse(preParsedBody)
        : {}
      : preParsedBody
  }

  const chunks: Buffer[] = []
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  const raw = Buffer.concat(chunks).toString('utf8')
  return raw.trim() ? JSON.parse(raw) : {}
}

function readHeader(request: IncomingMessage, name: string): string | undefined {
  const value = request.headers[name.toLowerCase()]
  return Array.isArray(value) ? value[0] : value
}

function sendJson(response: ServerResponse, statusCode: number, body: unknown) {
  response.statusCode = statusCode
  response.setHeader('Content-Type', 'application/json')
  response.end(JSON.stringify(body))
}
