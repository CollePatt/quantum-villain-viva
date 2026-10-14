import { RotateCcw, Share2, Trophy } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import type { RoundPath } from '../domain/round'
import { MAX_POINTS, type QuestionPoints } from '../domain/scoring'
import type { ExamReport, Level, Topic } from '../domain/schemas'
import type { LeaderboardEntry } from '../hooks/useLeaderboard'
import { Leaderboard } from './Leaderboard'
import { Observer, type ObserverMood } from './Observer'

export type ScoredQuestion = {
  prompt: string
  tier: Level
  rubricScore: number
  feedback: string
  missing: string[]
  points: QuestionPoints
}

type SubmitState =
  | { status: 'idle' }
  | { status: 'sending' }
  | { status: 'posted'; entryId: string; rank: number }
  | { status: 'error'; message: string }

type ResultsScreenProps = {
  topic: Topic
  tier: Level
  path: RoundPath
  report: ExamReport
  totalPoints: number
  questions: ScoredQuestion[]
  canPost: boolean
  boardEnabled: boolean
  boardEntries: LeaderboardEntry[]
  boardLoading: boolean
  personalBest: number | null
  voiceSummary: string
  onSubmitScore: (name: string) => Promise<{ ok: true; entryId: string; rank: number } | { ok: false; message: string }>
  onPlayAgain: () => void
  onHome: () => void
}

const NAME_STORAGE_KEY = 'quantum-villain-name'

const HEADLINES: Record<RoundPath, { title: string; line: string; mood: ObserverMood }> = {
  held: { title: 'Survived at Physicist level', line: 'The Observer looked away first.', mood: 'defeated' },
  climbed: {
    title: 'Climbed back to Physicist',
    line: 'Collapsed, recovered, and annoyed me twice.',
    mood: 'impressed',
  },
  'fell-late': {
    title: 'Collapsed on the last question',
    line: 'So close to remaining interesting.',
    mood: 'smug',
  },
  collapsed: {
    title: 'Collapsed to Curious',
    line: 'A perfectly respectable state. For a particle.',
    mood: 'smug',
  },
}

function readName(): string {
  try {
    return window.localStorage?.getItem?.(NAME_STORAGE_KEY) ?? ''
  } catch {
    return ''
  }
}

function useCountUp(target: number, durationMs = 1200): number {
  const [value, setValue] = useState(0)
  useEffect(() => {
    if (typeof window.requestAnimationFrame !== 'function') {
      setValue(target)
      return
    }
    let frame = 0
    const startedAt = performance.now()
    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / durationMs)
      setValue(Math.round(target * (1 - Math.pow(1 - progress, 3))))
      if (progress < 1) {
        frame = window.requestAnimationFrame(tick)
      }
    }
    frame = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(frame)
  }, [target, durationMs])
  return value
}

export function ResultsScreen({
  topic,
  tier,
  path,
  report,
  totalPoints,
  questions,
  canPost,
  boardEnabled,
  boardEntries,
  boardLoading,
  personalBest,
  voiceSummary,
  onSubmitScore,
  onPlayAgain,
  onHome,
}: ResultsScreenProps) {
  const shown = useCountUp(totalPoints)
  const headline = HEADLINES[path]
  const tierName = tier === 'curious' ? 'Curious' : 'Physicist'
  const [name, setName] = useState(readName)
  const [submit, setSubmit] = useState<SubmitState>({ status: 'idle' })
  const [shareNote, setShareNote] = useState<string | null>(null)
  const mood: ObserverMood = path === 'collapsed' && totalPoints < 150 ? 'angry' : headline.mood

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!name.trim() || submit.status === 'sending') {
      return
    }
    setSubmit({ status: 'sending' })
    try {
      window.localStorage?.setItem?.(NAME_STORAGE_KEY, name.trim())
    } catch {
      // Remembering the name is a convenience only.
    }
    const result = await onSubmitScore(name.trim())
    setSubmit(
      result.ok
        ? { status: 'posted', entryId: result.entryId, rank: result.rank }
        : { status: 'error', message: result.message },
    )
  }

  async function handleShare() {
    const url = `${window.location.origin}${window.location.pathname}`
    const text =
      tier === 'physicist'
        ? `I survived The Observer at Physicist level: ${totalPoints} pts on ${topic.shortName}. Can you hold your state?`
        : `The Observer collapsed me to Curious: ${totalPoints} pts on ${topic.shortName}. Bet you collapse faster.`
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Quantum Villain', text, url })
        return
      }
      await navigator.clipboard.writeText(`${text} ${url}`)
      setShareNote('Copied to clipboard')
    } catch {
      setShareNote(null)
    }
  }

  return (
    <section className="screen results" aria-label="Results">
      <header className="topbar">
        <button type="button" className="wordmark as-button" onClick={onHome}>
          Quantum Villain
        </button>
        <span className={`tier-chip ${tier}`}>{tierName}</span>
      </header>

      <div className="score-hero">
        <Observer mood={mood} width={200} />
        <p className="rank-title">{headline.title}</p>
        <p className="big-score" aria-label={`${totalPoints} points`}>
          {shown}
          <small> / {MAX_POINTS}</small>
        </p>
        <p className="rank-line">
          {headline.line} <span className="topic-note">{topic.shortName}</span>
        </p>
      </div>

      <div className="score-actions">
        <button type="button" className="cta" onClick={handleShare}>
          <Share2 size={20} /> Share score
        </button>
        <button type="button" className="ghost" onClick={onPlayAgain}>
          <RotateCcw size={18} /> Play again
        </button>
      </div>
      {shareNote ? <p className="toast">{shareNote}</p> : null}

      <ol className="breakdown">
        {questions.map((question, index) => (
          <li
            key={question.prompt}
            className={question.rubricScore >= 2 ? 'hit' : question.rubricScore >= 1 ? 'half' : 'miss'}
          >
            <details>
              <summary>
                <span className="mark" aria-hidden="true">
                  {question.rubricScore >= 2 ? '✓' : question.rubricScore >= 1 ? '~' : '✗'}
                </span>
                <span className="q-label">Q{index + 1}</span>
                <span className={`q-tier ${question.tier}`} title={question.tier === 'curious' ? 'Curious' : 'Physicist'}>
                  {question.tier === 'curious' ? 'C' : 'P'}
                </span>
                <span className="q-feedback">{question.feedback}</span>
                <span className="q-points">+{question.points.total}</span>
              </summary>
              <div className="q-detail">
                <p className="q-prompt">{question.prompt}</p>
                <p>
                  Accuracy {question.points.accuracy} · Speed {question.points.speed}
                  {question.points.hintPenalty ? ` · Hint −${question.points.hintPenalty}` : ''}
                </p>
                {question.missing.length > 0 ? (
                  <p>
                    <b>He wanted:</b> {question.missing.slice(0, 2).join('; ')}
                  </p>
                ) : null}
              </div>
            </details>
          </li>
        ))}
      </ol>

      <section className="board-card" aria-label="Scoreboard">
        <h3>
          <Trophy size={18} /> {tierName} scoreboard
        </h3>
        {boardEnabled && canPost ? (
          submit.status === 'posted' ? (
            <p className="posted">You're #{submit.rank} on the board.</p>
          ) : (
            <form className="post-form" onSubmit={handleSubmit}>
              <input
                className="text-input"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Your name"
                maxLength={18}
                aria-label="Your name"
              />
              <button type="submit" className="cta small" disabled={!name.trim() || submit.status === 'sending'}>
                {submit.status === 'sending' ? 'Posting…' : 'Post'}
              </button>
            </form>
          )
        ) : null}
        {submit.status === 'error' ? <p className="mic-error">{submit.message}</p> : null}
        {boardEnabled ? (
          <Leaderboard
            entries={boardEntries}
            isLoading={boardLoading}
            highlightId={submit.status === 'posted' ? submit.entryId : null}
          />
        ) : (
          <p className="board-empty">
            {personalBest !== null ? `Your best on this device: ${personalBest}` : 'Scoreboard is offline.'}
          </p>
        )}
      </section>

      <details className="under-hood">
        <summary>Under the hood</summary>
        <p>{voiceSummary}</p>
        <p>
          Spoken answers graded by{' '}
          {report.source === 'openai' ? 'an AI grader against a fixed rubric' : 'a quick keyword check'}, the moment you
          lock them in. Physicist questions are worth up to 250 points, Curious ones up to 100. Each tier has its own
          scoreboard, and you land on the one for the tier you finish in.
        </p>
      </details>
    </section>
  )
}
