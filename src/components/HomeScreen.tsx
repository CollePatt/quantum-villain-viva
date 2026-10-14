import { useState } from 'react'
import { ArrowRight, ExternalLink, Mic, Trophy } from 'lucide-react'
import { topics } from '../domain/topics'
import type { TopicId } from '../domain/schemas'
import { androidBrowserUrl, type InAppBrowser } from '../lib/inAppBrowser'
import { Observer } from './Observer'

export type TopicChoice = TopicId | 'random'

type HomeScreenProps = {
  topicChoice: TopicChoice
  onTopicChange: (topic: TopicChoice) => void
  needsAccessCode: boolean
  accessCode: string
  onAccessCodeChange: (code: string) => void
  isLiveVoice: boolean
  inAppBrowser: InAppBrowser | null
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
  inAppBrowser,
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
          The Observer quizzes you out loud on quantum physics. Answer by voice before the clock runs out. Right
          and fast answers score the most.
        </p>
      </div>

      <div className="home-controls">
        <ol className="rules" aria-label="How to play">
          <li>
            <span>You get 4 questions. They start hard, with 60 seconds each.</span>
          </li>
          <li>
            <span>Get a hard one wrong and you drop to multiple choice, with 20 seconds each.</span>
          </li>
          <li>
            <span>Get 2 multiple-choice questions right in a row to move back up to hard.</span>
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

        {inAppBrowser ? <OpenInBrowser browser={inAppBrowser} /> : null}

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

function OpenInBrowser({ browser }: { browser: InAppBrowser }) {
  const [copied, setCopied] = useState(false)
  const href = typeof window === 'undefined' ? '' : window.location.href

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(href)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="in-app-note" role="note">
      <p>
        <b>Opened inside {browser.app}?</b> Its browser often blocks the mic. You can still type, or{' '}
        {browser.platform === 'ios' ? 'tap ··· and choose Open in Safari to hear the Observer.' : 'open the game in your browser.'}
      </p>
      {browser.platform === 'android' ? (
        <a className="text-link" href={androidBrowserUrl(href)}>
          <ExternalLink size={14} /> Open in browser
        </a>
      ) : (
        <button type="button" className="text-link" onClick={copyLink}>
          <ExternalLink size={14} /> {copied ? 'Link copied' : 'Copy link'}
        </button>
      )}
    </div>
  )
}
