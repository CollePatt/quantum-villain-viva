import { ArrowRight, Keyboard, Lightbulb, Mic, MicOff, X } from 'lucide-react'
import { useState } from 'react'
import { HINT_COST } from '../domain/scoring'
import type { Question, Topic } from '../domain/schemas'
import { Nocturne, type NocturneMood } from './Nocturne'

export type VoiceMode = 'realtime' | 'local'

type PlayScreenProps = {
  topic: Topic
  question: Question
  questionIndex: number
  timeLimit: number
  elapsed: number
  answer: string
  onAnswerChange: (answer: string) => void
  interim: string
  voiceMode: VoiceMode
  isConnecting: boolean
  isSpeaking: boolean
  isPlayerSpeaking: boolean
  isListening: boolean
  canListen: boolean
  onToggleMic: () => void
  micError: string | null
  villainLine: string
  usedHint: boolean
  onHint: () => void
  isLocking: boolean
  isGrading: boolean
  onLockIn: () => void
  onQuit: () => void
  notice: string | null
}

const RING_RADIUS = 21
const RING_LENGTH = 2 * Math.PI * RING_RADIUS

export function PlayScreen(props: PlayScreenProps) {
  const {
    topic,
    question,
    questionIndex,
    timeLimit,
    elapsed,
    answer,
    onAnswerChange,
    interim,
    voiceMode,
    isConnecting,
    isSpeaking,
    isPlayerSpeaking,
    isListening,
    canListen,
    onToggleMic,
    micError,
    villainLine,
    usedHint,
    onHint,
    isLocking,
    isGrading,
    onLockIn,
    onQuit,
    notice,
  } = props
  const [isTyping, setIsTyping] = useState(false)
  const remaining = Math.max(0, Math.ceil(timeLimit - elapsed))
  const fraction = Math.max(0, Math.min(1, 1 - elapsed / timeLimit))
  const urgent = remaining <= 10
  const showTextBox = isTyping || (voiceMode === 'local' && !canListen)

  const mood: NocturneMood = isGrading
    ? 'thinking'
    : isSpeaking
      ? 'speaking'
      : isConnecting
        ? 'thinking'
        : 'idle'

  const hintText = question.hint ?? `Mention: ${question.expectedConcepts[0]}.`

  if (isConnecting || isGrading) {
    return (
      <section className="screen play waiting" aria-label={isGrading ? 'Scoring' : 'Connecting'}>
        <Nocturne mood={mood} size={190} />
        <p className="waiting-title">{isGrading ? 'Nocturne is judging you…' : 'Nocturne is dialing in…'}</p>
        <p className="waiting-sub">
          {isGrading ? 'Grading your answers' : 'Allow the microphone when your browser asks'}
        </p>
        {villainLine && isGrading ? <p className="caption">“{villainLine}”</p> : null}
      </section>
    )
  }

  return (
    <section className="screen play" aria-label="Game">
      <header className="play-bar">
        <button type="button" className="icon-button" onClick={onQuit} aria-label="Quit game">
          <X size={20} />
        </button>
        <div className="progress" aria-label={`Question ${questionIndex + 1} of ${topic.questions.length}`}>
          {topic.questions.map((candidate, index) => (
            <span
              key={candidate.id}
              className={index < questionIndex ? 'dot done' : index === questionIndex ? 'dot now' : 'dot'}
            />
          ))}
        </div>
        <div className={urgent ? 'timer urgent' : 'timer'} role="timer" aria-label={`${remaining} seconds left`}>
          <svg viewBox="0 0 50 50" width="50" height="50" aria-hidden="true">
            <circle cx="25" cy="25" r={RING_RADIUS} className="timer-track" />
            <circle
              cx="25"
              cy="25"
              r={RING_RADIUS}
              className="timer-fill"
              strokeDasharray={RING_LENGTH}
              strokeDashoffset={RING_LENGTH * (1 - fraction)}
            />
          </svg>
          <span>{remaining}</span>
        </div>
      </header>

      <div className="villain-row">
        <Nocturne mood={mood} size={84} />
        <p className={villainLine ? 'caption' : 'caption muted'} aria-live="polite">
          {villainLine || (isSpeaking ? '…' : `${topic.emoji} ${topic.shortName}`)}
        </p>
      </div>

      {notice ? <p className="notice">{notice}</p> : null}

      <article className="question-card">
        <span className="question-kicker">
          Question {questionIndex + 1} of {topic.questions.length}
        </span>
        <h2>{question.prompt}</h2>
        {usedHint ? (
          <p className="hint-revealed">
            <Lightbulb size={16} /> {hintText}
          </p>
        ) : (
          <button type="button" className="hint-button" onClick={onHint}>
            <Lightbulb size={16} /> Hint <span>−{HINT_COST}</span>
          </button>
        )}
      </article>

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
                {answer} <span className="interim">{interim}</span>
              </>
            ) : voiceMode === 'realtime' ? (
              isPlayerSpeaking ? 'Listening…' : 'Just start talking. Nocturne is listening.'
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
        ) : voiceMode === 'realtime' ? (
          <span className={isPlayerSpeaking ? 'live-pill speaking' : 'live-pill'}>
            <i /> Live mic
          </span>
        ) : null}
        <button type="button" className="cta lock" onClick={onLockIn} disabled={isLocking}>
          {isLocking ? 'Locking…' : questionIndex + 1 === topic.questions.length ? 'Final answer' : 'Lock it in'}
          <ArrowRight size={20} />
        </button>
      </div>
    </section>
  )
}
