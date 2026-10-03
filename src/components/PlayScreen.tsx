import { ArrowRight, Keyboard, Lightbulb, Mic, MicOff, X } from 'lucide-react'
import { useState } from 'react'
import { PROMOTION_STREAK, ROUND_LENGTH, type TierEvent } from '../domain/round'
import { TIER_POINTS } from '../domain/scoring'
import type { Level, Question } from '../domain/schemas'
import { Observer, type ObserverMood } from './Observer'

export type VoiceMode = 'realtime' | 'local'

type PlayScreenProps = {
  question: Question
  questionIndex: number
  tier: Level
  streak: number
  askedTiers: Level[]
  tierBanner: TierEvent
  timeLimit: number
  elapsed: number
  answer: string
  onAnswerChange: (answer: string) => void
  interim: string
  voiceMode: VoiceMode
  isConnecting: boolean
  isSpeaking: boolean
  isPlayerSpeaking: boolean
  reactionMood: ObserverMood | null
  isListening: boolean
  canListen: boolean
  onToggleMic: () => void
  micError: string | null
  villainLine: string
  usedHint: boolean
  struckChoice: number | null
  onHint: () => void
  isLocking: boolean
  isJudging: boolean
  isGrading: boolean
  onLockIn: () => void
  onChoose: (index: number) => void
  onQuit: () => void
  notice: string | null
}

const LETTERS = ['A', 'B', 'C']

const BANNER_TEXT: Partial<Record<Exclude<TierEvent, null>, { title: string; sub: string }>> = {
  collapsed: { title: 'Collapsed', sub: 'Now: Curious' },
  promoted: { title: 'Promoted', sub: 'Back to Physicist' },
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

export function PlayScreen(props: PlayScreenProps) {
  const {
    question,
    questionIndex,
    tier,
    streak,
    askedTiers,
    tierBanner,
    timeLimit,
    elapsed,
    answer,
    onAnswerChange,
    interim,
    voiceMode,
    isConnecting,
    isSpeaking,
    isPlayerSpeaking,
    reactionMood,
    isListening,
    canListen,
    onToggleMic,
    micError,
    villainLine,
    usedHint,
    struckChoice,
    onHint,
    isLocking,
    isJudging,
    isGrading,
    onLockIn,
    onChoose,
    onQuit,
    notice,
  } = props
  const [isTyping, setIsTyping] = useState(false)
  const remaining = Math.max(0, Math.ceil(timeLimit - elapsed))
  const urgent = remaining <= (tier === 'curious' ? 5 : 10)
  const isChoice = Boolean(question.choices)
  const showTextBox = !isChoice && (isTyping || (voiceMode === 'local' && !canListen))
  const hearing = voiceMode === 'realtime' ? isPlayerSpeaking : isListening
  const busy = isLocking || isJudging
  const banner = tierBanner ? BANNER_TEXT[tierBanner] : undefined

  const mood: ObserverMood =
    reactionMood ??
    (isGrading || isConnecting || isJudging
      ? 'thinking'
      : isSpeaking
        ? 'speaking'
        : hearing || answer || interim
          ? 'listening'
          : 'idle')

  const hintCost = TIER_POINTS[tier].hintCost
  const hintText = question.hint ?? `Mention: ${question.expectedConcepts[0]}.`

  if (isConnecting || isGrading) {
    return (
      <section className="screen play waiting" aria-label={isGrading ? 'Scoring' : 'Connecting'}>
        <Observer mood={mood} width={260} />
        <p className="waiting-title">{isGrading ? 'Observing your answers…' : 'Opening the channel…'}</p>
        <p className="waiting-sub">
          {isGrading ? 'Collapsing your score' : 'Allow the microphone when your browser asks'}
        </p>
        {villainLine && isGrading ? (
          <p className="caption">
            <b>OBSERVER:</b> {villainLine}
          </p>
        ) : null}
      </section>
    )
  }

  return (
    <section className={`screen play tier-${tier}`} aria-label="Game">
      <header className="topbar">
        <button type="button" className="icon-button" onClick={onQuit} aria-label="Quit game">
          <X size={20} />
        </button>
        <span className="kicker">
          Q.{pad(questionIndex + 1)} of {pad(ROUND_LENGTH)}
        </span>
        <span
          className={`tier-chip ${tier}`}
          aria-label={
            tier === 'physicist'
              ? 'Tier: Physicist'
              : `Tier: Curious, ${streak} of ${PROMOTION_STREAK} right toward promotion`
          }
        >
          {tier === 'physicist' ? 'Physicist' : 'Curious'}
          {tier === 'curious' ? (
            <span className="climb" aria-hidden="true">
              {Array.from({ length: PROMOTION_STREAK }, (_, index) => (
                <i key={index} className={index < streak ? 'on' : ''} />
              ))}
            </span>
          ) : null}
        </span>
      </header>

      <div className="progress" aria-label={`Question ${questionIndex + 1} of ${ROUND_LENGTH}`}>
        {Array.from({ length: ROUND_LENGTH }, (_, index) => (
          <span
            key={index}
            className={[
              'seg',
              index < questionIndex ? 'done' : index === questionIndex ? 'now' : '',
              askedTiers[index] === 'curious' ? 'curious' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          />
        ))}
      </div>

      <div className="play-body">
        <div className="play-side">
          <div className="watch-row">
            <Observer mood={mood} width={118} />
            <div className={urgent ? 'clock urgent' : 'clock'} role="timer" aria-label={`${remaining} seconds left`}>
              {remaining}
              <small>s</small>
            </div>
          </div>

          <p className="caption" aria-live="polite">
            <b>OBSERVER:</b> {villainLine || (isSpeaking ? '…' : 'Watching.')}
          </p>

          {notice ? <p className="notice">{notice}</p> : null}
        </div>

        <div className="play-main">
          <div className="question-wrap">
            <article className={isJudging ? 'question-card judging' : 'question-card'}>
              <span className="question-kicker">
                {questionIndex === 0 ? 'Measurement' : `Question ${pad(questionIndex + 1)}`} ·{' '}
                {tier === 'physicist' ? 'Hard' : 'Multiple choice'}
              </span>
              <h2>{question.prompt}</h2>
            </article>
            {banner ? (
              <div className={`tier-stamp ${tierBanner}`} role="status">
                <strong>{banner.title}</strong>
                <span>{banner.sub}</span>
              </div>
            ) : null}
          </div>

          {isChoice ? null : usedHint ? (
            <p className="hint-revealed">
              <Lightbulb size={16} /> {hintText}
            </p>
          ) : (
            <button type="button" className="hint-button" onClick={onHint} disabled={busy}>
              <Lightbulb size={16} /> Hint <span>−{hintCost} pts</span>
            </button>
          )}

          {isChoice ? (
            <div className="choices" role="group" aria-label="Choices">
              {question.choices!.map((choice, index) => (
                <button
                  key={choice}
                  type="button"
                  className={struckChoice === index ? 'choice struck' : 'choice'}
                  onClick={() => onChoose(index)}
                  disabled={busy || struckChoice === index}
                >
                  <span className="letter">{LETTERS[index]}</span>
                  <span>{choice}</span>
                </button>
              ))}
              <div className="choice-foot">
                <span className="heard" aria-live="polite">
                  {answer || interim
                    ? `Heard: “${[answer, interim].filter(Boolean).join(' ')}”`
                    : voiceMode === 'realtime' || isListening
                      ? 'Tap one, or say A, B or C.'
                      : 'Tap one.'}
                </span>
                {usedHint ? null : (
                  <button type="button" className="hint-button" onClick={onHint} disabled={busy}>
                    <Lightbulb size={16} /> Cut one <span>−{hintCost} pts</span>
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="answer-area">
              {showTextBox ? (
                <textarea
                  className="answer-input"
                  value={answer}
                  onChange={(event) => onAnswerChange(event.target.value)}
                  placeholder="Type your answer…"
                  aria-label="Your answer"
                  autoFocus={isTyping}
                />
              ) : (
                <div className={answer || interim ? 'transcript' : 'transcript empty'} aria-live="polite">
                  {answer || interim ? (
                    <>
                      “{answer} <span className="interim">{interim}</span>”
                    </>
                  ) : voiceMode === 'realtime' ? (
                    hearing ? 'Listening…' : 'Just start talking.'
                  ) : isListening ? (
                    'Listening…'
                  ) : (
                    'Tap the mic and answer out loud.'
                  )}
                </div>
              )}
              {micError ? <p className="mic-error">{micError}</p> : null}
              {!showTextBox ? (
                <button type="button" className="text-link" onClick={() => setIsTyping(true)}>
                  <Keyboard size={14} /> Type instead
                </button>
              ) : null}
            </div>
          )}

          <div className="play-dock">
            {voiceMode === 'local' && canListen ? (
              <button
                type="button"
                className={isListening ? 'mic-button live' : 'mic-button'}
                onClick={onToggleMic}
                aria-pressed={isListening}
                aria-label={isListening ? 'Stop listening' : 'Start talking'}
              >
                {isListening ? <MicOff size={26} /> : <Mic size={26} />}
              </button>
            ) : null}
            {isChoice ? null : (
              <button type="button" className="cta lock" onClick={onLockIn} disabled={busy}>
                <span>
                  {isJudging
                    ? 'Measuring…'
                    : isLocking
                      ? 'Locking…'
                      : questionIndex + 1 === ROUND_LENGTH
                        ? 'Final answer'
                        : 'Lock it in'}
                </span>
                <ArrowRight size={22} />
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
