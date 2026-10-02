import { Mic, Play, Trophy } from 'lucide-react'
import { topics } from '../domain/topics'
import type { Level, TopicId } from '../domain/schemas'
import { Nocturne } from './Nocturne'

export type TopicChoice = TopicId | 'random'

const LEVEL_OPTIONS: Array<{ id: Level; label: string; blurb: string }> = [
  { id: 'curious', label: 'Curious', blurb: 'Plain English. Anyone can play.' },
  { id: 'physicist', label: 'Physicist', blurb: 'Real exam questions. No mercy.' },
]

type HomeScreenProps = {
  level: Level
  onLevelChange: (level: Level) => void
  topicChoice: TopicChoice
  onTopicChange: (topic: TopicChoice) => void
  needsAccessCode: boolean
  accessCode: string
  onAccessCodeChange: (code: string) => void
  isLiveVoice: boolean
  onStart: () => void
  onOpenBoard: () => void
}

export function HomeScreen({
  level,
  onLevelChange,
  topicChoice,
  onTopicChange,
  needsAccessCode,
  accessCode,
  onAccessCodeChange,
  isLiveVoice,
  onStart,
  onOpenBoard,
}: HomeScreenProps) {
  return (
    <section className="screen home" aria-label="Start">
      <header className="topbar">
        <span className="wordmark">
          Quantum<b>Villain</b>
        </span>
        <button type="button" className="icon-button" onClick={onOpenBoard} aria-label="Open scoreboard">
          <Trophy size={20} />
        </button>
      </header>

      <div className="hero">
        <Nocturne mood="smug" size={168} />
        <h1>Can you out-think a quantum supervillain?</h1>
        <p className="lede">Professor Nocturne asks 3 questions. Answer out loud before the clock runs out.</p>
      </div>

      <div className="field">
        <span className="field-label" id="level-label">
          Difficulty
        </span>
        <div className="segmented" role="radiogroup" aria-labelledby="level-label">
          {LEVEL_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={level === option.id}
              className={level === option.id ? 'active' : ''}
              onClick={() => onLevelChange(option.id)}
            >
              <strong>{option.label}</strong>
              <small>{option.blurb}</small>
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <span className="field-label" id="topic-label">
          Topic
        </span>
        <div className="chips" role="radiogroup" aria-labelledby="topic-label">
          <button
            type="button"
            role="radio"
            aria-checked={topicChoice === 'random'}
            className={topicChoice === 'random' ? 'chip active' : 'chip'}
            onClick={() => onTopicChange('random')}
          >
            <span aria-hidden="true">🎲</span> Surprise me
          </button>
          {topics.map((topic) => (
            <button
              key={topic.id}
              type="button"
              role="radio"
              aria-checked={topicChoice === topic.id}
              className={topicChoice === topic.id ? 'chip active' : 'chip'}
              onClick={() => onTopicChange(topic.id)}
            >
              <span aria-hidden="true">{topic.emoji}</span> {topic.shortName}
            </button>
          ))}
        </div>
      </div>

      {needsAccessCode ? (
        <label className="field">
          <span className="field-label">Access code</span>
          <input
            className="text-input"
            type="password"
            value={accessCode}
            onChange={(event) => onAccessCodeChange(event.target.value)}
            placeholder="From whoever shared this"
            autoComplete="off"
          />
        </label>
      ) : null}

      <div className="start-dock">
        <button type="button" className="cta" onClick={onStart}>
          <Play size={22} fill="currentColor" />
          Face Nocturne
        </button>
        <p className="fine-print">
          <Mic size={14} /> {isLiveVoice ? 'Live AI voice · uses your mic' : 'Uses your mic or keyboard'} · about 2 minutes
        </p>
      </div>

      <ol className="how">
        <li>
          <b>1</b>
          <span>Hear the question</span>
        </li>
        <li>
          <b>2</b>
          <span>Answer out loud</span>
        </li>
        <li>
          <b>3</b>
          <span>Score points for being right and fast</span>
        </li>
      </ol>
    </section>
  )
}
