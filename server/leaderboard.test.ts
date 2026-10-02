import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import handler, {
  cleanName,
  createMemoryStore,
  signScoreToken,
  verifyScoreToken,
  type LeaderboardStore,
} from '../api/leaderboard'
import { signScoreToken as signFromGradeRoute } from '../api/grade-exam'

let server: Server | null = null

async function serve(store: LeaderboardStore) {
  server = createServer((request, response) => void handler(request, response, store))
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve))
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/leaderboard`
}

afterEach(() => {
  server?.close()
  server = null
})

const curiousIds = ['spin-c1', 'spin-c2', 'spin-c3']

describe('score tokens', () => {
  it('accepts tokens from the grading route and binds the level', () => {
    const token = signFromGradeRoute('spin', curiousIds, [2, 1, 0])
    const payload = verifyScoreToken(token!)
    expect(payload?.level).toBe('curious')
    expect(payload?.scores).toEqual([2, 1, 0])
  })

  it('rejects tampered or stale tokens', () => {
    const token = signScoreToken('spin', ['spin-1'], [0, 0, 0])!
    const [body, signature] = token.split('.')
    const forged = Buffer.from(
      JSON.stringify({ ...JSON.parse(Buffer.from(body, 'base64url').toString()), scores: [2, 2, 2] }),
    ).toString('base64url')
    expect(verifyScoreToken(`${forged}.${signature}`)).toBeNull()
    expect(verifyScoreToken(token, undefined, Date.now() + 31 * 60 * 1000)).toBeNull()
  })
})

describe('leaderboard route', () => {
  it('posts a valid score once and ranks it', async () => {
    const url = await serve(createMemoryStore([]))
    const token = signScoreToken('spin', curiousIds, [2, 2, 1])
    const post = () =>
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: '  Ada  Lovelace ', points: 700, token }),
      })

    const created = await post()
    expect(created.status).toBe(201)
    const body = (await created.json()) as { rank: number; entry: { name: string; level: string } }
    expect(body.rank).toBe(1)
    expect(body.entry.name).toBe('Ada Lovelace')
    expect(body.entry.level).toBe('curious')

    expect((await post()).status).toBe(409)

    const list = (await (await fetch(`${url}?level=curious`)).json()) as { entries: unknown[] }
    expect(list.entries).toHaveLength(1)
    const physicist = (await (await fetch(`${url}?level=physicist`)).json()) as { entries: unknown[] }
    expect(physicist.entries).toHaveLength(0)
  })

  it('rejects points above what the graded answers allow', async () => {
    const url = await serve(createMemoryStore([]))
    const token = signScoreToken('spin', curiousIds, [1, 0, 0])
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Cheater', points: 999, token }),
    })
    expect(response.status).toBe(400)
  })

  it('reports a disabled board when no store is configured', async () => {
    server = createServer((request, response) => void handler(request, response, null))
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve))
    const port = (server.address() as AddressInfo).port
    const body = await (await fetch(`http://127.0.0.1:${port}/api/leaderboard`)).json()
    expect(body).toEqual({ enabled: false, entries: [] })
  })
})

describe('cleanName', () => {
  it('trims, strips symbols and blocks slurs', () => {
    expect(cleanName('<b>Neo</b>!!')).toBe('bNeob')
    expect(cleanName('a'.repeat(40))).toHaveLength(18)
    expect(cleanName('   ')).toBeNull()
    expect(cleanName('sh1t head')).not.toBeNull()
    expect(cleanName('shithead')).toBeNull()
  })
})
