import { ArrowRight, Mic, Trophy } from 'lucide-react'
import { topics } from '../domain/topics'
import type { TopicId } from '../domain/schemas'
import { Observer } from './Observer'

export type TopicChoice = TopicId | 'random'

type HomeScreenProps = {
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
        <span className="wordmark">Quantum Villain</span>
        <button type="button" className="icon-button" onClick={onOpenBoard} aria-label="Open scoreboard">
          <Trophy size={20} />
        </button>
      </header>

      <div className="hero">
        <Observer mood="idle" width={250} followPointer />
        <p className="equation">|ψ⟩ collapses upon observation</p>
        <h1>
          Every answer <mark>collapses</mark> your score.
        </h1>
        <p className="lede">
          The Observer asks 4 questions out loud. Answer before the clock runs out. Points for being right, and
          for being fast.
        </p>
      </div>

      <div className="home-controls">
        <ol className="rules" aria-label="How it works">
          <li>
            <span>
              <b>Measured.</b> The first question is hard. Physicist level, real exam stuff.
            </span>
          </li>
          <li>
            <span>
              <b>Collapsed.</b> Miss it and you drop to Curious: quick multiple choice.
            </span>
          </li>
          <li>
            <span>
              <b>Climb back.</b> Two right in a row and you're back up for another hard one.
            </span>
          </li>
        </ol>

        <div className="field">
          <span className="field-label" id="topic-label">
            Subject
          </span>
          <div className="chips" role="radiogroup" aria-labelledby="topic-label">
            <button
              type="button"
              role="radio"
              aria-checked={topicChoice === 'random'}
              className={topicChoice === 'random' ? 'chip active' : 'chip'}
              onClick={() => onTopicChange('random')}
            >
              Surprise me
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
                {topic.shortName}
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
            <span>Be observed</span>
            <ArrowRight size={24} />
          </button>
          <p className="fine-print">
            <Mic size={14} /> {isLiveVoice ? 'Live AI voice · uses your mic' : 'Uses your mic or keyboard'} · about 2 min
          </p>
        </div>
      </div>
    </section>
  )
}
