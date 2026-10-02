import { useCallback, useEffect, useRef, useState } from 'react'
import type { RealtimeItem, RealtimeSession } from '@openai/agents/realtime'
import './App.css'
import {
  beginExam,
  createInitialExamState,
  getCurrentQuestion,
  markAsking,
  markQuestionAsked,
  recordAnswer,
  type ExamState,
} from './domain/examState'
import { conceptMatched, gradeExamLocally } from './domain/grading'
import type { ExamMetrics, ExamReport, ExamTurn, Level, Topic } from './domain/schemas'
import { questionPoints, TIME_LIMIT_SECONDS, type TurnPlay } from './domain/scoring'
import { getRoundTopic, topics } from './domain/topics'
import { HomeScreen, type TopicChoice } from './components/HomeScreen'
import { Leaderboard } from './components/Leaderboard'
import type { ObserverMood } from './components/Observer'
import { PlayScreen, type VoiceMode } from './components/PlayScreen'
import { ResultsScreen, type ScoredQuestion } from './components/ResultsScreen'
import { useLeaderboard } from './hooks/useLeaderboard'
import { useSpeechRecognition } from './hooks/useSpeechRecognition'
import {
  accessHeaders,
  fetchJson,
  isStaticPreview,
  readAccessCode,
  readStored,
  STATIC_PREVIEW_CONFIG,
  writeAccessCode,
  writeStored,
  type AppConfig,
} from './lib/api'
import {
  buildAnswerTransitionPrompt,
  buildFinalAnswerPrompt,
  buildHintTauntPrompt,
  buildQuestionPrompt,
  buildVillainInstructions,
} from './lib/examPrompts'
import { speakLocally, stopLocalSpeech } from './lib/localVoice'
import { extractTranscriptEntries } from './lib/transcript'
import { villainLines } from './lib/villainLines'

type Screen = 'home' | 'play' | 'results'
type GradedReport = ExamReport & { scoreToken?: string }

type TokenResponse = {
  clientSecret: string
  expiresAt: number
  realtimeModel: string
  realtimeVoice: string
}

type RealtimeTransportEvent = {
  type: string
  item_id?: string
  transcript?: string
  delta?: string
}

const BESTS_STORAGE_KEY = 'quantum-villain-bests'
// The timer waits this long after a question appears, so a slow voice start does not cost points.
const QUESTION_GRACE_MS = 1500

function createEmptyMetrics(): ExamMetrics {
  return {
    sessionStartedAt: null,
    sessionEndedAt: null,
    durationMs: 0,
    firstResponseLatencyMs: null,
    promptLatenciesMs: [],
    interruptions: 0,
    transcriptItems: 0,
  }
}

function appendText(existing: string, fresh: string): string {
  return [existing.trim(), fresh.trim()].filter(Boolean).join(' ')
}

function looksStrong(topic: Topic, questionIndex: number, answer: string): boolean {
  const question = topic.questions[questionIndex]
  return question.expectedConcepts.filter((concept) => conceptMatched(answer, concept)).length >= 1
}

function readBests(): Record<string, number> {
  try {
    return JSON.parse(readStored(BESTS_STORAGE_KEY) || '{}') as Record<string, number>
  } catch {
    return {}
  }
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

export default function App() {
  const [config, setConfig] = useState<AppConfig | null>(() =>
    isStaticPreview() ? STATIC_PREVIEW_CONFIG : null,
  )
  const [screen, setScreen] = useState<Screen>('home')
  const [level, setLevel] = useState<Level>('curious')
  const [topicChoice, setTopicChoice] = useState<TopicChoice>('random')
  const [roundTopic, setRoundTopic] = useState<Topic>(() => getRoundTopic('tunneling', 'curious'))
  const [exam, setExam] = useState<ExamState>(() => createInitialExamState(roundTopic))
  const [answer, setAnswer] = useState('')
  const [plays, setPlays] = useState<TurnPlay[]>([])
  const [usedHint, setUsedHint] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [villainLine, setVillainLine] = useState('')
  const [reactionMood, setReactionMood] = useState<ObserverMood | null>(null)
  const [voiceMode, setVoiceMode] = useState<VoiceMode>('local')
  const [isConnecting, setIsConnecting] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [isPlayerSpeaking, setIsPlayerSpeaking] = useState(false)
  const [realtimeDraft, setRealtimeDraft] = useState('')
  const [isLocking, setIsLocking] = useState(false)
  const [isGrading, setIsGrading] = useState(false)
  const [report, setReport] = useState<GradedReport | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [metrics, setMetrics] = useState<ExamMetrics>(createEmptyMetrics)
  const [accessCode, setAccessCode] = useState(readAccessCode)
  const [isBoardOpen, setIsBoardOpen] = useState(false)
  const [bests, setBests] = useState<Record<string, number>>(readBests)

  const sessionRef = useRef<RealtimeSession | null>(null)
  const examRef = useRef(exam)
  const answerRef = useRef(answer)
  const elapsedRef = useRef(0)
  const isSpeakingRef = useRef(false)
  const graceUntilRef = useRef(0)
  const transcriptPendingRef = useRef(false)
  const lockingRef = useRef(false)
  const sessionStartedAtRef = useRef<number | null>(null)
  const pendingPromptStartedAtRef = useRef<number | null>(null)
  const lockInRef = useRef<() => void>(() => undefined)
  const moodTimerRef = useRef(0)

  const board = useLeaderboard(level)
  const speech = useSpeechRecognition(
    useCallback((text: string) => setAnswer((current) => appendText(current, text)), []),
  )

  const timeLimit = TIME_LIMIT_SECONDS[level]
  const question = getCurrentQuestion(roundTopic, exam)

  useEffect(() => {
    examRef.current = exam
  }, [exam])

  useEffect(() => {
    answerRef.current = answer
  }, [answer])

  useEffect(() => {
    isSpeakingRef.current = isSpeaking
  }, [isSpeaking])

  useEffect(() => {
    writeAccessCode(accessCode.trim())
  }, [accessCode])

  // Each screen and question starts at the top, so the eye is always in view.
  useEffect(() => {
    window.scrollTo?.({ top: 0 })
  }, [screen, exam.questionIndex])

  useEffect(() => {
    let isMounted = true
    if (!isStaticPreview()) {
      fetchJson<AppConfig>('/api/config')
        .then((next) => {
          if (next.hasApiKey) {
            // Warm the voice SDK so pressing Start connects faster.
            void import('@openai/agents/realtime')
          }
          if (isMounted) {
            setConfig(next)
          }
        })
        .catch(() => isMounted && setConfig(STATIC_PREVIEW_CONFIG))
    }
    return () => {
      isMounted = false
      sessionRef.current?.close()
      stopLocalSpeech()
    }
  }, [])

  // Question clock. It pauses while the Observer talks, so only thinking time counts.
  const isAnswering = screen === 'play' && exam.phase === 'answering' && !isConnecting && !isGrading
  useEffect(() => {
    if (!isAnswering) {
      return
    }
    const interval = window.setInterval(() => {
      if (isSpeakingRef.current || lockingRef.current || Date.now() < graceUntilRef.current) {
        return
      }
      elapsedRef.current = Math.min(timeLimit, elapsedRef.current + 0.1)
      setElapsed(elapsedRef.current)
      if (elapsedRef.current >= timeLimit) {
        lockInRef.current()
      }
    }, 100)
    return () => window.clearInterval(interval)
  }, [isAnswering, timeLimit])

  function resetQuestionClock() {
    elapsedRef.current = 0
    setElapsed(0)
    graceUntilRef.current = Date.now() + QUESTION_GRACE_MS
    setUsedHint(false)
    setAnswer('')
    answerRef.current = ''
    setRealtimeDraft('')
  }

  // The eye reacts to an answer for a moment before going back to watching.
  function flashMood(mood: ObserverMood, ms: number) {
    window.clearTimeout(moodTimerRef.current)
    setReactionMood(mood)
    moodTimerRef.current = window.setTimeout(() => setReactionMood(null), ms)
  }

  function closeSession() {
    sessionRef.current?.close()
    sessionRef.current = null
    stopLocalSpeech()
    speech.stop()
    setIsSpeaking(false)
    setIsPlayerSpeaking(false)
  }

  // ---------- voice output ----------

  function sendVoicePrompt(prompt: string) {
    const session = sessionRef.current
    if (!session) {
      return
    }
    pendingPromptStartedAtRef.current = performance.now()
    if (session.transport.requestResponse) {
      session.transport.requestResponse({ instructions: prompt, output_modalities: ['audio'] })
      return
    }
    session.transport.sendEvent({
      type: 'response.create',
      response: { instructions: prompt, output_modalities: ['audio'] },
    })
  }

  function speakLine(caption: string, spoken: string) {
    setVillainLine(caption)
    speakLocally(spoken, {
      onStart: () => setIsSpeaking(true),
      onEnd: () => setIsSpeaking(false),
    })
  }

  function deliver(mode: VoiceMode, realtimePrompt: string, caption: string, spoken: string) {
    if (mode === 'realtime' && sessionRef.current) {
      sendVoicePrompt(realtimePrompt)
      return
    }
    speakLine(caption, spoken)
  }

  // ---------- starting a round ----------

  function startRound() {
    const topicId =
      topicChoice === 'random'
        ? topics[Math.floor(Math.random() * topics.length)].id
        : topicChoice
    const topic = getRoundTopic(topicId, level)

    closeSession()
    setRoundTopic(topic)
    setPlays([])
    setReport(null)
    setNotice(null)
    setVillainLine('')
    setMetrics({ ...createEmptyMetrics(), sessionStartedAt: new Date().toISOString() })
    sessionStartedAtRef.current = performance.now()
    resetQuestionClock()
    setScreen('play')

    const useLiveVoice =
      Boolean(config?.hasApiKey) && (!config?.requiresAccessCode || accessCode.trim().length > 0)
    if (useLiveVoice) {
      void startRealtime(topic)
    } else {
      startLocal(topic)
    }
  }

  function askFirstQuestion(topic: Topic, mode: VoiceMode) {
    const asked = markQuestionAsked(markAsking(beginExam(createInitialExamState(topic))))
    setExam(asked)
    examRef.current = asked
    resetQuestionClock()
    const opener = villainLines.opener()
    deliver(
      mode,
      buildQuestionPrompt(topic.questions[0], 1),
      opener,
      `${opener} Question one. ${topic.questions[0].prompt}`,
    )
  }

  function startLocal(topic: Topic, fallbackNotice?: string) {
    setVoiceMode('local')
    setIsConnecting(false)
    if (fallbackNotice) {
      setNotice(fallbackNotice)
    }
    askFirstQuestion(topic, 'local')
  }

  async function startRealtime(topic: Topic) {
    setVoiceMode('realtime')
    setIsConnecting(true)
    setExam(beginExam(createInitialExamState(topic)))

    try {
      const token = await fetchJson<TokenResponse>('/api/realtime-token', {
        method: 'POST',
        headers: accessHeaders(accessCode),
        body: JSON.stringify({ topicId: topic.id }),
      })

      // Loaded on demand so the first screen stays light on phones.
      const { RealtimeAgent, RealtimeSession } = await import('@openai/agents/realtime')
      const agent = new RealtimeAgent({
        name: 'The Observer',
        instructions: buildVillainInstructions(topic),
        voice: token.realtimeVoice,
      })
      const session = new RealtimeSession(agent, {
        model: token.realtimeModel,
        tracingDisabled: true,
        config: {
          outputModalities: ['audio'],
          audio: {
            input: {
              noiseReduction: { type: 'near_field' },
              transcription: {
                model: 'gpt-transcribe',
                prompt: 'Spoken answer in a quantum physics quiz game. Preserve physics vocabulary when possible.',
              },
              turnDetection: {
                type: 'semantic_vad',
                createResponse: false,
                interruptResponse: true,
                eagerness: 'medium',
              },
            },
            output: { voice: token.realtimeVoice },
          },
          reasoning: { effort: 'low' },
        },
      })

      session.on('history_updated', (history: RealtimeItem[]) => {
        const entries = extractTranscriptEntries(history)
        const lastVillain = [...entries].reverse().find((entry) => entry.role === 'assistant')
        if (lastVillain) {
          setVillainLine(lastVillain.text)
        }
        setMetrics((current) => ({ ...current, transcriptItems: entries.length }))
      })
      session.on('transport_event', handleTransportEvent)
      session.on('audio_start', () => {
        const startedAt = pendingPromptStartedAtRef.current
        if (startedAt) {
          const latency = Math.max(0, performance.now() - startedAt)
          pendingPromptStartedAtRef.current = null
          setMetrics((current) => ({
            ...current,
            firstResponseLatencyMs: current.firstResponseLatencyMs ?? latency,
            promptLatenciesMs: [...current.promptLatenciesMs, latency],
          }))
        }
        setIsSpeaking(true)
      })
      session.on('audio_stopped', () => setIsSpeaking(false))
      session.on('audio_interrupted', () => {
        setIsSpeaking(false)
        setMetrics((current) => ({ ...current, interruptions: current.interruptions + 1 }))
      })

      sessionRef.current = session
      await session.connect({ apiKey: token.clientSecret, model: token.realtimeModel })
      setIsConnecting(false)
      askFirstQuestion(topic, 'realtime')
    } catch {
      sessionRef.current?.close()
      sessionRef.current = null
      startLocal(topic, 'Live voice is busy, so the Observer is using your browser’s voice.')
    }
  }

  function handleTransportEvent(event: RealtimeTransportEvent) {
    switch (event.type) {
      case 'input_audio_buffer.speech_started':
        transcriptPendingRef.current = true
        setIsPlayerSpeaking(true)
        break
      case 'input_audio_buffer.speech_stopped':
        setIsPlayerSpeaking(false)
        break
      case 'conversation.item.input_audio_transcription.delta':
        setRealtimeDraft((current) => current + (event.delta ?? ''))
        break
      case 'conversation.item.input_audio_transcription.completed':
        transcriptPendingRef.current = false
        setRealtimeDraft('')
        setAnswer((current) => {
          const next = appendText(current, event.transcript ?? '')
          answerRef.current = next
          return next
        })
        break
      case 'conversation.item.input_audio_transcription.failed':
        transcriptPendingRef.current = false
        setRealtimeDraft('')
        break
    }
  }

  // ---------- answering ----------

  async function lockIn() {
    if (lockingRef.current || examRef.current.phase !== 'answering') {
      return
    }
    lockingRef.current = true
    setIsLocking(true)

    // Give live transcription a moment to deliver the player's last words.
    if (voiceMode === 'realtime') {
      const deadline = Date.now() + 3000
      while (transcriptPendingRef.current && Date.now() < deadline) {
        await wait(100)
      }
    }
    speech.stop()
    stopLocalSpeech()

    const current = examRef.current
    const questionIndex = current.questionIndex
    const answered = question
    const spokenAnswer = answerRef.current.trim()
    const play: TurnPlay = { secondsUsed: Math.round(elapsedRef.current * 10) / 10, usedHint }
    const nextPlays = [...plays, play]
    setPlays(nextPlays)

    const recorded = recordAnswer(roundTopic, current, spokenAnswer || 'No answer captured.')
    const turns = recorded.completedTurns.map((turn, index) => ({ ...turn, ...nextPlays[index] }))
    const strong = looksStrong(roundTopic, questionIndex, spokenAnswer)
    const reaction = villainLines.reaction(strong)
    flashMood(strong ? 'impressed' : spokenAnswer ? 'smug' : 'angry', 2800)

    if (recorded.phase === 'grading') {
      setExam(recorded)
      examRef.current = recorded
      deliver(
        voiceMode,
        buildFinalAnswerPrompt(answered, spokenAnswer),
        villainLines.final,
        `${reaction} ${villainLines.final}`,
      )
      lockingRef.current = false
      setIsLocking(false)
      await grade(turns, nextPlays)
      return
    }

    const next = markQuestionAsked(recorded)
    const nextQuestion = getCurrentQuestion(roundTopic, next)
    setExam(next)
    examRef.current = next
    resetQuestionClock()
    lockingRef.current = false
    setIsLocking(false)
    deliver(
      voiceMode,
      buildAnswerTransitionPrompt(answered, spokenAnswer, nextQuestion, next.questionIndex + 1),
      reaction,
      `${reaction} Question ${next.questionIndex + 1}. ${nextQuestion.prompt}`,
    )
  }
  useEffect(() => {
    lockInRef.current = () => void lockIn()
  })

  function takeHint() {
    if (usedHint) {
      return
    }
    setUsedHint(true)
    flashMood('smug', 2000)
    const taunt = villainLines.hint()
    if (voiceMode === 'realtime' && sessionRef.current) {
      sendVoicePrompt(buildHintTauntPrompt())
    } else {
      speakLine(taunt, taunt)
    }
  }

  function toggleMic() {
    if (speech.isListening) {
      speech.stop()
      return
    }
    stopLocalSpeech()
    setIsSpeaking(false)
    speech.start()
  }

  // ---------- grading ----------

  async function grade(turns: ExamTurn[], finalPlays: TurnPlay[]) {
    setIsGrading(true)
    const finalMetrics: ExamMetrics = {
      ...metrics,
      sessionEndedAt: new Date().toISOString(),
      durationMs:
        sessionStartedAtRef.current === null ? 0 : Math.max(0, performance.now() - sessionStartedAtRef.current),
    }
    setMetrics(finalMetrics)

    let graded: GradedReport
    try {
      if (isStaticPreview()) {
        throw new Error('No API in the static preview.')
      }
      graded = await fetchJson<GradedReport>('/api/grade-exam', {
        method: 'POST',
        headers: accessHeaders(accessCode),
        body: JSON.stringify({ topicId: roundTopic.id, turns, metrics: finalMetrics }),
      })
    } catch {
      graded = gradeExamLocally(roundTopic, turns, finalMetrics)
    }

    // Let the Observer finish his last line before the results replace the screen.
    const deadline = Date.now() + 4000
    while (isSpeakingRef.current && Date.now() < deadline) {
      await wait(150)
    }

    const total = scoreQuestions(graded, finalPlays).reduce((sum, item) => sum + item.points.total, 0)
    const bestKey = `${level}:${roundTopic.id}`
    if (total > (bests[bestKey] ?? -1)) {
      const nextBests = { ...bests, [bestKey]: total }
      setBests(nextBests)
      writeStored(BESTS_STORAGE_KEY, JSON.stringify(nextBests))
    }

    closeSession()
    setReport(graded)
    setIsGrading(false)
    setScreen('results')
    void board.refresh()
  }

  function scoreQuestions(graded: ExamReport, finalPlays: TurnPlay[]): ScoredQuestion[] {
    return roundTopic.questions.map((roundQuestion, index) => {
      const grade =
        graded.perQuestion.find((candidate) => candidate.questionId === roundQuestion.id) ??
        graded.perQuestion[index]
      const play = finalPlays[index] ?? { secondsUsed: timeLimit, usedHint: false }
      const rubricScore = grade?.score ?? 0
      return {
        prompt: roundQuestion.prompt,
        rubricScore,
        feedback: grade?.feedback ?? 'No answer recorded.',
        missing: grade?.missingIdeas ?? [],
        points: questionPoints(rubricScore, play, timeLimit),
      }
    })
  }

  const scored = report ? scoreQuestions(report, plays) : []
  const totalPoints = scored.reduce((sum, item) => sum + item.points.total, 0)

  async function submitScore(name: string) {
    if (!report?.scoreToken) {
      return { ok: false as const, message: 'This score cannot be posted.' }
    }
    const result = await board.submit(name, totalPoints, report.scoreToken)
    return result.ok
      ? { ok: true as const, entryId: result.entry.id, rank: result.rank }
      : { ok: false as const, message: result.message }
  }

  function quit() {
    closeSession()
    setExam(createInitialExamState(roundTopic))
    setIsConnecting(false)
    setIsGrading(false)
    setScreen('home')
  }

  const voiceSummary =
    voiceMode === 'realtime'
      ? `Voice: OpenAI Realtime (${config?.realtimeModel ?? 'realtime'}), speech-to-speech over WebRTC.${
          metrics.firstResponseLatencyMs !== null
            ? ` First reply in ${(metrics.firstResponseLatencyMs / 1000).toFixed(1)} s.`
            : ''
        }`
      : 'Voice: your browser’s built-in speech recognition and text-to-speech.'

  return (
    <main className="app">
      <div className="backdrop" aria-hidden="true" />

      {screen === 'home' ? (
        <HomeScreen
          level={level}
          onLevelChange={setLevel}
          topicChoice={topicChoice}
          onTopicChange={setTopicChoice}
          needsAccessCode={Boolean(config?.requiresAccessCode)}
          accessCode={accessCode}
          onAccessCodeChange={setAccessCode}
          isLiveVoice={Boolean(config?.hasApiKey)}
          onStart={startRound}
          onOpenBoard={() => {
            setIsBoardOpen(true)
            void board.refresh()
          }}
        />
      ) : null}

      {screen === 'play' ? (
        <PlayScreen
          topic={roundTopic}
          question={question}
          questionIndex={exam.questionIndex}
          timeLimit={timeLimit}
          elapsed={elapsed}
          answer={answer}
          onAnswerChange={setAnswer}
          interim={voiceMode === 'realtime' ? realtimeDraft : speech.interim}
          voiceMode={voiceMode}
          isConnecting={isConnecting}
          isSpeaking={isSpeaking}
          isPlayerSpeaking={isPlayerSpeaking}
          reactionMood={reactionMood}
          isListening={speech.isListening}
          canListen={speech.isSupported}
          onToggleMic={toggleMic}
          micError={speech.error}
          villainLine={villainLine}
          usedHint={usedHint}
          onHint={takeHint}
          isLocking={isLocking}
          isGrading={isGrading}
          onLockIn={() => void lockIn()}
          onQuit={quit}
          notice={notice}
        />
      ) : null}

      {screen === 'results' && report ? (
        <ResultsScreen
          topic={roundTopic}
          level={level}
          report={report}
          totalPoints={totalPoints}
          questions={scored}
          canPost={Boolean(report.scoreToken)}
          boardEnabled={board.enabled}
          boardEntries={board.entries}
          boardLoading={board.isLoading}
          personalBest={bests[`${level}:${roundTopic.id}`] ?? null}
          voiceSummary={voiceSummary}
          onSubmitScore={submitScore}
          onPlayAgain={startRound}
          onHome={() => setScreen('home')}
        />
      ) : null}

      {isBoardOpen ? (
        <div className="sheet-backdrop" role="presentation" onClick={() => setIsBoardOpen(false)}>
          <section
            className="sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Scoreboard"
            onClick={(event) => event.stopPropagation()}
          >
            <header>
              <h2>Scoreboard</h2>
              <div className="segmented mini" role="radiogroup" aria-label="Scoreboard level">
                {(['curious', 'physicist'] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    role="radio"
                    aria-checked={level === option}
                    className={level === option ? 'active' : ''}
                    onClick={() => setLevel(option)}
                  >
                    {option === 'curious' ? 'Curious' : 'Physicist'}
                  </button>
                ))}
              </div>
            </header>
            {board.enabled ? (
              <Leaderboard entries={board.entries} isLoading={board.isLoading} />
            ) : (
              <p className="board-empty">
                {board.isLoading ? 'Loading scores…' : 'The global scoreboard is offline. Your best scores are saved on this device.'}
              </p>
            )}
            <button type="button" className="ghost" onClick={() => setIsBoardOpen(false)}>
              Close
            </button>
          </section>
        </div>
      ) : null}
    </main>
  )
}
