import { z } from 'zod'

export const TopicIdSchema = z.enum([
  'tunneling',
  'measurement',
  'spin',
  'harmonic-oscillator',
  'entanglement',
])

export const QuestionSchema = z.object({
  id: z.string(),
  prompt: z.string(),
  expectedConcepts: z.array(z.string()).min(2),
  commonMisconception: z.string(),
  followUp: z.string().optional(),
  hint: z.string().optional(),
  // Multiple-choice questions (the Curious tier) have fixed choices and a correct index.
  choices: z.array(z.string()).length(3).optional(),
  answer: z.number().int().min(0).max(2).optional(),
})

export const LevelSchema = z.enum(['curious', 'physicist'])

export const TopicSchema = z.object({
  id: TopicIdSchema,
  title: z.string(),
  shortName: z.string(),
  emoji: z.string(),
  tagline: z.string(),
  premise: z.string(),
  questions: z.array(QuestionSchema).length(4),
  curiousQuestions: z.array(QuestionSchema).length(3),
})

// Turns and metrics go to the paid grader, so text is cut to a size no real answer reaches.
// Mirrored in api/grade-exam.ts.
const cappedText = (max: number) => z.string().transform((text) => text.slice(0, max))

export const ExamTurnSchema = z.object({
  questionId: z.string().max(64),
  question: cappedText(1000),
  answer: z.string().min(1).transform((text) => text.slice(0, 4000)),
  followUpQuestion: cappedText(1000).optional(),
  followUpAnswer: cappedText(4000).optional(),
  secondsUsed: z.number().nonnegative().optional(),
  usedHint: z.boolean().optional(),
  choiceIndex: z.number().int().min(0).max(2).optional(),
  // A signed grade from an earlier per-answer call, so the final call can reuse it.
  seal: z.string().max(4000).optional(),
})

export const ExamMetricsSchema = z.object({
  sessionStartedAt: z.string().nullable(),
  sessionEndedAt: z.string().nullable(),
  durationMs: z.number().nonnegative(),
  firstResponseLatencyMs: z.number().nonnegative().nullable(),
  promptLatenciesMs: z.array(z.number().nonnegative()),
  interruptions: z.number().int().nonnegative(),
  transcriptItems: z.number().int().nonnegative(),
})

export const QuestionGradeSchema = z.object({
  questionId: z.string(),
  score: z.number().min(0).max(2),
  maxScore: z.literal(2),
  correctIdeas: z.array(z.string()),
  missingIdeas: z.array(z.string()),
  misconception: z.string().nullable(),
  feedback: z.string(),
})

export const ExamReportSchema = z.object({
  topicId: TopicIdSchema,
  totalScore: z.number().min(0),
  maxScore: z.number().min(1),
  perQuestion: z.array(QuestionGradeSchema),
  summary: z.string(),
  reviewSuggestions: z.array(z.string()),
  measuredBehavior: ExamMetricsSchema,
  source: z.enum(['openai', 'local-heuristic']),
  createdAt: z.string(),
})

export const TokenRequestSchema = z.object({
  topicId: TopicIdSchema,
})

const RequestMetricsSchema = ExamMetricsSchema.extend({
  sessionStartedAt: z.string().max(40).nullable(),
  sessionEndedAt: z.string().max(40).nullable(),
  promptLatenciesMs: z.array(z.number().nonnegative()).transform((latencies) => latencies.slice(0, 64)),
})

export const GradeRequestSchema = z.object({
  topicId: TopicIdSchema,
  turns: z.array(ExamTurnSchema).min(1).max(4),
  metrics: RequestMetricsSchema,
})

export type TopicId = z.infer<typeof TopicIdSchema>
export type Level = z.infer<typeof LevelSchema>
export type Question = z.infer<typeof QuestionSchema>
export type Topic = z.infer<typeof TopicSchema>
export type ExamTurn = z.infer<typeof ExamTurnSchema>
export type ExamMetrics = z.infer<typeof ExamMetricsSchema>
export type QuestionGrade = z.infer<typeof QuestionGradeSchema>
export type ExamReport = z.infer<typeof ExamReportSchema>
export type GradeRequest = z.infer<typeof GradeRequestSchema>
