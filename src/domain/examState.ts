import type { ExamTurn, Question, Topic } from './schemas'

export type ExamPhase =
  | 'idle'
  | 'connecting'
  | 'asking'
  | 'answering'
  | 'grading'
  | 'report'
  | 'error'

export type ExamState = {
  phase: ExamPhase
  topicId: Topic['id']
  questionIndex: number
  followUpsUsed: Record<string, boolean>
  completedTurns: ExamTurn[]
  error: string | null
}

export function createInitialExamState(topic: Topic): ExamState {
  return {
    phase: 'idle',
    topicId: topic.id,
    questionIndex: 0,
    followUpsUsed: {},
    completedTurns: [],
    error: null,
  }
}

export function beginExam(state: ExamState): ExamState {
  return { ...state, phase: 'connecting', error: null }
}

export function markQuestionAsked(state: ExamState): ExamState {
  return { ...state, phase: 'answering', error: null }
}

export function markAsking(state: ExamState): ExamState {
  return { ...state, phase: 'asking', error: null }
}

export function failExam(state: ExamState, error: string): ExamState {
  return { ...state, phase: 'error', error }
}

export function getCurrentQuestion(topic: Topic, state: ExamState): Question {
  return topic.questions[state.questionIndex]
}

export function canAskFollowUp(topic: Topic, state: ExamState): boolean {
  const question = getCurrentQuestion(topic, state)
  return !state.followUpsUsed[question.id]
}

export function recordFollowUp(topic: Topic, state: ExamState): ExamState {
  const question = getCurrentQuestion(topic, state)
  if (state.followUpsUsed[question.id]) {
    return state
  }

  return {
    ...state,
    phase: 'answering',
    followUpsUsed: { ...state.followUpsUsed, [question.id]: true },
  }
}

export function recordAnswer(
  topic: Topic,
  state: ExamState,
  answer: string,
  followUpAnswer?: string,
): ExamState {
  const question = getCurrentQuestion(topic, state)
  const nextTurns = [
    ...state.completedTurns,
    {
      questionId: question.id,
      question: question.prompt,
      answer: answer.trim(),
      followUpQuestion: state.followUpsUsed[question.id]
        ? question.followUp
        : undefined,
      followUpAnswer: followUpAnswer?.trim() || undefined,
    },
  ]

  const isFinished = nextTurns.length >= topic.questions.length
  return {
    ...state,
    phase: isFinished ? 'grading' : 'asking',
    questionIndex: isFinished ? state.questionIndex : state.questionIndex + 1,
    completedTurns: nextTurns,
    error: null,
  }
}

export function summarizeProgress(topic: Topic, state: ExamState): string {
  return `${Math.min(state.questionIndex + 1, topic.questions.length)} / ${
    topic.questions.length
  }`
}
