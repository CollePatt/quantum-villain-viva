import type {
  ExamMetrics,
  ExamReport,
  ExamTurn,
  QuestionGrade,
  Topic,
} from './schemas'

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, ' ')
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

export function gradeExamLocally(
  topic: Topic,
  turns: ExamTurn[],
  metrics: ExamMetrics,
): ExamReport {
  const perQuestion: QuestionGrade[] = turns.map((turn) => {
    const question = topic.questions.find((candidate) => candidate.id === turn.questionId)
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
          ? 'Solid answer. The examiner may sneer, but the rubric is satisfied.'
        : score === 1
            ? 'Partly correct, but the reasoning needs another piece before it clears the chamber.'
            : 'The answer missed the core physics for this question.',
    }
  })

  const totalScore = perQuestion.reduce((sum, grade) => sum + grade.score, 0)
  const maxScore = topic.questions.length * 2
  const weakest = perQuestion
    .flatMap((grade) => grade.missingIdeas)
    .slice(0, 3)

  return {
    topicId: topic.id,
    totalScore,
    maxScore,
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
