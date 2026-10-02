import { createHmac, randomBytes } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'

const TOPICS = [
  {
    id: 'tunneling',
    title: 'Quantum Tunneling',
    questions: [
      {
        id: 'tunneling-1',
        prompt:
          'A particle approaches a finite potential barrier with energy below the barrier height. Explain why transmission can still occur.',
        expectedConcepts: [
          'wavefunction penetrates the classically forbidden region',
          'exponential decay inside the barrier',
          'nonzero amplitude on the far side',
          'probability current or boundary matching',
        ],
        commonMisconception:
          'Treating the particle as secretly borrowing energy to climb over the barrier.',
      },
      {
        id: 'tunneling-2',
        prompt:
          'How does the tunneling probability change when the barrier gets wider or taller?',
        expectedConcepts: [
          'probability decreases exponentially with barrier width',
          'probability decreases as barrier height exceeds particle energy',
          'decay constant depends on square root of barrier height minus energy',
        ],
        commonMisconception:
          'Assuming the probability decreases linearly with barrier width.',
      },
      {
        id: 'tunneling-3',
        prompt:
          'Give one real physical example where tunneling matters and explain the mechanism briefly.',
        expectedConcepts: [
          'alpha decay or scanning tunneling microscopy or fusion',
          'barrier penetration',
          'measurable transmission despite classical prohibition',
        ],
        commonMisconception:
          'Giving an example with no actual classically forbidden barrier.',
      },
    ],
  },
  {
    id: 'measurement',
    title: 'Measurement and Collapse',
    questions: [
      {
        id: 'measurement-1',
        prompt:
          'What does it mean to measure an observable in a quantum state?',
        expectedConcepts: [
          'observables correspond to operators',
          'possible outcomes are eigenvalues',
          'probabilities come from projection amplitudes',
          'state updates to an eigenstate or eigenspace',
        ],
        commonMisconception:
          'Saying measurement merely reveals a pre-existing value in every case.',
      },
      {
        id: 'measurement-2',
        prompt:
          'If a state is already an eigenstate of the measured observable, what happens on repeated measurements?',
        expectedConcepts: [
          'same eigenvalue is obtained with certainty',
          'state remains in that eigenstate under ideal measurement',
          'repeatability depends on measuring the same observable',
        ],
        commonMisconception:
          'Assuming every measurement necessarily randomizes the state.',
      },
      {
        id: 'measurement-3',
        prompt:
          'Why can measuring one observable disturb predictions for another observable?',
        expectedConcepts: [
          'noncommuting observables',
          'measurement changes the state',
          'new state may not be an eigenstate of the second observable',
          'uncertainty is structural not just instrumental',
        ],
        commonMisconception:
          'Blaming only clumsy instruments or experimental noise.',
      },
    ],
  },
  {
    id: 'spin',
    title: 'Spin and Stern-Gerlach',
    questions: [
      {
        id: 'spin-1',
        prompt:
          'A spin one-half particle is prepared spin-up along z. What outcomes are possible when measuring spin along z?',
        expectedConcepts: [
          'only up along z occurs for the prepared eigenstate',
          'probability one for plus hbar over two',
          'measurement basis matches preparation basis',
        ],
        commonMisconception:
          'Claiming up and down are equally likely even in the prepared z eigenstate.',
      },
      {
        id: 'spin-2',
        prompt:
          'Now measure that same spin-up-z particle along x. What outcomes and probabilities do you expect?',
        expectedConcepts: [
          'plus x and minus x are possible',
          'equal probabilities one half each',
          'z-up is a superposition in the x basis',
        ],
        commonMisconception:
          'Assuming spin-up-z means spin-up in every direction.',
      },
      {
        id: 'spin-3',
        prompt:
          'What did the Stern-Gerlach experiment reveal that was surprising classically?',
        expectedConcepts: [
          'discrete beam splitting',
          'quantized angular momentum projection',
          'two outcomes for spin one-half',
          'not a continuous smear of magnetic moments',
        ],
        commonMisconception:
          'Describing the result as a continuous classical deflection pattern.',
      },
    ],
  },
  {
    id: 'harmonic-oscillator',
    title: 'Quantum Harmonic Oscillator',
    questions: [
      {
        id: 'oscillator-1',
        prompt:
          'What are the allowed energy levels of the quantum harmonic oscillator?',
        expectedConcepts: [
          'energy levels are discrete',
          'levels are evenly spaced by hbar omega',
          'ground state energy is one half hbar omega',
        ],
        commonMisconception:
          'Setting the ground-state energy to zero as in the classical oscillator.',
      },
      {
        id: 'oscillator-2',
        prompt:
          'What do creation and annihilation operators do in this system?',
        expectedConcepts: [
          'raise or lower the energy quantum number',
          'change energy by hbar omega',
          'annihilation operator kills the ground state',
        ],
        commonMisconception:
          'Treating ladder operators as ordinary position shifts.',
      },
      {
        id: 'oscillator-3',
        prompt:
          'Why does the oscillator have zero-point energy?',
        expectedConcepts: [
          'uncertainty principle prevents both position and momentum being zero',
          'ground state still has finite spread',
          'minimum energy is above the classical minimum',
        ],
        commonMisconception:
          'Explaining zero-point energy as thermal motion.',
      },
    ],
  },
  {
    id: 'entanglement',
    title: 'Entanglement and Bell States',
    questions: [
      {
        id: 'entanglement-1',
        prompt:
          'What makes a two-particle state entangled rather than merely correlated?',
        expectedConcepts: [
          'state cannot be factored into individual particle states',
          'joint state contains correlations not reducible to local pure states',
          'measurement outcomes are described by shared amplitudes',
        ],
        commonMisconception:
          'Calling any classical correlation entanglement.',
      },
      {
        id: 'entanglement-2',
        prompt:
          'What does a Bell inequality test rule out?',
        expectedConcepts: [
          'local hidden variable theories',
          'certain classical explanations of correlations',
          'quantum predictions violate Bell inequalities',
        ],
        commonMisconception:
          'Saying it proves measurement signals travel faster than light.',
      },
      {
        id: 'entanglement-3',
        prompt:
          'Why does entanglement not allow faster-than-light communication?',
        expectedConcepts: [
          'individual local outcomes are random',
          'correlations require classical comparison',
          'no controllable message is transmitted by choosing a measurement',
        ],
        commonMisconception:
          'Assuming instantaneous correlation is the same as sending information.',
      },
    ],
  },
] as const

// Plain-English question set, mirrored from src/domain/curiousQuestions.ts.
const CURIOUS_QUESTIONS: Question[] = [
  {
    id: 'tunneling-c1',
    prompt: "How can a tiny particle get through a wall it doesn't have enough energy to climb over?",
    expectedConcepts: [
      'particle behaves like a spread out wave',
      'wave leaks into and through the barrier',
      'small chance of appearing on the other side',
    ],
    commonMisconception: 'It smashes through the wall or borrows energy to jump over it.',
  },
  {
    id: 'tunneling-c2',
    prompt: 'Does a thicker wall make tunneling more likely or less likely? By a little, or a lot?',
    expectedConcepts: [
      'thicker barrier makes tunneling less likely',
      'chance drops very quickly, exponentially',
      'taller barrier also lowers the chance',
    ],
    commonMisconception: 'Doubling the thickness only halves the chance.',
  },
  {
    id: 'tunneling-c3',
    prompt: 'Name something in the real world that only works because of tunneling.',
    expectedConcepts: [
      'nuclear fusion in stars, radioactive decay, flash memory, or tunneling microscopes',
      'particles crossing an energy barrier',
      'would be impossible in classical physics',
    ],
    commonMisconception: 'Naming something with no barrier to cross.',
  },
  {
    id: 'measurement-c1',
    prompt: "What is the point of Schrödinger's cat, the one that's alive and dead at the same time?",
    expectedConcepts: [
      'quantum systems can be in a superposition of states',
      'measuring or looking gives one definite result',
      'shows how strange quantum rules look on everyday objects',
    ],
    commonMisconception: 'That cats are literally half alive.',
  },
  {
    id: 'measurement-c2',
    prompt: 'You measure a quantum particle, then instantly measure it again the same way. What happens?',
    expectedConcepts: [
      'you get the same result again',
      'the first measurement already settled the state',
      'randomness only shows up the first time',
    ],
    commonMisconception: 'Every measurement is a fresh coin flip.',
  },
  {
    id: 'measurement-c3',
    prompt: "Why can't you know exactly where a particle is and exactly how fast it's going?",
    expectedConcepts: [
      'uncertainty principle',
      'pinning down position spreads out momentum',
      'a property of nature, not bad equipment',
    ],
    commonMisconception: 'Our instruments just are not good enough yet.',
  },
  {
    id: 'spin-c1',
    prompt: "Electrons have 'spin'. Is an electron literally a tiny spinning ball?",
    expectedConcepts: [
      'not literally spinning',
      'built in quantum angular momentum',
      'behaves like a tiny magnet',
      'measured as only up or down',
    ],
    commonMisconception: 'Yes, it is a ball rotating on an axis.',
  },
  {
    id: 'spin-c2',
    prompt: "When you measure an electron's spin, how many different answers can you get?",
    expectedConcepts: [
      'only two results, up or down',
      'spin is quantized, not continuous',
      'which one you get can be random',
    ],
    commonMisconception: 'Any angle at all, like a compass needle.',
  },
  {
    id: 'spin-c3',
    prompt: "Quantum computers use 'qubits'. How is a qubit different from a normal bit?",
    expectedConcepts: [
      'normal bit is either zero or one',
      'qubit can be in a superposition of zero and one',
      'measuring a qubit gives zero or one with some probability',
      'qubits can be entangled with each other',
    ],
    commonMisconception: 'A qubit just stores lots of bits at once.',
  },
  {
    id: 'oscillator-c1',
    prompt: 'Why do glowing atoms only give off certain colors of light instead of every color?',
    expectedConcepts: [
      'electrons only have certain allowed energy levels',
      'jumping between levels releases a specific energy',
      'that energy matches one color or frequency of light',
    ],
    commonMisconception: 'Atoms just happen to prefer some colors.',
  },
  {
    id: 'oscillator-c2',
    prompt: 'Can a quantum object ever sit perfectly still with zero energy? Why or why not?',
    expectedConcepts: [
      'never perfectly still',
      'zero point energy remains',
      'uncertainty principle forbids exact position and momentum',
    ],
    commonMisconception: 'Yes, at absolute zero everything stops.',
  },
  {
    id: 'oscillator-c3',
    prompt: "What does 'quantum' in 'quantum leap' actually mean?",
    expectedConcepts: [
      'energy comes in discrete chunks',
      'packets called quanta',
      'a quantum leap is actually tiny, not huge',
      'jumping between levels with nothing in between',
    ],
    commonMisconception: 'A huge, dramatic change.',
  },
  {
    id: 'entanglement-c1',
    prompt: "Einstein called entanglement 'spooky action at a distance'. What is entanglement?",
    expectedConcepts: [
      'two particles share one joint quantum state',
      'measuring one is correlated with the other',
      'correlation holds even when far apart',
    ],
    commonMisconception: 'One particle sends a signal to the other.',
  },
  {
    id: 'entanglement-c2',
    prompt: 'Could you use entangled particles to text a friend on Mars instantly?',
    expectedConcepts: [
      'no faster than light messaging',
      'each side only sees random results',
      'need a normal signal to compare results',
    ],
    commonMisconception: 'Yes, flip one and the other flips instantly.',
  },
  {
    id: 'entanglement-c3',
    prompt: 'Name one real technology that uses entanglement, and what it does.',
    expectedConcepts: [
      'quantum cryptography or quantum key distribution',
      'quantum computers linking qubits',
      'quantum teleportation of states',
      'detects eavesdroppers on a channel',
    ],
    commonMisconception: 'Faster-than-light internet.',
  },
]

const DEFAULT_ALLOWED_ORIGINS = [
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
  'http://localhost:5173',
  'http://localhost:5174',
  'https://collepatt.github.io',
  'https://quantum-villain-viva.vercel.app',
]

type Topic = (typeof TOPICS)[number]
type Question = {
  id: string
  prompt: string
  expectedConcepts: readonly string[]
  commonMisconception: string
}
type TopicId = Topic['id']

type ExamTurn = {
  questionId: string
  question: string
  answer: string
  followUpQuestion?: string
  followUpAnswer?: string
}

type ExamMetrics = {
  sessionStartedAt: string | null
  sessionEndedAt: string | null
  durationMs: number
  firstResponseLatencyMs: number | null
  promptLatenciesMs: number[]
  interruptions: number
  transcriptItems: number
}

type QuestionGrade = {
  questionId: string
  score: number
  maxScore: 2
  correctIdeas: string[]
  missingIdeas: string[]
  misconception: string | null
  feedback: string
}

type ExamReport = {
  topicId: TopicId
  totalScore: number
  maxScore: number
  perQuestion: QuestionGrade[]
  summary: string
  reviewSuggestions: string[]
  measuredBehavior: ExamMetrics
  source: 'openai' | 'local-heuristic'
  createdAt: string
}

type RuntimeConfig = {
  apiKey: string
  accessCode: string
  adminCode: string
  hasApiKey: boolean
  requiresAccessCode: boolean
  graderModel: string
  allowedOrigins: string[]
  rateLimitEnabled: boolean
  rateLimitMax: number
  rateLimitAdminMax: number
  rateLimitWindowMinutes: number
}

type RateLimitBucket = {
  count: number
  resetAt: number
}

const rateLimitBuckets = new Map<string, RateLimitBucket>()

export default async function handler(request: IncomingMessage, response: ServerResponse) {
  if (applyCors(request, response)) {
    return
  }

  if (request.method !== 'POST') {
    sendMethodNotAllowed(response)
    return
  }

  let body: unknown
  try {
    body = await readJsonBody(request)
  } catch {
    sendValidationError(response)
    return
  }

  const requestBody = parseGradeRequest(body)
  if (!requestBody) {
    sendValidationError(response, 'Expected topicId, one to three turns, and metrics.')
    return
  }

  const config = getRuntimeConfig()
  const topic = getTopic(requestBody.topicId)

  if (!enforceHostedAccess(request, response, config, body)) {
    return
  }

  const { turns, metrics } = requestBody
  let report: ExamReport
  if (!config.hasApiKey) {
    report = gradeExamLocally(topic, turns, metrics)
  } else {
    try {
      report = await gradeWithOpenAI(config.apiKey, config.graderModel, topic, turns, metrics)
    } catch {
      report = gradeExamLocally(topic, turns, metrics)
    }
  }

  sendJson(response, 200, withScoreToken(report, turns))
}

async function gradeWithOpenAI(
  apiKey: string,
  graderModel: string,
  topic: Topic,
  turns: ExamTurn[],
  metrics: ExamMetrics,
): Promise<ExamReport> {
  const { default: OpenAI } = await import('openai')
  const client = new OpenAI({ apiKey })
  const result = await client.responses.create({
    model: graderModel,
    input: [
      {
        role: 'system',
        content:
          `You are grading a short spoken oral exam about ${topic.title}.\n` +
          'Use the supplied rubric only. Award 0, 1, or 2 points per question.\n' +
          'Rubric items marked audience "general" are for non-physicists: accept everyday language and good analogies.\n' +
          'Treat transcripts as imperfect spoken notes; reward correct reasoning even if wording is informal.\n' +
          'Feedback is one short, plain sentence per question. Do not flatter. Do not be theatrical.',
      },
      {
        role: 'user',
        content: JSON.stringify(
          {
            rubric: rubricForTurns(topic, turns),
            turns,
            requiredShape:
              'Return JSON matching the supplied schema. Use source "openai", maxScore 6, and preserve measuredBehavior exactly.',
            measuredBehavior: metrics,
          },
          null,
          2,
        ),
      },
    ],
    text: {
      format: {
        type: 'json_schema',
        name: 'quantum_viva_exam_report',
        strict: true,
        schema: examReportJsonSchema(),
      },
    },
  })

  return normalizeReport(JSON.parse(result.output_text), topic, metrics, 'openai')
}

function parseGradeRequest(
  body: unknown,
): { topicId: TopicId; turns: ExamTurn[]; metrics: ExamMetrics } | null {
  if (!body || typeof body !== 'object') {
    return null
  }

  const candidate = body as {
    topicId?: unknown
    turns?: unknown
    metrics?: unknown
  }
  const topicId = candidate.topicId
  const metrics = candidate.metrics

  if (typeof topicId !== 'string' || !TOPICS.some((topic) => topic.id === topicId)) {
    return null
  }

  if (!Array.isArray(candidate.turns) || candidate.turns.length < 1 || candidate.turns.length > 3) {
    return null
  }

  if (!isMetrics(metrics)) {
    return null
  }

  const turns = candidate.turns.map(parseTurn)
  if (turns.some((turn) => turn === null)) {
    return null
  }

  return {
    topicId: topicId as TopicId,
    turns: turns as ExamTurn[],
    metrics,
  }
}

function parseTurn(turn: unknown): ExamTurn | null {
  if (!turn || typeof turn !== 'object') {
    return null
  }

  const candidate = turn as {
    questionId?: unknown
    question?: unknown
    answer?: unknown
    followUpQuestion?: unknown
    followUpAnswer?: unknown
  }

  if (
    typeof candidate.questionId !== 'string' ||
    typeof candidate.question !== 'string' ||
    typeof candidate.answer !== 'string' ||
    !candidate.answer.trim()
  ) {
    return null
  }

  return {
    questionId: candidate.questionId,
    question: candidate.question,
    answer: candidate.answer,
    followUpQuestion:
      typeof candidate.followUpQuestion === 'string' ? candidate.followUpQuestion : undefined,
    followUpAnswer:
      typeof candidate.followUpAnswer === 'string' ? candidate.followUpAnswer : undefined,
  }
}

function isMetrics(metrics: unknown): metrics is ExamMetrics {
  if (!metrics || typeof metrics !== 'object') {
    return false
  }

  const candidate = metrics as ExamMetrics
  return (
    typeof candidate.durationMs === 'number' &&
    candidate.durationMs >= 0 &&
    (candidate.firstResponseLatencyMs === null ||
      typeof candidate.firstResponseLatencyMs === 'number') &&
    Array.isArray(candidate.promptLatenciesMs) &&
    typeof candidate.interruptions === 'number' &&
    typeof candidate.transcriptItems === 'number' &&
    (candidate.sessionStartedAt === null || typeof candidate.sessionStartedAt === 'string') &&
    (candidate.sessionEndedAt === null || typeof candidate.sessionEndedAt === 'string')
  )
}

function gradeExamLocally(topic: Topic, turns: ExamTurn[], metrics: ExamMetrics): ExamReport {
  const perQuestion = turns.map((turn) => gradeQuestion(topic, turn))
  const totalScore = perQuestion.reduce((sum, grade) => sum + grade.score, 0)
  const weakest = perQuestion.flatMap((grade) => grade.missingIdeas).slice(0, 3)

  return {
    topicId: topic.id,
    totalScore,
    maxScore: topic.questions.length * 2,
    perQuestion,
    summary:
      totalScore >= 5
        ? 'The candidate survived the viva with only minor corrections.'
        : totalScore >= 3
          ? 'The candidate has useful instincts, but the reasoning still leaks probability amplitude.'
          : 'The candidate should review the fundamentals before facing the examiner again.',
    reviewSuggestions:
      weakest.length > 0
        ? weakest
        : ['Review the topic rubric and record one more timed attempt.'],
    measuredBehavior: metrics,
    source: 'local-heuristic',
    createdAt: new Date().toISOString(),
  }
}

function gradeQuestion(topic: Topic, turn: ExamTurn): QuestionGrade {
  const question = findQuestion(topic, turn.questionId)
  const combinedAnswer = `${turn.answer} ${turn.followUpAnswer ?? ''}`.trim()

  if (!question) {
    return {
      questionId: turn.questionId,
      score: 0,
      maxScore: 2,
      correctIdeas: [],
      missingIdeas: ['Question was not found in the topic rubric.'],
      misconception: null,
      feedback: 'This response could not be matched to the topic rubric.',
    }
  }

  const correctIdeas = question.expectedConcepts.filter((concept) =>
    conceptMatched(combinedAnswer, concept),
  )
  const missingIdeas = question.expectedConcepts.filter(
    (concept) => !correctIdeas.includes(concept),
  )
  const score = correctIdeas.length >= 2 ? 2 : correctIdeas.length === 1 ? 1 : 0

  return {
    questionId: question.id,
    score,
    maxScore: 2,
    correctIdeas,
    missingIdeas,
    misconception:
      score < 2 && normalize(combinedAnswer).length > 0
        ? question.commonMisconception
        : null,
    feedback:
      score === 2
        ? 'Nailed the key idea.'
        : score === 1
          ? 'Half right. One key piece is missing.'
          : 'Missed the core idea.',
  }
}

function normalizeReport(
  value: unknown,
  topic: Topic,
  metrics: ExamMetrics,
  source: 'openai' | 'local-heuristic',
): ExamReport {
  const fallback = gradeExamLocally(topic, [], metrics)

  if (!value || typeof value !== 'object') {
    return fallback
  }

  const report = value as Partial<ExamReport>
  const perQuestion = Array.isArray(report.perQuestion)
    ? report.perQuestion.map((grade) => normalizeQuestionGrade(grade)).filter(isQuestionGrade)
    : []
  const maxScore = topic.questions.length * 2
  const totalScore =
    typeof report.totalScore === 'number'
      ? Math.min(maxScore, Math.max(0, report.totalScore))
      : perQuestion.reduce((sum, grade) => sum + grade.score, 0)

  return {
    topicId: topic.id,
    totalScore,
    maxScore,
    perQuestion,
    summary:
      typeof report.summary === 'string' && report.summary.trim()
        ? report.summary
        : fallback.summary,
    reviewSuggestions:
      Array.isArray(report.reviewSuggestions) &&
      report.reviewSuggestions.every((suggestion) => typeof suggestion === 'string')
        ? report.reviewSuggestions
        : fallback.reviewSuggestions,
    measuredBehavior: metrics,
    source,
    createdAt: new Date().toISOString(),
  }
}

function isQuestionGrade(grade: QuestionGrade | null): grade is QuestionGrade {
  return grade !== null
}

function normalizeQuestionGrade(grade: unknown): QuestionGrade | null {
  if (!grade || typeof grade !== 'object') {
    return null
  }

  const candidate = grade as Partial<QuestionGrade>
  if (typeof candidate.questionId !== 'string') {
    return null
  }

  return {
    questionId: candidate.questionId,
    score:
      typeof candidate.score === 'number'
        ? Math.min(2, Math.max(0, candidate.score))
        : 0,
    maxScore: 2,
    correctIdeas: stringArray(candidate.correctIdeas),
    missingIdeas: stringArray(candidate.missingIdeas),
    misconception: typeof candidate.misconception === 'string' ? candidate.misconception : null,
    feedback:
      typeof candidate.feedback === 'string' && candidate.feedback.trim()
        ? candidate.feedback
        : 'The answer was graded against the topic rubric.',
  }
}

function conceptMatched(answer: string, concept: string): boolean {
  const normalizedAnswer = normalize(answer)
  const conceptWords = normalize(concept)
    .split(' ')
    .filter((word) => word.length > 4)

  if (conceptWords.length === 0) {
    return false
  }

  const hits = conceptWords.filter((word) => normalizedAnswer.includes(word))
  return hits.length >= Math.min(2, conceptWords.length)
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, ' ')
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string') ? value : []
}

function getTopic(topicId: TopicId): Topic {
  return TOPICS.find((topic) => topic.id === topicId) ?? TOPICS[0]
}

function getRuntimeConfig(): RuntimeConfig {
  const apiKey = process.env.OPENAI_API_KEY ?? ''
  const accessCode = process.env.VIVA_ACCESS_CODE ?? ''
  const adminCode = process.env.VIVA_ADMIN_CODE ?? ''

  return {
    apiKey,
    accessCode,
    adminCode,
    hasApiKey: apiKey.trim().length > 0 && !apiKey.includes('paste-your-key'),
    requiresAccessCode: Boolean(accessCode.trim() || adminCode.trim()),
    graderModel: process.env.OPENAI_GRADER_MODEL ?? 'gpt-4.1-mini',
    allowedOrigins: parseCsv(process.env.ALLOWED_ORIGINS, DEFAULT_ALLOWED_ORIGINS),
    rateLimitEnabled: parseBoolean(process.env.RATE_LIMIT_ENABLED, false),
    rateLimitMax: parseInteger(process.env.RATE_LIMIT_MAX, 20),
    rateLimitAdminMax: parseInteger(process.env.RATE_LIMIT_ADMIN_MAX, 200),
    rateLimitWindowMinutes: parseInteger(process.env.RATE_LIMIT_WINDOW_MINUTES, 60),
  }
}

function examReportJsonSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    required: [
      'topicId',
      'totalScore',
      'maxScore',
      'perQuestion',
      'summary',
      'reviewSuggestions',
      'measuredBehavior',
      'source',
      'createdAt',
    ],
    properties: {
      topicId: { type: 'string' },
      totalScore: { type: 'number' },
      maxScore: { type: 'number' },
      perQuestion: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: [
            'questionId',
            'score',
            'maxScore',
            'correctIdeas',
            'missingIdeas',
            'misconception',
            'feedback',
          ],
          properties: {
            questionId: { type: 'string' },
            score: { type: 'number' },
            maxScore: { type: 'number' },
            correctIdeas: { type: 'array', items: { type: 'string' } },
            missingIdeas: { type: 'array', items: { type: 'string' } },
            misconception: { type: ['string', 'null'] },
            feedback: { type: 'string' },
          },
        },
      },
      summary: { type: 'string' },
      reviewSuggestions: { type: 'array', items: { type: 'string' } },
      measuredBehavior: {
        type: 'object',
        additionalProperties: false,
        required: [
          'sessionStartedAt',
          'sessionEndedAt',
          'durationMs',
          'firstResponseLatencyMs',
          'promptLatenciesMs',
          'interruptions',
          'transcriptItems',
        ],
        properties: {
          sessionStartedAt: { type: ['string', 'null'] },
          sessionEndedAt: { type: ['string', 'null'] },
          durationMs: { type: 'number' },
          firstResponseLatencyMs: { type: ['number', 'null'] },
          promptLatenciesMs: { type: 'array', items: { type: 'number' } },
          interruptions: { type: 'number' },
          transcriptItems: { type: 'number' },
        },
      },
      source: { type: 'string', enum: ['openai', 'local-heuristic'] },
      createdAt: { type: 'string' },
    },
  }
}

function applyCors(request: IncomingMessage, response: ServerResponse): boolean {
  const config = getRuntimeConfig()
  const origin = readHeader(request, 'origin')

  if (origin && isAllowedOrigin(request, origin, config.allowedOrigins)) {
    response.setHeader('Access-Control-Allow-Origin', origin)
    response.setHeader('Vary', 'Origin')
    response.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, X-Viva-Access-Code',
    )
    response.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  }

  if (request.method === 'OPTIONS') {
    response.statusCode = 204
    response.end()
    return true
  }

  return false
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const preParsedBody = (request as IncomingMessage & { body?: unknown }).body

  if (preParsedBody !== undefined) {
    if (typeof preParsedBody === 'string') {
      return preParsedBody.trim() ? JSON.parse(preParsedBody) : {}
    }

    return preParsedBody
  }

  const chunks: Buffer[] = []
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }

  const rawBody = Buffer.concat(chunks).toString('utf8')
  return rawBody.trim() ? JSON.parse(rawBody) : {}
}

function enforceHostedAccess(
  request: IncomingMessage,
  response: ServerResponse,
  config: RuntimeConfig,
  body: unknown,
): boolean {
  const access = checkAccess(request, config, body)
  if (!access.ok) {
    sendJson(response, 401, {
      error: {
        code: 'invalid_access_code',
        message: 'Enter the private review access code to unlock hosted voice mode.',
      },
    })
    return false
  }

  return enforceRateLimit(request, response, config, access.isAdmin)
}

function checkAccess(request: IncomingMessage, config: RuntimeConfig, body: unknown) {
  if (!config.requiresAccessCode) {
    return { ok: true, isAdmin: false }
  }

  const submittedCode = readAccessCode(request, body)
  const isAdmin = Boolean(config.adminCode && submittedCode === config.adminCode)
  const isReviewer = Boolean(config.accessCode && submittedCode === config.accessCode)

  return {
    ok: isAdmin || isReviewer,
    isAdmin,
  }
}

function enforceRateLimit(
  request: IncomingMessage,
  response: ServerResponse,
  config: RuntimeConfig,
  isAdmin: boolean,
): boolean {
  if (!config.rateLimitEnabled) {
    return true
  }

  const now = Date.now()
  const max = isAdmin ? config.rateLimitAdminMax : config.rateLimitMax
  const windowMs = config.rateLimitWindowMinutes * 60 * 1000
  const key = `${isAdmin ? 'admin' : 'review'}:${getClientKey(request)}:${request.url ?? 'api'}`
  const current = rateLimitBuckets.get(key)

  if (!current || current.resetAt <= now) {
    rateLimitBuckets.set(key, { count: 1, resetAt: now + windowMs })
    response.setHeader('X-RateLimit-Limit', String(max))
    response.setHeader('X-RateLimit-Remaining', String(Math.max(0, max - 1)))
    return true
  }

  if (current.count >= max) {
    const retryAfterSeconds = Math.ceil((current.resetAt - now) / 1000)
    response.setHeader('Retry-After', String(retryAfterSeconds))
    response.setHeader('X-RateLimit-Limit', String(max))
    response.setHeader('X-RateLimit-Remaining', '0')
    sendJson(response, 429, {
      error: {
        code: 'rate_limited',
        message: 'Too many hosted voice requests. Wait a bit, then try again.',
      },
      retryAfterSeconds,
    })
    return false
  }

  current.count += 1
  response.setHeader('X-RateLimit-Limit', String(max))
  response.setHeader('X-RateLimit-Remaining', String(Math.max(0, max - current.count)))
  return true
}

function readAccessCode(request: IncomingMessage, body: unknown): string {
  const headerCode = readHeader(request, 'x-viva-access-code')
  if (headerCode) {
    return headerCode.trim()
  }

  const authHeader = readHeader(request, 'authorization')
  if (authHeader?.toLowerCase().startsWith('bearer ')) {
    return authHeader.slice('bearer '.length).trim()
  }

  if (body && typeof body === 'object' && 'accessCode' in body) {
    const accessCode = (body as { accessCode?: unknown }).accessCode
    return typeof accessCode === 'string' ? accessCode.trim() : ''
  }

  return ''
}

function sendJson(response: ServerResponse, statusCode: number, body: unknown) {
  response.statusCode = statusCode
  response.setHeader('Content-Type', 'application/json')
  response.end(JSON.stringify(body))
}

function sendValidationError(response: ServerResponse, message = 'Request payload is invalid.') {
  sendJson(response, 400, {
    error: {
      code: 'invalid_request',
      message,
    },
  })
}

function sendMethodNotAllowed(response: ServerResponse) {
  sendJson(response, 405, {
    error: {
      code: 'method_not_allowed',
      message: 'Method not allowed.',
    },
  })
}

function readHeader(request: IncomingMessage, name: string): string | undefined {
  const value = request.headers[name.toLowerCase()]
  if (Array.isArray(value)) {
    return value[0]
  }

  return value
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback
  }

  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase())
}

function parseInteger(value: string | undefined, fallback: number): number {
  if (value === undefined) {
    return fallback
  }

  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function parseCsv(value: string | undefined, fallback: string[]): string[] {
  const parsed =
    value
      ?.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean) ?? []

  return parsed.length > 0 ? parsed : fallback
}

function getRuntimeOrigin(request: IncomingMessage): string | null {
  const host = readHeader(request, 'host')
  if (!host) {
    return null
  }

  const protocol = host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https'
  return `${protocol}://${host}`
}

function isAllowedOrigin(request: IncomingMessage, origin: string, allowedOrigins: string[]) {
  if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
    return true
  }

  return origin === getRuntimeOrigin(request)
}

function getClientKey(request: IncomingMessage): string {
  const forwardedFor = readHeader(request, 'x-forwarded-for')
  const firstForwarded = forwardedFor?.split(',')[0]?.trim()
  return firstForwarded || request.socket.remoteAddress || 'unknown'
}

function findQuestion(topic: Topic, questionId: string): Question | undefined {
  return [...topic.questions, ...CURIOUS_QUESTIONS].find(
    (candidate) => candidate.id === questionId && candidate.id.startsWith(questionPrefix(topic)),
  )
}

function questionPrefix(topic: Topic): string {
  return topic.id === 'harmonic-oscillator' ? 'oscillator-' : `${topic.id}-`
}

function rubricForTurns(topic: Topic, turns: ExamTurn[]) {
  return turns.flatMap((turn) => {
    const question = findQuestion(topic, turn.questionId)
    if (!question) {
      return []
    }
    return [{ ...question, audience: /-c\d+$/.test(question.id) ? 'general' : 'physics student' }]
  })
}

// ---------- leaderboard score token (mirrors api/leaderboard.ts) ----------

function withScoreToken(report: ExamReport, turns: ExamTurn[]) {
  const scoreToken = signScoreToken(
    report.topicId,
    turns.map((turn) => turn.questionId),
    report.perQuestion.map((grade) => grade.score),
  )
  return scoreToken ? { ...report, scoreToken } : report
}

export function signScoreToken(
  topicId: string,
  questionIds: string[],
  scores: number[],
): string | undefined {
  const secret = getScoreSecret()
  if (!secret || scores.length === 0) {
    return undefined
  }

  const payload = {
    topicId,
    level:
      questionIds.length > 0 && questionIds.every((id) => /-c\d+$/.test(id))
        ? 'curious'
        : 'physicist',
    scores: scores.slice(0, 3).map((score) => Math.max(0, Math.min(2, Math.round(score)))),
    issuedAt: Date.now(),
    nonce: randomBytes(8).toString('hex'),
  }
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${body}.${createHmac('sha256', secret).update(body).digest('base64url')}`
}

function getScoreSecret(): string {
  const configured =
    process.env.LEADERBOARD_SECRET ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    ''
  if (configured.trim()) {
    return configured.trim()
  }

  return process.env.VERCEL ? '' : 'local-dev-leaderboard-secret'
}
