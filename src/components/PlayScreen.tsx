import { ArrowRight, Keyboard, Lightbulb, Mic, MicOff, X } from 'lucide-react'
import { useState } from 'react'
import { HINT_COST } from '../domain/scoring'
import type { Question, Topic } from '../domain/schemas'
import { Observer, type ObserverMood } from './Observer'

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
  reactionMood: ObserverMood | null
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

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

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
    reactionMood,
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
  const urgent = remaining <= 10
  const showTextBox = isTyping || (voiceMode === 'local' && !canListen)
  const hearing = voiceMode === 'realtime' ? isPlayerSpeaking : isListening

  const mood: ObserverMood =
    reactionMood ??
    (isGrading || isConnecting
      ? 'thinking'
      : isSpeaking
        ? 'speaking'
        : hearing || answer || interim
          ? 'listening'
          : 'idle')

  const hintText = question.hint ?? `Mention: ${question.expectedConcepts[0]}.`
  const total = topic.questions.length

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
    <section className="screen play" aria-label="Game">
      <header className="topbar">
        <button type="button" className="icon-button" onClick={onQuit} aria-label="Quit game">
          <X size={20} />
        </button>
        <span className="kicker">
          Q.{pad(questionIndex + 1)} of {pad(total)}
        </span>
        <span className={hearing ? 'tag live' : 'tag'}>{hearing ? '● Listening' : topic.shortName}</span>
      </header>

      <div className="progress" aria-label={`Question ${questionIndex + 1} of ${total}`}>
        {topic.questions.map((candidate, index) => (
          <span
            key={candidate.id}
            className={index < questionIndex ? 'seg done' : index === questionIndex ? 'seg now' : 'seg'}
          />
        ))}
      </div>

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

      <article className="question-card">
        <span className="question-kicker">Question {pad(questionIndex + 1)}</span>
        <h2>{question.prompt}</h2>
      </article>

      {usedHint ? (
        <p className="hint-revealed">
          <Lightbulb size={16} /> {hintText}
        </p>
      ) : (
        <button type="button" className="hint-button" onClick={onHint}>
          <Lightbulb size={16} /> Hint <span>−{HINT_COST} pts</span>
        </button>
      )}

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
        <button type="button" className="cta lock" onClick={onLockIn} disabled={isLocking}>
          <span>{isLocking ? 'Locking…' : questionIndex + 1 === total ? 'Final answer' : 'Lock it in'}</span>
          <ArrowRight size={22} />
        </button>
      </div>
    </section>
  )
}
