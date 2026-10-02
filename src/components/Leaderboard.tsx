import { getTopicById } from '../domain/topics'
import type { TopicId } from '../domain/schemas'
import type { LeaderboardEntry } from '../hooks/useLeaderboard'

type LeaderboardProps = {
  entries: LeaderboardEntry[]
  isLoading: boolean
  highlightId?: string | null
  emptyText?: string
}

const MEDALS = ['🥇', '🥈', '🥉']

function topicEmoji(topicId: string): string {
  try {
    return getTopicById(topicId as TopicId).emoji
  } catch {
    return '⚛️'
  }
}

export function Leaderboard({ entries, isLoading, highlightId, emptyText }: LeaderboardProps) {
  if (isLoading) {
    return <p className="board-empty">Loading scores…</p>
  }

  if (entries.length === 0) {
    return <p className="board-empty">{emptyText ?? 'No scores yet. Be the first.'}</p>
  }

  return (
    <ol className="board">
      {entries.map((entry, index) => (
        <li key={entry.id} className={entry.id === highlightId ? 'board-row you' : 'board-row'}>
          <span className="board-rank">{MEDALS[index] ?? index + 1}</span>
          <span className="board-name">{entry.name}</span>
          <span className="board-topic" aria-hidden="true">
            {topicEmoji(entry.topicId)}
          </span>
          <span className="board-points">{entry.points}</span>
        </li>
      ))}
    </ol>
  )
}
