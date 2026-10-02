import { useCallback, useEffect, useState } from 'react'
import { ApiError, fetchJson, isStaticPreview } from '../lib/api'
import type { Level } from '../domain/schemas'

export type LeaderboardEntry = {
  id: string
  name: string
  points: number
  topicId: string
  level: Level
  createdAt: string
}

type BoardResponse = { enabled: boolean; entries: LeaderboardEntry[] }
type SubmitResponse = { entry: LeaderboardEntry; rank: number; entries: LeaderboardEntry[] }

export function useLeaderboard(level: Level) {
  const [enabled, setEnabled] = useState(false)
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [isLoading, setIsLoading] = useState(!isStaticPreview())

  const refresh = useCallback(async () => {
    if (isStaticPreview()) {
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    try {
      const board = await fetchJson<BoardResponse>(`/api/leaderboard?level=${level}`)
      setEnabled(board.enabled)
      setEntries(board.entries)
    } catch {
      setEnabled(false)
      setEntries([])
    } finally {
      setIsLoading(false)
    }
  }, [level])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const submit = useCallback(
    async (name: string, points: number, token: string) => {
      try {
        const result = await fetchJson<SubmitResponse>('/api/leaderboard', {
          method: 'POST',
          body: JSON.stringify({ name, points, token }),
        })
        setEntries(result.entries)
        return { ok: true as const, entry: result.entry, rank: result.rank }
      } catch (error) {
        return {
          ok: false as const,
          message: error instanceof ApiError ? error.message : 'Could not reach the scoreboard.',
        }
      }
    },
    [],
  )

  return { enabled, entries, isLoading, refresh, submit }
}
