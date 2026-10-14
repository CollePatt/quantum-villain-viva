import type {
  ExamMetrics,
  ExamReport,
  ExamTurn,
  Question,
  QuestionGrade,
  Topic,
} from './schemas'
import { findQuestion } from './topics'

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, ' ')
}

export function conceptMatched(answer: string, concept: string): boolean {
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

const LETTERS = ['a', 'b', 'c']
const ORDINALS = ['first', 'second', 'third']
const NUMBER_WORDS = ['one', 'two', 'three']

// Reads a multiple-choice pick out of speech: "B", "option b", "the second one", or the
// choice's own words. Returns null unless exactly one choice fits.
export function matchChoice(text: string, choices: readonly string[]): number | null {
  const spoken = normalize(text).trim()
  if (!spoken) {
    return null
  }
  const words = spoken.split(' ')
  const lettered = LETTERS.findIndex(
    (letter) => words.length <= 3 && words[words.length - 1] === letter,
  )
  if (lettered >= 0 && lettered < choices.length) {
    return lettered
  }
  const ordinal = ORDINALS.findIndex((word) => words.length <= 4 && words.includes(word))
  if (ordinal >= 0 && ordinal < choices.length) {
    return ordinal
  }
  const numbered = NUMBER_WORDS.findIndex((word) => words.length <= 3 && words.includes(word))
  if (numbered >= 0 && numbered < choices.length) {
    return numbered
  }

  const matches = choices
    .map((choice, index) => {
      const choiceWords = normalize(choice)
        .split(' ')
        .filter((word) => word.length > 3)
      const hits = choiceWords.filter((word) => words.includes(word)).length
      return { index, ratio: choiceWords.length ? hits / choiceWords.length : 0 }
    })
    .filter((match) => match.ratio >= 0.5)
  return matches.length === 1 ? matches[0].index : null
}

export function gradeChoice(question: Question, choiceIndex: number | undefined): QuestionGrade {
  const correct = question.choices?.[question.answer ?? -1] ?? ''
  const isRight = choiceIndex === question.answer
  return {
    questionId: question.id,
    score: isRight ? 2 : 0,
    maxScore: 2,
    correctIdeas: isRight ? [correct] : [],
    missingIdeas: isRight ? [] : [correct],
    misconception: isRight ? null : question.commonMisconception,
    feedback: isRight ? 'Correct.' : `It was "${correct}".`,
  }
}

export function gradeExamLocally(
  topic: Topic,
  turns: ExamTurn[],
  metrics: ExamMetrics,
): ExamReport {
  const perQuestion: QuestionGrade[] = turns.map((turn) => {
    const question = findQuestion(topic, turn.questionId)
    if (question?.choices) {
      return gradeChoice(question, turn.choiceIndex)
    }
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
    const misconception =
      score < 2 && normalize(combinedAnswer).length > 0
        ? question.commonMisconception
        : null

    return {
      questionId: question.id,
      score,
      maxScore: 2,
      correctIdeas,
      missingIdeas,
      misconception,
      feedback:
        score === 2
          ? 'Nailed the key idea.'
        : score === 1
            ? 'Half right. One key piece is missing.'
            : 'Missed the core idea.',
    }
  })

  const totalScore = perQuestion.reduce((sum, grade) => sum + grade.score, 0)
  const maxScore = turns.length * 2
  const weakest = perQuestion
    .flatMap((grade) => grade.missingIdeas)
    .slice(0, 3)

  return {
    topicId: topic.id,
    totalScore,
    maxScore,
    perQuestion,
    summary:
      totalScore >= maxScore - 1
        ? 'The candidate survived the viva with only minor corrections.'
        : totalScore >= maxScore / 2
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
