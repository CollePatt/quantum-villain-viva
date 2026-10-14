import { useCallback, useEffect, useRef, useState } from 'react'
import type { RealtimeItem, RealtimeSession } from '@openai/agents/realtime'
import './App.css'
import { gradeChoice, gradeExamLocally, matchChoice } from './domain/grading'
import {
  advanceTier,
  describePath,
  nextQuestion,
  replayRound,
  ROUND_LENGTH,
  START_TIER,
  tierOfQuestion,
  type TierEvent,
  type TierState,
} from './domain/round'
import type { ExamMetrics, ExamReport, ExamTurn, Level, Question, QuestionGrade, Topic } from './domain/schemas'
import { questionPoints, roundTotal, TIER_POINTS, type TurnPlay } from './domain/scoring'
import { getTopicById, topics } from './domain/topics'
import { HomeScreen, type TopicChoice } from './components/HomeScreen'
import { Leaderboard } from './components/Leaderboard'
import type { ObserverMood } from './components/Observer'
import { PlayScreen, type VoiceMode } from './components/PlayScreen'
import { ResultsScreen, type ScoredQuestion } from './components/ResultsScreen'
import { useLeaderboard } from './hooks/useLeaderboard'
import { useSpeechRecognition } from './hooks/useSpeechRecognition'
import { detectInAppBrowser } from './lib/inAppBrowser'
import { prepareVillainVoice, type VillainVoice } from './lib/villainVoice'
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
  buildHintToolResult,
  buildQuestionPrompt,
  buildVillainInstructions,
  spokenQuestion,
  type Verdict,
} from './lib/examPrompts'
import { speakLocally, stopLocalSpeech } from './lib/localVoice'
import { extractTranscriptEntries } from './lib/transcript'
import { villainLines } from './lib/villainLines'
import { z } from 'zod'

type Screen = 'home' | 'play' | 'results'
type Phase = 'idle' | 'answering' | 'judging' | 'done'
type GradedReport = ExamReport & { scoreToken?: string; seals?: Record<string, string> }

// One locked-in answer, graded the moment it was given.
type RoundAnswer = {
  question: Question
  tier: Level
  turn: ExamTurn
  grade: QuestionGrade
  play: TurnPlay
}

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
const ASK_WAIT_CAP_MS = 15000

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

function verdictFor(score: number): Verdict {
  return score >= 2 ? 'strong' : score >= 1 ? 'partial' : 'miss'
}

const LETTERS = ['A', 'B', 'C']
// A hard answer is graded before the next question, so the wait is capped.
const JUDGE_TIMEOUT_MS = 8000

function readBests(): Record<string, number> {
  try {
    return JSON.parse(readStored(BESTS_STORAGE_KEY) || '{}') as Record<string, number>
  } catch {
    return {}
  }
}

// getUserMedia rejects with these when the browser or an in-app webview refuses the mic.
function isMicDenied(error: unknown): boolean {
  const name = error instanceof Error || error instanceof DOMException ? error.name : ''
  return ['NotAllowedError', 'NotFoundError', 'SecurityError', 'NotReadableError'].includes(name)
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

export default function App() {
  const [config, setConfig] = useState<AppConfig | null>(() =>
    isStaticPreview() ? STATIC_PREVIEW_CONFIG : null,
  )
  const [screen, setScreen] = useState<Screen>('home')
  const [boardLevel, setBoardLevel] = useState<Level>('physicist')
  const [topicChoice, setTopicChoice] = useState<TopicChoice>('random')
  const [roundTopic, setRoundTopic] = useState<Topic>(() => getTopicById('tunneling'))
  const [question, setQuestion] = useState<Question>(() => getTopicById('tunneling').questions[0])
  const [phase, setPhase] = useState<Phase>('idle')
  const [tierState, setTierState] = useState<TierState>(START_TIER)
  const [answers, setAnswers] = useState<RoundAnswer[]>([])
  const [tierBanner, setTierBanner] = useState<TierEvent>(null)
  const [struckChoice, setStruckChoice] = useState<number | null>(null)
  const [answer, setAnswer] = useState('')
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
  const [micBlocked, setMicBlocked] = useState<string | null>(null)
  const [inAppBrowser] = useState(() =>
    typeof navigator === 'undefined' ? null : detectInAppBrowser(navigator.userAgent),
  )
  const [metrics, setMetrics] = useState<ExamMetrics>(createEmptyMetrics)
  const [accessCode, setAccessCode] = useState(readAccessCode)
  const [isBoardOpen, setIsBoardOpen] = useState(false)
  const [bests, setBests] = useState<Record<string, number>>(readBests)

  const sessionRef = useRef<RealtimeSession | null>(null)
  const phaseRef = useRef<Phase>('idle')
  const questionRef = useRef(question)
  const tierStateRef = useRef<TierState>(START_TIER)
  const answersRef = useRef<RoundAnswer[]>([])
  const roundIdRef = useRef(0)
  const answerRef = useRef(answer)
  const elapsedRef = useRef(0)
  const isSpeakingRef = useRef(false)
  const graceUntilRef = useRef(0)
  const transcriptPendingRef = useRef(false)
  const lockingRef = useRef(false)
  const sessionStartedAtRef = useRef<number | null>(null)
  const pendingPromptStartedAtRef = useRef<number | null>(null)
  const lockInRef = useRef<(choice?: number) => void>(() => undefined)
  // The live Observer calls these tools mid-conversation; they always see the latest state.
  const toolLockInRef = useRef<() => Promise<string | null>>(async () => null)
  const toolHintRef = useRef<() => string | null>(() => null)
  const responseActiveRef = useRef(false)
  const askPendingUntilRef = useRef(0)
  const villainVoiceRef = useRef<VillainVoice | null>(null)
  const moodTimerRef = useRef(0)
  const bannerTimerRef = useRef(0)

  const board = useLeaderboard(boardLevel)
  const speech = useSpeechRecognition(
    useCallback((text: string) => setAnswer((current) => appendText(current, text)), []),
  )

  const tier = tierOfQuestion(question)
  const timeLimit = TIER_POINTS[tier].seconds

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
  }, [screen, question.id])

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
  const isAnswering = screen === 'play' && phase === 'answering' && !isConnecting && !isGrading
  useEffect(() => {
    if (!isAnswering) {
      return
    }
    const interval = window.setInterval(() => {
      const now = Date.now()
      if (isSpeakingRef.current || lockingRef.current || now < graceUntilRef.current || now < askPendingUntilRef.current) {
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

  // A spoken "B" or "the second one" locks in a multiple-choice answer.
  useEffect(() => {
    const choices = question.choices
    if (!choices || phase !== 'answering' || !answer) {
      return
    }
    const picked = matchChoice(answer, choices)
    if (picked !== null) {
      lockInRef.current(picked)
    }
  }, [answer, question, phase])

  function setPhaseNow(next: Phase) {
    phaseRef.current = next
    setPhase(next)
  }

  function showQuestion(next: Question) {
    questionRef.current = next
    setQuestion(next)
    elapsedRef.current = 0
    setElapsed(0)
    graceUntilRef.current = Date.now() + QUESTION_GRACE_MS
    // With live voice, hold the clock until the question has been spoken (with a safety cap).
    askPendingUntilRef.current = sessionRef.current ? Date.now() + ASK_WAIT_CAP_MS : 0
    setUsedHint(false)
    setStruckChoice(null)
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

  function flashBanner(event: TierEvent) {
    window.clearTimeout(bannerTimerRef.current)
    setTierBanner(event)
    bannerTimerRef.current = window.setTimeout(() => setTierBanner(null), 2400)
  }

  function closeSession() {
    sessionRef.current?.close()
    sessionRef.current = null
    villainVoiceRef.current?.close()
    villainVoiceRef.current = null
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
    if (responseActiveRef.current) {
      // The Observer may be mid-chat; the game's own line takes priority.
      session.interrupt()
      responseActiveRef.current = false
    }
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
    const topic = getTopicById(topicId)

    closeSession()
    roundIdRef.current += 1
    setRoundTopic(topic)
    tierStateRef.current = START_TIER
    setTierState(START_TIER)
    answersRef.current = []
    setAnswers([])
    setTierBanner(null)
    setReport(null)
    setNotice(null)
    setMicBlocked(null)
    setVillainLine('')
    setMetrics({ ...createEmptyMetrics(), sessionStartedAt: new Date().toISOString() })
    sessionStartedAtRef.current = performance.now()
    showQuestion(topic.questions[0])
    setPhaseNow('idle')
    setScreen('play')

    const useLiveVoice =
      Boolean(config?.hasApiKey) && (!config?.requiresAccessCode || accessCode.trim().length > 0)
    if (useLiveVoice) {
      // Set up the voice effect inside the tap, while the browser still allows audio.
      villainVoiceRef.current?.close()
      villainVoiceRef.current = prepareVillainVoice()
      void startRealtime(topic)
    } else {
      startLocal(topic)
    }
  }

  function askFirstQuestion(topic: Topic, mode: VoiceMode) {
    const first = topic.questions[0]
    showQuestion(first)
    setPhaseNow('answering')
    const opener = villainLines.opener()
    deliver(mode, buildQuestionPrompt(first, 1, opener), opener, `${opener} ${spokenQuestion(first)}`)
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
    const roundId = roundIdRef.current

    try {
      const token = await fetchJson<TokenResponse>('/api/realtime-token', {
        method: 'POST',
        headers: accessHeaders(accessCode),
        body: JSON.stringify({ topicId: topic.id }),
      })

      // Loaded on demand so the first screen stays light on phones.
      const { OpenAIRealtimeWebRTC, RealtimeAgent, RealtimeSession, tool } = await import('@openai/agents/realtime')
      const agent = new RealtimeAgent({
        name: 'The Observer',
        instructions: buildVillainInstructions(topic),
        voice: token.realtimeVoice,
        tools: [
          tool({
            name: 'lock_in_answer',
            description: 'Lock in the player’s answer once they have clearly given it. Returns the verdict and what to say next.',
            parameters: z.object({}),
            execute: async () =>
              (await toolLockInRef.current()) ?? 'Nothing to lock in right now. Say nothing and keep listening.',
          }),
          tool({
            name: 'use_hint',
            description: 'Give the player a hint when they ask for one. It costs them points.',
            parameters: z.object({}),
            execute: async () => toolHintRef.current() ?? 'No hint available. Tell them they already used it.',
          }),
        ],
      })
      const voice = villainVoiceRef.current
      const session = new RealtimeSession(agent, {
        model: token.realtimeModel,
        ...(voice
          ? {
              transport: new OpenAIRealtimeWebRTC({
                audioElement: voice.audioElement,
                changePeerConnection: voice.changePeerConnection,
              }),
            }
          : {}),
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
                // The Observer answers the player directly, so it feels like a conversation.
                createResponse: true,
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
      session.on('audio_start', observerStartedSpeaking)
      session.on('audio_stopped', observerStoppedSpeaking)
      session.on('audio_interrupted', () => {
        observerStoppedSpeaking()
        setMetrics((current) => ({ ...current, interruptions: current.interruptions + 1 }))
      })

      sessionRef.current = session
      await session.connect({ apiKey: token.clientSecret, model: token.realtimeModel })
      if (roundId !== roundIdRef.current) {
        session.close()
        return
      }
      setIsConnecting(false)
      askFirstQuestion(topic, 'realtime')
    } catch (error) {
      sessionRef.current?.close()
      sessionRef.current = null
      if (roundId === roundIdRef.current) {
        if (isMicDenied(error)) {
          setMicBlocked('Microphone blocked here. Type your answer instead.')
          startLocal(topic)
        } else {
          startLocal(topic, 'Live voice is busy, so the Observer is using your browser’s voice.')
        }
      }
    }
  }

  // Over WebRTC the SDK's audio_start/audio_stopped never fire, so playback events drive these too.
  function observerStartedSpeaking() {
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
    isSpeakingRef.current = true
    setIsSpeaking(true)
  }

  function observerStoppedSpeaking() {
    isSpeakingRef.current = false
    setIsSpeaking(false)
    // The clock for a new question starts once the Observer has finished asking it.
    if (askPendingUntilRef.current) {
      askPendingUntilRef.current = 0
      graceUntilRef.current = Date.now() + 400
    }
  }

  function handleTransportEvent(event: RealtimeTransportEvent) {
    switch (event.type) {
      case 'output_audio_buffer.started':
        observerStartedSpeaking()
        break
      case 'output_audio_buffer.stopped':
      case 'output_audio_buffer.cleared':
        observerStoppedSpeaking()
        break
      case 'response.created':
        responseActiveRef.current = true
        break
      case 'response.done':
        responseActiveRef.current = false
        break
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

  // Grades one spoken answer straight away, because the grade decides the player's tier.
  async function judgeSpoken(turn: ExamTurn): Promise<{ grade: QuestionGrade; seal?: string }> {
    const local = () => ({ grade: gradeExamLocally(roundTopic, [turn], metrics).perQuestion[0] })
    if (isStaticPreview()) {
      return local()
    }
    try {
      const graded = await Promise.race([
        fetchJson<GradedReport>('/api/grade-exam', {
          method: 'POST',
          headers: accessHeaders(accessCode),
          body: JSON.stringify({ topicId: roundTopic.id, turns: [turn], metrics }),
        }),
        wait(JUDGE_TIMEOUT_MS).then(() => {
          throw new Error('Grading took too long.')
        }),
      ])
      const grade = graded.perQuestion[0]
      return grade ? { grade, seal: graded.seals?.[turn.questionId] } : local()
    } catch {
      return local()
    }
  }

  // Returns the Observer's next instructions when the live voice asked for the lock-in itself.
  async function lockIn(choice?: number, viaTool = false): Promise<string | null> {
    if (lockingRef.current || phaseRef.current !== 'answering') {
      return null
    }
    const answerViaTool = viaTool && voiceMode === 'realtime' && Boolean(sessionRef.current)
    lockingRef.current = true
    setIsLocking(true)
    const roundId = roundIdRef.current
    const asked = questionRef.current
    const askedTier = tierOfQuestion(asked)

    // Give live transcription a moment to deliver the player's last words.
    if (voiceMode === 'realtime' && !asked.choices && choice === undefined) {
      const deadline = Date.now() + 3000
      while (transcriptPendingRef.current && Date.now() < deadline) {
        await wait(100)
      }
    }
    speech.stop()
    stopLocalSpeech()

    const spokenAnswer = answerRef.current.trim()
    const choiceIndex = asked.choices
      ? (choice ?? matchChoice(spokenAnswer, asked.choices) ?? undefined)
      : undefined
    const answerText =
      asked.choices && choiceIndex !== undefined
        ? `${LETTERS[choiceIndex]}. ${asked.choices[choiceIndex]}`
        : spokenAnswer || 'No answer captured.'
    const play: TurnPlay = { secondsUsed: Math.round(elapsedRef.current * 10) / 10, usedHint }
    const turn: ExamTurn = {
      questionId: asked.id,
      question: asked.prompt,
      answer: answerText,
      choiceIndex,
      ...play,
    }

    setPhaseNow('judging')
    let graded: { grade: QuestionGrade; seal?: string }
    if (asked.choices) {
      graded = { grade: gradeChoice(asked, choiceIndex) }
    } else {
      setVillainLine(villainLines.measuring)
      graded = await judgeSpoken(turn)
    }
    lockingRef.current = false
    setIsLocking(false)
    if (roundId !== roundIdRef.current) {
      return null
    }

    const isLast = answersRef.current.length + 1 >= ROUND_LENGTH
    const { state: nextTier, event } = advanceTier(tierStateRef.current, graded.grade.score, isLast)
    const record: RoundAnswer = {
      question: asked,
      tier: askedTier,
      turn: { ...turn, seal: graded.seal },
      grade: graded.grade,
      play,
    }
    const nextAnswers = [...answersRef.current, record]
    answersRef.current = nextAnswers
    setAnswers(nextAnswers)
    tierStateRef.current = nextTier
    setTierState(nextTier)

    const score = graded.grade.score
    const isFirst = nextAnswers.length === 1
    const line =
      event === 'collapsed' || event === 'promoted' || event === 'too-late' || (event === 'survived' && isFirst)
        ? villainLines.tier(event)
        : villainLines.reaction(score >= 2)
    if (event === 'collapsed') {
      flashMood('rolling', 2600)
      flashBanner('collapsed')
    } else if (event === 'promoted') {
      flashMood('suspicious', 2600)
      flashBanner('promoted')
    } else {
      flashMood(score >= 2 ? 'impressed' : score >= 1 ? 'smug' : spokenAnswer || choiceIndex !== undefined ? 'smug' : 'angry', 2400)
    }
    const verdict = verdictFor(score)

    if (isLast) {
      setPhaseNow('done')
      const finalPrompt = buildFinalAnswerPrompt(asked, answerText, verdict, line)
      if (answerViaTool) {
        setVillainLine(line)
        void finish(nextAnswers, nextTier.tier, roundId)
        return finalPrompt
      }
      deliver(voiceMode, finalPrompt, line, `${line} ${villainLines.final}`)
      await finish(nextAnswers, nextTier.tier, roundId)
      return null
    }

    const upcoming = nextQuestion(
      roundTopic,
      nextTier.tier,
      nextAnswers.map((item) => item.question.id),
    )
    showQuestion(upcoming)
    setPhaseNow('answering')
    const transition = buildAnswerTransitionPrompt(asked, answerText, verdict, line, upcoming, nextAnswers.length + 1)
    if (answerViaTool) {
      setVillainLine(line)
      return transition
    }
    deliver(voiceMode, transition, line, `${line} ${spokenQuestion(upcoming)}`)
    return null
  }
  useEffect(() => {
    lockInRef.current = (choice?: number) => void lockIn(choice)
    toolLockInRef.current = () => lockIn(undefined, true)
    toolHintRef.current = () => takeHint(true)
  })

  // Returns what the live Observer should say when it gave the hint itself.
  function takeHint(viaTool = false): string | null {
    if (usedHint || phaseRef.current !== 'answering') {
      return null
    }
    setUsedHint(true)
    const current = questionRef.current
    let struck: number | null = null
    if (current.choices) {
      const wrong = current.choices.map((_, index) => index).filter((index) => index !== current.answer)
      struck = wrong[Math.floor(Math.random() * wrong.length)]
      setStruckChoice(struck)
    }
    flashMood('smug', 2000)
    const taunt = villainLines.hint()
    if (viaTool) {
      const hint = current.choices
        ? `It is not ${LETTERS[struck ?? 0]}, ${current.choices[struck ?? 0]}.`
        : (current.hint ?? `Think about ${current.expectedConcepts[0]}.`)
      return buildHintToolResult(hint)
    }
    if (voiceMode === 'realtime' && sessionRef.current) {
      sendVoicePrompt(buildHintTauntPrompt())
    } else {
      speakLine(taunt, taunt)
    }
    return null
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

  // ---------- results ----------

  // Every answer already has a grade. The server re-checks them (reusing sealed grades)
  // and signs the scoreboard token.
  async function finish(finalAnswers: RoundAnswer[], finalTier: Level, roundId: number) {
    setIsGrading(true)
    const finalMetrics: ExamMetrics = {
      ...metrics,
      sessionEndedAt: new Date().toISOString(),
      durationMs:
        sessionStartedAtRef.current === null ? 0 : Math.max(0, performance.now() - sessionStartedAtRef.current),
    }
    setMetrics(finalMetrics)

    const turns = finalAnswers.map((item) => item.turn)
    const local: GradedReport = {
      ...gradeExamLocally(roundTopic, [], finalMetrics),
      totalScore: finalAnswers.reduce((sum, item) => sum + item.grade.score, 0),
      maxScore: finalAnswers.length * 2,
      perQuestion: finalAnswers.map((item) => item.grade),
    }
    let graded: GradedReport = local
    if (!isStaticPreview()) {
      try {
        const checked = await fetchJson<GradedReport>('/api/grade-exam', {
          method: 'POST',
          headers: accessHeaders(accessCode),
          body: JSON.stringify({ topicId: roundTopic.id, turns, metrics: finalMetrics }),
        })
        // Only take the server's grades if they tell the same tier story the player just saw.
        const serverTier = replayRound(
          turns.map((turn) => turn.questionId),
          checked.perQuestion.map((grade) => grade.score),
        )
        graded = serverTier === finalTier ? checked : local
      } catch {
        graded = local
      }
    }

    // Let the Observer start and finish his last line before the results replace the screen.
    const startBy = Date.now() + 2500
    while (voiceMode === 'realtime' && !isSpeakingRef.current && Date.now() < startBy) {
      await wait(150)
    }
    const deadline = Date.now() + 6000
    while (isSpeakingRef.current && Date.now() < deadline) {
      await wait(150)
    }
    if (roundId !== roundIdRef.current) {
      return
    }

    const total = roundTotal(scoreQuestions(graded, finalAnswers).map((item) => item.points))
    const bestKey = `${finalTier}:${roundTopic.id}`
    if (total > (bests[bestKey] ?? -1)) {
      const nextBests = { ...bests, [bestKey]: total }
      setBests(nextBests)
      writeStored(BESTS_STORAGE_KEY, JSON.stringify(nextBests))
    }

    closeSession()
    setReport(graded)
    setBoardLevel(finalTier)
    setIsGrading(false)
    setScreen('results')
  }

  function scoreQuestions(graded: ExamReport, finalAnswers: RoundAnswer[]): ScoredQuestion[] {
    return finalAnswers.map((item, index) => {
      const grade =
        graded.perQuestion.find((candidate) => candidate.questionId === item.question.id) ??
        graded.perQuestion[index] ??
        item.grade
      return {
        prompt: item.question.prompt,
        tier: item.tier,
        rubricScore: grade.score,
        feedback: grade.feedback,
        missing: grade.missingIdeas,
        points: questionPoints(grade.score, item.play, item.tier),
      }
    })
  }

  const scored = report ? scoreQuestions(report, answers) : []
  const totalPoints = roundTotal(scored.map((item) => item.points))
  const finalTier = tierState.tier
  const path = describePath(
    answers.map((item) => item.tier),
    finalTier,
  )

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
    roundIdRef.current += 1
    closeSession()
    lockingRef.current = false
    setIsLocking(false)
    setPhaseNow('idle')
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
          topicChoice={topicChoice}
          onTopicChange={setTopicChoice}
          needsAccessCode={Boolean(config?.requiresAccessCode)}
          accessCode={accessCode}
          onAccessCodeChange={setAccessCode}
          isLiveVoice={Boolean(config?.hasApiKey)}
          inAppBrowser={inAppBrowser}
          onStart={startRound}
          onOpenBoard={() => {
            setIsBoardOpen(true)
            void board.refresh()
          }}
        />
      ) : null}

      {screen === 'play' ? (
        <PlayScreen
          question={question}
          questionIndex={answers.length}
          tier={tier}
          streak={tierState.tier === 'curious' ? tierState.streak : 0}
          askedTiers={[...answers.map((item) => item.tier), tier]}
          tierBanner={tierBanner}
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
          micError={speech.error ?? micBlocked}
          villainLine={villainLine}
          usedHint={usedHint}
          struckChoice={struckChoice}
          onHint={() => takeHint()}
          isLocking={isLocking}
          isJudging={phase === 'judging' && !isGrading}
          isGrading={isGrading}
          onLockIn={() => void lockIn()}
          onChoose={(index) => void lockIn(index)}
          onQuit={quit}
          notice={notice}
        />
      ) : null}

      {screen === 'results' && report ? (
        <ResultsScreen
          topic={roundTopic}
          tier={finalTier}
          path={path}
          report={report}
          totalPoints={totalPoints}
          questions={scored}
          canPost={Boolean(report.scoreToken)}
          boardEnabled={board.enabled}
          boardEntries={board.entries}
          boardLoading={board.isLoading}
          personalBest={bests[`${finalTier}:${roundTopic.id}`] ?? null}
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
              <div className="segmented mini" role="radiogroup" aria-label="Scoreboard tier">
                {(['physicist', 'curious'] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    role="radio"
                    aria-checked={boardLevel === option}
                    className={boardLevel === option ? 'active' : ''}
                    onClick={() => setBoardLevel(option)}
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
