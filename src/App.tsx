import {
  AudioLines,
  BadgeCheck,
  Brain,
  GitBranch,
  KeyRound,
  Mic,
  OctagonPause,
  Play,
  Send,
  ShieldCheck,
  Square,
  TimerReset,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { RealtimeAgent, RealtimeSession } from '@openai/agents/realtime'
import type { RealtimeItem } from '@openai/agents/realtime'
import './App.css'
import {
  beginExam,
  canAskFollowUp,
  createInitialExamState,
  getCurrentQuestion,
  markAsking,
  markQuestionAsked,
  recordAnswer,
  recordFollowUp,
  summarizeProgress,
  type ExamState,
} from './domain/examState'
import type { ExamMetrics, ExamReport, ExamTurn, TopicId } from './domain/schemas'
import { getTopicById, topics } from './domain/topics'
import {
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

export default function App() {
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [topicId, setTopicId] = useState<TopicId>('tunneling')
  const topic = useMemo(() => getTopicById(topicId), [topicId])
  const [exam, setExam] = useState<ExamState>(() => createInitialExamState(topic))
  const [entries, setEntries] = useState<TranscriptEntry[]>([])
  const [mainAnswer, setMainAnswer] = useState('')
  const [followUpAnswer, setFollowUpAnswer] = useState('')
  const [activePart, setActivePart] = useState<ActiveAnswerPart>('main')
  const [metrics, setMetrics] = useState<ExamMetrics>(() => createEmptyMetrics())
  const [report, setReport] = useState<ExamReport | null>(null)
  const [statusMessage, setStatusMessage] = useState('Select a topic to begin.')
  const [isConnected, setIsConnected] = useState(false)
  const [isDemoMode, setIsDemoMode] = useState(false)
  const [appError, setAppError] = useState<string | null>(null)

  const sessionRef = useRef<RealtimeSession | null>(null)
  const consumedIdsRef = useRef<Set<string>>(new Set())
  const sessionStartedAtRef = useRef<number | null>(null)
  const pendingPromptStartedAtRef = useRef<number | null>(null)

  useEffect(() => {
    let isMounted = true

    fetchJson<AppConfig>('/api/config')
      .then((nextConfig) => {
        if (isMounted) {
          setConfig(nextConfig)
        }
      })
      .catch((error: unknown) => {
        if (isMounted) {
          setAppError(normalizeError(error))
        }
      })

    return () => {
      isMounted = false
      sessionRef.current?.close()
    }
  }, [])

  function resetForTopic(nextTopicId: TopicId) {
    sessionRef.current?.close()
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
    setAppError(null)
    setStatusMessage('Topic armed. Begin when ready.')
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
    setStatusMessage('Typed demo mode is active. The live voice path unlocks after .env setup.')
  }

  async function startVoiceExam() {
    setAppError(null)
    setReport(null)
    setEntries([])
    setMainAnswer('')
    setFollowUpAnswer('')
    setActivePart('main')
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
    setStatusMessage('Requesting a short-lived Realtime credential...')

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
              speed: 0.93,
            },
          },
          reasoning: {
            effort: 'low',
          },
        },
      })

      session.on('history_updated', updateTranscript)
      session.on('audio_start', markPromptLatency)
      session.on('audio_interrupted', () => {
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
      setStatusMessage('Connected. The examiner is speaking.')

      const askingExam = markQuestionAsked(markAsking(startingExam))
      setExam(askingExam)
      sendVoicePrompt(buildQuestionPrompt(getCurrentQuestion(topic, askingExam), 1))
    } catch (error: unknown) {
      setExam(createInitialExamState(topic))
      setIsConnected(false)
      setAppError(normalizeError(error))
      setStatusMessage('Voice connection failed. Typed demo mode is still available.')
    }
  }

  function askFollowUp() {
    if (!canAskFollowUp(topic, exam)) {
      return
    }

    const speech = takeFreshSpeech()
    if (speech) {
      setMainAnswer((current) => appendText(current, speech))
    }

    const nextExam = recordFollowUp(topic, exam)
    const question = getCurrentQuestion(topic, nextExam)
    setExam(nextExam)
    setActivePart('follow-up')
    setStatusMessage('One follow-up has been used for this answer.')

    if (!isDemoMode) {
      sendVoicePrompt(buildFollowUpPrompt(question))
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
    setStatusMessage('Generating the scorecard...')

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
      setStatusMessage('Scorecard ready.')
    } catch (error: unknown) {
      setAppError(normalizeError(error))
      setStatusMessage('Could not grade the exam.')
    }
  }

  function saveAnswerAndAdvance() {
    const freshSpeech = takeFreshSpeech()
    const nextMain =
      activePart === 'main' ? appendText(mainAnswer, freshSpeech) : mainAnswer.trim()
    const nextFollowUp =
      activePart === 'follow-up'
        ? appendText(followUpAnswer, freshSpeech)
        : followUpAnswer.trim()
    const capturedAnswer = nextMain || 'No answer captured.'
    const nextExam = recordAnswer(topic, exam, capturedAnswer, nextFollowUp)

    setMainAnswer('')
    setFollowUpAnswer('')
    setActivePart('main')
    setExam(nextExam)

    if (nextExam.phase === 'grading') {
      void gradeExam(nextExam.completedTurns)
      return
    }

    const nextQuestion = getCurrentQuestion(topic, nextExam)
    const nextQuestionNumber = nextExam.questionIndex + 1
    const askingExam = markQuestionAsked(nextExam)
    setExam(askingExam)
    setStatusMessage(`Question ${nextQuestionNumber} of ${topic.questions.length}.`)

    if (!isDemoMode) {
      sendVoicePrompt(buildQuestionPrompt(nextQuestion, nextQuestionNumber))
    }
  }

  function interruptExaminer() {
    sessionRef.current?.interrupt()
    setMetrics((current) => ({
      ...current,
      interruptions: current.interruptions + 1,
    }))
  }

  function resetExam() {
    sessionRef.current?.close()
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
    setAppError(null)
    setStatusMessage('Exam reset.')
  }

  const currentQuestion = getCurrentQuestion(topic, exam)
  const canStart = exam.phase === 'idle' || exam.phase === 'report' || exam.phase === 'error'
  const canAnswer = exam.phase === 'answering'
  const canGradeEarly =
    exam.completedTurns.length > 0 && exam.phase !== 'grading' && exam.phase !== 'report'
  const setupLabel = config?.hasApiKey ? 'Voice ready' : 'Setup needed'

  return (
    <main className="app-shell">
      <section className="exam-panel" aria-label="Quantum Villain Viva exam console">
        <div className="exam-header">
          <div>
            <p className="eyebrow">Quantum Villain Viva</p>
            <h1>Professor Nocturne is ready to examine your wavefunction.</h1>
          </div>
          <div className="model-badge" aria-label={setupLabel}>
            <KeyRound size={18} />
            <span>{setupLabel}</span>
          </div>
        </div>

        <div className="topic-grid" aria-label="Topic selection">
          {topics.map((candidate) => (
            <button
              type="button"
              className={candidate.id === topic.id ? 'topic-card selected' : 'topic-card'}
              key={candidate.id}
              onClick={() => resetForTopic(candidate.id)}
            >
              <span>{candidate.shortName}</span>
              <small>{candidate.premise}</small>
            </button>
          ))}
        </div>

        <div className="question-strip">
          <div>
            <span className="label">Current topic</span>
            <strong>{topic.title}</strong>
          </div>
          <div>
            <span className="label">Progress</span>
            <strong>{summarizeProgress(topic, exam)}</strong>
          </div>
          <div>
            <span className="label">Mode</span>
            <strong>{isDemoMode ? 'Typed demo' : isConnected ? 'Live voice' : 'Local ready'}</strong>
          </div>
        </div>

        <div className="question-box">
          <div className="wave-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <p className="label">Examiner prompt</p>
          <h2>{currentQuestion.prompt}</h2>
          <p>{currentQuestion.followUp}</p>
        </div>

        <div className="controls" aria-label="Exam controls">
          {canStart ? (
            <>
              <button type="button" className="primary" onClick={() => void startVoiceExam()}>
                <Play size={18} />
                Start exam
              </button>
              {!config?.hasApiKey ? (
                <button type="button" className="secondary" onClick={startDemoExam}>
                  <Send size={18} />
                  Typed demo
                </button>
              ) : null}
            </>
          ) : (
            <>
              <button
                type="button"
                className="secondary"
                onClick={askFollowUp}
                disabled={!canAnswer || !canAskFollowUp(topic, exam)}
              >
                <AudioLines size={18} />
                Ask follow-up
              </button>
              <button
                type="button"
                className="primary"
                onClick={saveAnswerAndAdvance}
                disabled={!canAnswer}
              >
                <Send size={18} />
                Save answer
              </button>
              <button
                type="button"
                className="icon-button"
                aria-label="Interrupt examiner"
                title="Interrupt examiner"
                onClick={interruptExaminer}
                disabled={!isConnected}
              >
                <OctagonPause size={18} />
              </button>
              <button
                type="button"
                className="icon-button"
                aria-label="Reset exam"
                title="Reset exam"
                onClick={resetExam}
              >
                <Square size={18} />
              </button>
            </>
          )}
        </div>

        <div className="answer-grid">
          <label>
            <span>Main answer</span>
            <textarea
              value={mainAnswer}
              onChange={(event) => setMainAnswer(event.target.value)}
              placeholder="Speak your answer, or type here for the no-key demo."
            />
          </label>
          <label>
            <span>Follow-up answer</span>
            <textarea
              value={followUpAnswer}
              onChange={(event) => setFollowUpAnswer(event.target.value)}
              placeholder="Used only after the single follow-up."
            />
          </label>
        </div>

        <p className="status-line" role="status">
          {statusMessage}
        </p>
        {appError ? <p className="error-line">{appError}</p> : null}

        {canGradeEarly ? (
          <button
            type="button"
            className="secondary compact"
            onClick={() => void gradeExam(exam.completedTurns)}
          >
            End exam and grade
          </button>
        ) : null}
      </section>

      <aside className="side-panel">
        <section className="setup-panel">
          <div className="panel-title">
            <ShieldCheck size={18} />
            <h2>Setup status</h2>
          </div>
          <p>
            {config?.hasApiKey
              ? `Realtime is configured with ${config.realtimeModel} and voice ${config.realtimeVoice}.`
              : 'Add OPENAI_API_KEY to .env to enable the microphone path. Until then, typed demo mode and the local grader still run.'}
          </p>
          <div className="setup-list">
            <span>
              <Mic size={16} />
              Browser voice via Realtime
            </span>
            <span>
              <Brain size={16} />
              Deterministic exam state
            </span>
            <span>
              <GitBranch size={16} />
              Private GitHub-ready repo
            </span>
          </div>
          {config?.openSourceRoadmap.length ? (
            <div className="roadmap">
              <span>Open-source path</span>
              <ol>
                {config.openSourceRoadmap.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ol>
            </div>
          ) : null}
        </section>

        <section className="metrics-panel">
          <div className="panel-title">
            <TimerReset size={18} />
            <h2>Demo metrics</h2>
          </div>
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
        </section>

        <section className="transcript-panel">
          <div className="panel-title">
            <AudioLines size={18} />
            <h2>Transcript</h2>
          </div>
          {entries.length === 0 ? (
            <p className="empty-state">Voice transcript appears here after a live session starts.</p>
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
        </section>

        {report ? (
          <section className="report-panel">
            <div className="panel-title">
              <BadgeCheck size={18} />
              <h2>Scorecard</h2>
            </div>
            <div className="score">
              <strong>
                {report.totalScore}/{report.maxScore}
              </strong>
              <span>{report.source === 'openai' ? 'OpenAI rubric grade' : 'Local heuristic grade'}</span>
            </div>
            <p>{report.summary}</p>
            <ul>
              {report.reviewSuggestions.map((suggestion) => (
                <li key={suggestion}>{suggestion}</li>
              ))}
            </ul>
          </section>
        ) : null}
      </aside>
    </main>
  )
}
