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
  followUp: z.string(),
})

export const TopicSchema = z.object({
  id: TopicIdSchema,
  title: z.string(),
  shortName: z.string(),
  premise: z.string(),
  questions: z.array(QuestionSchema).length(3),
})

export const ExamTurnSchema = z.object({
  questionId: z.string(),
  question: z.string(),
  answer: z.string().min(1),
  followUpQuestion: z.string().optional(),
  followUpAnswer: z.string().optional(),
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

export const GradeRequestSchema = z.object({
  topicId: TopicIdSchema,
  turns: z.array(ExamTurnSchema).min(1).max(3),
  metrics: ExamMetricsSchema,
})

export type TopicId = z.infer<typeof TopicIdSchema>
export type Question = z.infer<typeof QuestionSchema>
export type Topic = z.infer<typeof TopicSchema>
export type ExamTurn = z.infer<typeof ExamTurnSchema>
export type ExamMetrics = z.infer<typeof ExamMetricsSchema>
export type QuestionGrade = z.infer<typeof QuestionGradeSchema>
export type ExamReport = z.infer<typeof ExamReportSchema>
export type GradeRequest = z.infer<typeof GradeRequestSchema>
