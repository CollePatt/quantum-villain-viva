import { getTopicById } from '../domain/topics'
import type { TopicId } from '../domain/schemas'
import type { LeaderboardEntry } from '../hooks/useLeaderboard'

type LeaderboardProps = {
  entries: LeaderboardEntry[]
  isLoading: boolean
  highlightId?: string | null
  emptyText?: string
}

function topicName(topicId: string): string {
  try {
    return getTopicById(topicId as TopicId).shortName
  } catch {
    return ''
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
          <span className="board-rank">{String(index + 1).padStart(2, '0')}</span>
          <span className="board-name">{entry.name}</span>
          <span className="board-topic">{topicName(entry.topicId)}</span>
          <span className="board-points">{entry.points}</span>
        </li>
      ))}
    </ol>
  )
}
