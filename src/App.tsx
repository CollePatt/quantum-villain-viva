import {
  AudioLines,
  BadgeCheck,
  Brain,
  OctagonPause,
  Play,
  Send,
  Square,
  TimerReset,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { RealtimeAgent, RealtimeSession } from '@openai/agents/realtime'
import type { RealtimeItem } from '@openai/agents/realtime'
import './App.css'
import {
  beginExam,
  createInitialExamState,
  getCurrentQuestion,
  markAsking,
  markQuestionAsked,
  recordAnswer,
  recordFollowUp,
  summarizeProgress,
  type ExamState,
} from './domain/examState'
import type { ExamMetrics, ExamReport, ExamTurn, Question, TopicId } from './domain/schemas'
import { gradeExamLocally } from './domain/grading'
import { getTopicById, topics } from './domain/topics'
import {
  buildAnswerTransitionPrompt,
  buildFinalAnswerPrompt,
  buildFollowUpPrompt,
  buildQuestionPrompt,
  buildVillainInstructions,
} from './lib/examPrompts'
import {
  collectNewUserText,
  extractTranscriptEntries,
  type TranscriptEntry,
} from './lib/transcript'

type AppConfig = {
  hasApiKey: boolean
  realtimeModel: string
  realtimeVoice: string
  graderModel: string
  openSourceRoadmap: string[]
}

type TokenResponse = {
  clientSecret: string
  expiresAt: number
  realtimeModel: string
  realtimeVoice: string
}

type ActiveAnswerPart = 'main' | 'follow-up'
type ReportTab = 'scorecard' | 'transcript' | 'metrics'
type RealtimeTransportEvent = {
  type: string
  item_id?: string
  transcript?: string
  delta?: string
  error?: unknown
}

const INTRO_COPY =
  "You are awake, inconveniently, aboard Professor Nocturne's orbital viva chamber. Earth is below. A theatrical device is charging. Answer three quantum questions and the chamber returns you home. Fail, and Nocturne becomes unbearably smug."

const STATIC_PREVIEW_CONFIG: AppConfig = {
  hasApiKey: false,
  realtimeModel: 'gpt-realtime-2.1',
  realtimeVoice: 'marin',
  graderModel: 'local-heuristic',
  openSourceRoadmap: [
    'Ollama local grader',
    'Whisper or local STT transcription path',
    'Local TTS layer behind the same exam state machine',
  ],
}

function shouldUseStaticPreview(): boolean {
  return typeof window !== 'undefined' && window.location.hostname.endsWith('github.io')
}

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

function formatDuration(durationMs: number): string {
  if (durationMs < 1000) {
    return `${Math.round(durationMs)} ms`
  }

  return `${(durationMs / 1000).toFixed(1)} s`
}

function appendText(existing: string, fresh: string): string {
  return [existing.trim(), fresh.trim()].filter(Boolean).join(' ').trim()
}

function normalizeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  return 'Something went wrong.'
}

async function readApiError(response: Response): Promise<string> {
  const fallback = `${response.status} ${response.statusText}`
  try {
    const body = (await response.json()) as { error?: { message?: string } }
    return body.error?.message ?? fallback
  } catch {
    return fallback
  }
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
    ...init,
  })

  if (!response.ok) {
    throw new Error(await readApiError(response))
  }

  return response.json() as Promise<T>
}

function normalizePhysicsText(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, ' ')
}

function conceptMatched(answer: string, concept: string): boolean {
  const normalizedAnswer = normalizePhysicsText(answer)
  const conceptWords = normalizePhysicsText(concept)
    .split(' ')
    .filter((word) => word.length > 4)

  if (conceptWords.length === 0) {
    return false
  }

  const hits = conceptWords.filter((word) => normalizedAnswer.includes(word))
  return hits.length >= Math.min(2, conceptWords.length)
}

function shouldDemandClarification(question: Question, answer: string): boolean {
  const normalized = answer.trim().toLowerCase()
  const wordCount = normalized.split(/\s+/).filter(Boolean).length
  const conceptHits = question.expectedConcepts.filter((concept) =>
    conceptMatched(answer, concept),
  ).length

  return (
    wordCount < 12 ||
    conceptHits < 2 ||
    normalized.includes("don't know") ||
    normalized.includes('do not know') ||
    normalized.includes('idk') ||
    normalized.includes('not sure')
  )
}

function localQuestionBeat(question: Question, position: number): string {
  return `The chamber seals. Question ${position}. ${question.prompt}`
}

function localFollowUpBeat(question: Question): string {
  return `Thin. Painfully thin. Clarify this before the planet notices. ${question.followUp}`
}

function localTransitionBeat(question: Question, position: number): string {
  return `Hm. You have delayed catastrophe by a few seconds. Question ${position}. ${question.prompt}`
}

function localFinalBeat(): string {
  return 'Enough. The chamber calculates whether your planet remains mostly where you left it.'
}

export default function App() {
  const [config, setConfig] = useState<AppConfig | null>(() =>
    shouldUseStaticPreview() ? STATIC_PREVIEW_CONFIG : null,
  )
  const [topicId, setTopicId] = useState<TopicId>('tunneling')
  const topic = useMemo(() => getTopicById(topicId), [topicId])
  const [exam, setExam] = useState<ExamState>(() => createInitialExamState(topic))
  const [entries, setEntries] = useState<TranscriptEntry[]>([])
  const [mainAnswer, setMainAnswer] = useState('')
  const [followUpAnswer, setFollowUpAnswer] = useState('')
  const [activePart, setActivePart] = useState<ActiveAnswerPart>('main')
  const [metrics, setMetrics] = useState<ExamMetrics>(() => createEmptyMetrics())
  const [report, setReport] = useState<ExamReport | null>(null)
  const [statusMessage, setStatusMessage] = useState('Awaiting transmission.')
  const [isConnected, setIsConnected] = useState(false)
  const [isDemoMode, setIsDemoMode] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [appError, setAppError] = useState<string | null>(null)
  const [reportTab, setReportTab] = useState<ReportTab>('scorecard')
  const [displayPrompt, setDisplayPrompt] = useState('Select a topic and begin.')
  const [introText, setIntroText] = useState('')
  const [hasEnteredChamber, setHasEnteredChamber] = useState(false)

  const sessionRef = useRef<RealtimeSession | null>(null)
  const consumedIdsRef = useRef<Set<string>>(new Set())
  const activePartRef = useRef<ActiveAnswerPart>('main')
  const sessionStartedAtRef = useRef<number | null>(null)
  const pendingPromptStartedAtRef = useRef<number | null>(null)

  const currentQuestion = getCurrentQuestion(topic, exam)
  const canStart = exam.phase === 'idle' || exam.phase === 'report' || exam.phase === 'error'
  const canAnswer = exam.phase === 'answering'
  const isReportUnlocked = exam.phase === 'report'
  const promptText = canStart
    ? 'Select a topic and begin the transmission.'
    : activePart === 'follow-up'
      ? currentQuestion.followUp
      : currentQuestion.prompt

  useEffect(() => {
    activePartRef.current = activePart
  }, [activePart])

  useEffect(() => {
    let index = 0

    const interval = window.setInterval(() => {
      index += 1
      setDisplayPrompt(promptText.slice(0, index))

      if (index >= promptText.length) {
        window.clearInterval(interval)
      }
    }, 12)

    return () => window.clearInterval(interval)
  }, [promptText])

  useEffect(() => {
    let index = 0

    const interval = window.setInterval(() => {
      index += 1
      setIntroText(INTRO_COPY.slice(0, index))

      if (index >= INTRO_COPY.length) {
        window.clearInterval(interval)
      }
    }, 18)

    return () => window.clearInterval(interval)
  }, [])

  useEffect(() => {
    let isMounted = true

    if (!shouldUseStaticPreview()) {
      fetchJson<AppConfig>('/api/config')
        .then((nextConfig) => {
          if (isMounted) {
            setConfig(nextConfig)
          }
        })
        .catch(() => {
          if (isMounted) {
            setConfig(STATIC_PREVIEW_CONFIG)
          }
        })
    }

    return () => {
      isMounted = false
      sessionRef.current?.close()
      window.speechSynthesis?.cancel()
    }
  }, [])

  function speakLocally(text: string) {
    if (
      typeof window === 'undefined' ||
      !window.speechSynthesis ||
      typeof window.SpeechSynthesisUtterance === 'undefined'
    ) {
      return
    }

    window.speechSynthesis.cancel()
    const utterance = new window.SpeechSynthesisUtterance(text)
    utterance.rate = 0.86
    utterance.pitch = 0.55
    utterance.volume = 0.9
    utterance.onstart = () => setIsSpeaking(true)
    utterance.onend = () => setIsSpeaking(false)
    utterance.onerror = () => setIsSpeaking(false)
    window.speechSynthesis.speak(utterance)
  }

  function deliverScenePrompt(prompt: string, fallbackText: string) {
    if (isConnected && !isDemoMode) {
      sendVoicePrompt(prompt)
      return
    }

    speakLocally(fallbackText)
  }

  function deliverQuestionPrompt(question: Question, position: number) {
    deliverScenePrompt(
      buildQuestionPrompt(question, position),
      localQuestionBeat(question, position),
    )
  }

  function deliverFollowUpPrompt(question: Question, answer: string) {
    deliverScenePrompt(buildFollowUpPrompt(question, answer), localFollowUpBeat(question))
  }

  function deliverTransitionPrompt(
    question: Question,
    answer: string,
    followUpAnswer: string,
    nextQuestion: Question,
    nextPosition: number,
  ) {
    deliverScenePrompt(
      buildAnswerTransitionPrompt(
        question,
        answer,
        followUpAnswer,
        nextQuestion,
        nextPosition,
      ),
      localTransitionBeat(nextQuestion, nextPosition),
    )
  }

  function deliverFinalPrompt(question: Question, answer: string, followUpAnswer: string) {
    deliverScenePrompt(
      buildFinalAnswerPrompt(question, answer, followUpAnswer),
      localFinalBeat(),
    )
  }

  function resetForTopic(nextTopicId: TopicId) {
    sessionRef.current?.close()
    window.speechSynthesis?.cancel()
    sessionRef.current = null
    const nextTopic = getTopicById(nextTopicId)
    setTopicId(nextTopicId)
    setExam(createInitialExamState(nextTopic))
    setEntries([])
    setMainAnswer('')
    setFollowUpAnswer('')
    setActivePart('main')
    setMetrics(createEmptyMetrics())
    setReport(null)
    setIsConnected(false)
    setIsDemoMode(false)
    setIsSpeaking(false)
    setAppError(null)
    setReportTab('scorecard')
    setStatusMessage('Topic selected. The chamber is listening.')
    consumedIdsRef.current = new Set()
  }

  function updateTranscript(history: RealtimeItem[]) {
    const nextEntries = extractTranscriptEntries(history)
    setEntries(nextEntries)
    setMetrics((current) => ({
      ...current,
      transcriptItems: nextEntries.length,
    }))
  }

  function appendCapturedTranscript(text: string) {
    const cleanText = text.trim()
    if (!cleanText) {
      return
    }

    if (activePartRef.current === 'follow-up') {
      setFollowUpAnswer((current) => appendText(current, cleanText))
      return
    }

    setMainAnswer((current) => appendText(current, cleanText))
  }

  function handleTransportEvent(event: RealtimeTransportEvent) {
    if (event.type === 'input_audio_buffer.speech_started') {
      setStatusMessage('Voice detected. Finish your thought, then submit.')
      return
    }

    if (event.type === 'input_audio_buffer.speech_stopped') {
      setStatusMessage('Audio received. Waiting for transcript...')
      return
    }

    if (event.type === 'conversation.item.input_audio_transcription.delta') {
      setStatusMessage('Transcribing your answer...')
      return
    }

    if (event.type === 'conversation.item.input_audio_transcription.completed') {
      if (event.item_id) {
        consumedIdsRef.current.add(event.item_id)
      }
      appendCapturedTranscript(event.transcript ?? '')
      setStatusMessage('Voice captured. Review or submit your answer.')
      return
    }

    if (event.type === 'conversation.item.input_audio_transcription.failed') {
      setStatusMessage('I heard audio, but transcription failed. Try typing or repeat once.')
    }
  }

  function markPromptLatency() {
    const startedAt = pendingPromptStartedAtRef.current
    if (!startedAt) {
      return
    }

    const latency = Math.max(0, performance.now() - startedAt)
    pendingPromptStartedAtRef.current = null

    setMetrics((current) => ({
      ...current,
      firstResponseLatencyMs: current.firstResponseLatencyMs ?? latency,
      promptLatenciesMs: [...current.promptLatenciesMs, latency],
    }))
  }

  function sendVoicePrompt(prompt: string) {
    const session = sessionRef.current
    if (!session) {
      return
    }

    pendingPromptStartedAtRef.current = performance.now()
    if (session.transport.requestResponse) {
      session.transport.requestResponse({
        instructions: prompt,
        output_modalities: ['audio'],
      })
      return
    }

    session.transport.sendEvent({
      type: 'response.create',
      response: {
        instructions: prompt,
        output_modalities: ['audio'],
      },
    })
  }

  function takeFreshSpeech(): string {
    const { text, ids } = collectNewUserText(entries, consumedIdsRef.current)
    ids.forEach((id) => consumedIdsRef.current.add(id))
    return text
  }

  function startDemoExam() {
    const startedAt = new Date().toISOString()
    sessionStartedAtRef.current = performance.now()
    const nextExam = markQuestionAsked(markAsking(beginExam(createInitialExamState(topic))))

    setExam(nextExam)
    setMetrics({
      ...createEmptyMetrics(),
      sessionStartedAt: startedAt,
    })
    setReport(null)
    setIsDemoMode(true)
    setIsSpeaking(false)
    setReportTab('scorecard')
    setStatusMessage('Question 1 transmitted. Answer to proceed.')
    deliverQuestionPrompt(topic.questions[0], 1)
  }

  async function startVoiceExam() {
    setAppError(null)
    setReport(null)
    setEntries([])
    setMainAnswer('')
    setFollowUpAnswer('')
    setActivePart('main')
    setIsSpeaking(false)
    consumedIdsRef.current = new Set()

    if (!config?.hasApiKey) {
      startDemoExam()
      return
    }

    const startedAt = new Date().toISOString()
    sessionStartedAtRef.current = performance.now()
    setMetrics({
      ...createEmptyMetrics(),
      sessionStartedAt: startedAt,
    })

    const startingExam = beginExam(createInitialExamState(topic))
    setExam(startingExam)
    setStatusMessage('Opening the voice channel...')

    try {
      const token = await fetchJson<TokenResponse>('/api/realtime-token', {
        method: 'POST',
        body: JSON.stringify({ topicId: topic.id }),
      })

      const agent = new RealtimeAgent({
        name: 'Professor Nocturne',
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
              noiseReduction: {
                type: 'near_field',
              },
              transcription: {
                model: 'gpt-transcribe',
                prompt:
                  'Quantum mechanics oral exam answer. Preserve physics vocabulary and symbols when possible.',
              },
              turnDetection: {
                type: 'semantic_vad',
                createResponse: false,
                interruptResponse: true,
                eagerness: 'medium',
              },
            },
            output: {
              voice: token.realtimeVoice,
              speed: 0.86,
            },
          },
          reasoning: {
            effort: 'low',
          },
        },
      })

      session.on('history_updated', updateTranscript)
      session.on('transport_event', handleTransportEvent)
      session.on('audio_start', () => {
        markPromptLatency()
        setIsSpeaking(true)
      })
      session.on('audio_stopped', () => {
        setIsSpeaking(false)
      })
      session.on('audio_interrupted', () => {
        setIsSpeaking(false)
        setMetrics((current) => ({
          ...current,
          interruptions: current.interruptions + 1,
        }))
      })
      session.on('error', (error) => {
        setAppError(normalizeError(error.error))
      })

      sessionRef.current = session
      await session.connect({ apiKey: token.clientSecret, model: token.realtimeModel })
      setIsConnected(true)
      setStatusMessage('Question 1 transmitted. Answer to proceed.')

      const askingExam = markQuestionAsked(markAsking(startingExam))
      setExam(askingExam)
      sendVoicePrompt(buildQuestionPrompt(getCurrentQuestion(topic, askingExam), 1))
    } catch (error: unknown) {
      setExam(createInitialExamState(topic))
      setIsConnected(false)
      setIsSpeaking(false)
      setAppError(normalizeError(error))
      setStatusMessage('Voice failed. Local preview remains available.')
    }
  }

  async function gradeExam(turns: ExamTurn[]) {
    const now = new Date().toISOString()
    const durationMs =
      sessionStartedAtRef.current === null
        ? metrics.durationMs
        : Math.max(0, performance.now() - sessionStartedAtRef.current)
    const finalMetrics = {
      ...metrics,
      sessionEndedAt: now,
      durationMs,
      transcriptItems: entries.length,
    }

    setMetrics(finalMetrics)
    setStatusMessage('Calculating planetary consequences...')

    try {
      const nextReport = await fetchJson<ExamReport>('/api/grade-exam', {
        method: 'POST',
        body: JSON.stringify({
          topicId: topic.id,
          turns,
          metrics: finalMetrics,
        }),
      })
      setReport(nextReport)
      setExam((current) => ({ ...current, phase: 'report' }))
      setReportTab('scorecard')
      setStatusMessage('Report unlocked.')
    } catch (error: unknown) {
      if (!config?.hasApiKey) {
        const nextReport = gradeExamLocally(topic, turns, finalMetrics)
        setReport(nextReport)
        setExam((current) => ({ ...current, phase: 'report' }))
        setReportTab('scorecard')
        setStatusMessage('Report unlocked in local preview.')
        return
      }

      setAppError(normalizeError(error))
      setStatusMessage('Could not grade the exam.')
    }
  }

  function submitAnswer() {
    if (!canAnswer) {
      return
    }

    const freshSpeech = takeFreshSpeech()

    if (activePart === 'main') {
      const answer = appendText(mainAnswer, freshSpeech)

      if (shouldDemandClarification(currentQuestion, answer) && !exam.followUpsUsed[currentQuestion.id]) {
        const nextExam = recordFollowUp(topic, exam)
        setExam(nextExam)
        setMainAnswer(answer)
        setFollowUpAnswer('')
        setActivePart('follow-up')
        setStatusMessage('Nocturne reacts, then demands one clarification.')
        deliverFollowUpPrompt(currentQuestion, answer)
        return
      }

      completeTurn(answer, '')
      return
    }

    completeTurn(mainAnswer, appendText(followUpAnswer, freshSpeech))
  }

  function completeTurn(answer: string, followUp: string) {
    const capturedAnswer = answer.trim() || 'No answer captured.'
    const nextExam = recordAnswer(topic, exam, capturedAnswer, followUp)

    setMainAnswer('')
    setFollowUpAnswer('')
    setActivePart('main')
    setExam(nextExam)

    if (nextExam.phase === 'grading') {
      deliverFinalPrompt(currentQuestion, capturedAnswer, followUp)
      void gradeExam(nextExam.completedTurns)
      return
    }

    const nextQuestion = getCurrentQuestion(topic, nextExam)
    const nextQuestionNumber = nextExam.questionIndex + 1
    const askingExam = markQuestionAsked(nextExam)
    setExam(askingExam)
    setStatusMessage(`Nocturne reacts. Question ${nextQuestionNumber} incoming.`)
    deliverTransitionPrompt(
      currentQuestion,
      capturedAnswer,
      followUp,
      nextQuestion,
      nextQuestionNumber,
    )
  }

  function interruptExaminer() {
    sessionRef.current?.interrupt()
    window.speechSynthesis?.cancel()
    setIsSpeaking(false)
    setMetrics((current) => ({
      ...current,
      interruptions: current.interruptions + 1,
    }))
  }

  function resetExam() {
    sessionRef.current?.close()
    window.speechSynthesis?.cancel()
    sessionRef.current = null
    sessionStartedAtRef.current = null
    pendingPromptStartedAtRef.current = null
    consumedIdsRef.current = new Set()
    setExam(createInitialExamState(topic))
    setEntries([])
    setMainAnswer('')
    setFollowUpAnswer('')
    setActivePart('main')
    setMetrics(createEmptyMetrics())
    setReport(null)
    setIsConnected(false)
    setIsDemoMode(false)
    setIsSpeaking(false)
    setAppError(null)
    setReportTab('scorecard')
    setStatusMessage('Awaiting transmission.')
  }

  const planetPeril = report
    ? Math.max(0, Math.round((1 - report.totalScore / report.maxScore) * 100))
    : 67
  const threatClass = report
    ? report.totalScore >= 5
      ? 'safe'
      : report.totalScore >= 3
        ? 'warning'
        : 'danger'
    : 'warning'
  const modeLabel = isConnected
    ? 'Voice link'
    : isDemoMode
      ? 'Local voice'
      : config?.hasApiKey
        ? 'Ready'
        : 'Preview'
  const primaryLabel = canStart
    ? isReportUnlocked
      ? 'Run another exam'
      : 'Begin transmission'
    : activePart === 'follow-up'
      ? 'Submit follow-up'
      : 'Submit answer'

  return (
    <main className="app-shell">
      <div className="motion-field" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
      </div>

      {!hasEnteredChamber ? (
        <section className="intro-shell" aria-label="Transmission received">
          <div className="intro-terminal">
            <p className="eyebrow">Emergency narrowband signal</p>
            <h1>Transmission received</h1>
            <p className="intro-copy" aria-live="polite">
              {introText}
              <span className="cursor" aria-hidden="true" />
            </p>
            <div className="intro-footer">
              <div className="signal-strip" aria-hidden="true">
                <span />
                <span />
                <span />
                <span />
              </div>
              <button
                type="button"
                className="primary"
                onClick={() => setHasEnteredChamber(true)}
              >
                <Play size={18} />
                Enter chamber
              </button>
            </div>
          </div>
        </section>
      ) : (
        <section
          className={isReportUnlocked ? 'chamber-shell report-mode' : 'chamber-shell exam-mode'}
          aria-label="Quantum Villain Viva"
        >
        {!isReportUnlocked ? (
          <section className="exam-stage">
            <aside className="villain-panel" aria-label="Exam signal">
              <div className={isSpeaking ? 'villain-signal speaking' : 'villain-signal'}>
                <div className="voice-orb" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </div>
                <strong>{isSpeaking ? 'Nocturne speaking' : 'Nocturne waiting'}</strong>
                <small>
                  {isConnected ? `${config?.realtimeVoice ?? 'Realtime'} voice active` : 'Local preview voice'}
                </small>
              </div>

              <div className={`planet-meter ${threatClass}`}>
                <span>Planet peril</span>
                <strong>{planetPeril}%</strong>
                <div>
                  <i style={{ width: `${planetPeril}%` }} />
                </div>
              </div>

              <div className="session-pill" aria-label="Session status">
                <span>{modeLabel}</span>
                <strong>{summarizeProgress(topic, exam)}</strong>
              </div>
            </aside>

            <section className="exam-console" aria-label="Exam console">
              <label className="topic-select">
                <span>Topic</span>
                <select
                  value={topic.id}
                  onChange={(event) => resetForTopic(event.target.value as TopicId)}
                  disabled={!canStart}
                >
                  {topics.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidate.title}
                    </option>
                  ))}
                </select>
              </label>

              <div className="question-card">
                <div className="question-meta">
                  <span>{topic.title}</span>
                  <span>Question {Math.min(exam.questionIndex + 1, topic.questions.length)}</span>
                </div>
                <p className="transmission-text" aria-live="polite">
                  {displayPrompt}
                  <span className="cursor" aria-hidden="true" />
                </p>
              </div>

              <label className="answer-console">
                <span>{activePart === 'follow-up' ? 'Clarification' : 'Your answer'}</span>
                <textarea
                  value={activePart === 'follow-up' ? followUpAnswer : mainAnswer}
                  onChange={(event) =>
                    activePart === 'follow-up'
                      ? setFollowUpAnswer(event.target.value)
                      : setMainAnswer(event.target.value)
                  }
                  placeholder="Speak, then clean up the transcript here if needed."
                  disabled={canStart || exam.phase === 'grading'}
                />
              </label>

              <div className="action-row">
                <button
                  type="button"
                  className="primary"
                  onClick={canStart ? () => void startVoiceExam() : submitAnswer}
                  disabled={exam.phase === 'connecting' || exam.phase === 'grading'}
                >
                  {canStart ? <Play size={18} /> : <Send size={18} />}
                  {primaryLabel}
                </button>
                {(isSpeaking || isConnected || isDemoMode) && !canStart ? (
                  <button type="button" className="secondary" onClick={interruptExaminer}>
                    <OctagonPause size={18} />
                    Silence
                  </button>
                ) : null}
              </div>

              <p className="status-line" role="status">
                {statusMessage}
              </p>
              {appError ? <p className="error-line">{appError}</p> : null}
            </section>
          </section>
        ) : (
          <section className="report-stage">
            <div className="report-hero">
              <div>
                <p className="eyebrow">After-action report</p>
                <h2>{report?.summary ?? 'The chamber is considering your fate.'}</h2>
              </div>
              <div className={`planet-meter ${threatClass}`}>
                <span>Planet peril</span>
                <strong>{planetPeril}%</strong>
                <div>
                  <i style={{ width: `${planetPeril}%` }} />
                </div>
              </div>
            </div>

            <nav className="view-tabs" aria-label="Report views">
              <button
                type="button"
                className={reportTab === 'scorecard' ? 'active' : ''}
                onClick={() => setReportTab('scorecard')}
              >
                <BadgeCheck size={16} />
                Scorecard
              </button>
              <button
                type="button"
                className={reportTab === 'transcript' ? 'active' : ''}
                onClick={() => setReportTab('transcript')}
              >
                <AudioLines size={16} />
                Transcript
              </button>
              <button
                type="button"
                className={reportTab === 'metrics' ? 'active' : ''}
                onClick={() => setReportTab('metrics')}
              >
                <TimerReset size={16} />
                Metrics
              </button>
            </nav>

            {reportTab === 'scorecard' && report ? (
              <div className="scorecard-view">
                <div className="score">
                  <strong>
                    {report.totalScore}/{report.maxScore}
                  </strong>
                  <span>
                    {report.source === 'openai' ? 'Rubric grade' : 'Local heuristic grade'}
                  </span>
                </div>
                <div className="grade-list">
                  {report.perQuestion.map((grade, index) => (
                    <article
                      key={grade.questionId}
                      className={grade.score === 2 ? 'passed' : grade.score === 1 ? 'mixed' : 'failed'}
                    >
                      <div>
                        <span>Q{index + 1}</span>
                        <strong>
                          {grade.score}/{grade.maxScore}
                        </strong>
                      </div>
                      <p>{grade.feedback}</p>
                    </article>
                  ))}
                </div>
                <h3>Review next</h3>
                <ul>
                  {report.reviewSuggestions.map((suggestion) => (
                    <li key={suggestion}>{suggestion}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {reportTab === 'transcript' ? (
              <div className="transcript-view">
                {entries.length === 0 ? (
                  <p className="empty-state">
                    Live voice transcripts appear here. Local preview answers are still included
                    in the scorecard.
                  </p>
                ) : (
                  <ol>
                    {entries.map((entry) => (
                      <li key={entry.id} className={entry.role}>
                        <span>{entry.role}</span>
                        <p>{entry.text}</p>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            ) : null}

            {reportTab === 'metrics' ? (
              <div className="metrics-view">
                <dl>
                  <div>
                    <dt>Duration</dt>
                    <dd>{formatDuration(metrics.durationMs)}</dd>
                  </div>
                  <div>
                    <dt>First response</dt>
                    <dd>
                      {metrics.firstResponseLatencyMs === null
                        ? 'Not observed'
                        : formatDuration(metrics.firstResponseLatencyMs)}
                    </dd>
                  </div>
                  <div>
                    <dt>Interruptions</dt>
                    <dd>{metrics.interruptions}</dd>
                  </div>
                  <div>
                    <dt>Transcript items</dt>
                    <dd>{metrics.transcriptItems}</dd>
                  </div>
                </dl>
                <div className="method-note">
                  <Brain size={18} />
                  <p>
                    Questions are fixed rubric items. Live mode uses a Realtime model
                    for short villain reactions and spoken transitions; preview mode
                    uses local browser speech without spending API credits.
                  </p>
                </div>
              </div>
            ) : null}

            <button type="button" className="secondary compact" onClick={resetExam}>
              <Square size={18} />
              Reset chamber
            </button>
          </section>
        )}
      </section>
      )}
    </main>
  )
}
