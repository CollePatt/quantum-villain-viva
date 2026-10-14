import type { Level, Question, Topic } from './schemas'

// A round is four questions. The first is a hard "measurement" that decides your tier.
// Rules (mirrored in api/leaderboard.ts and api/grade-exam.ts, which replay them to sign scores):
// - On Physicist, a score of 0 collapses you to Curious.
// - On Curious, two correct answers in a row promote you back, if a question is left to prove it.
// - Your final tier is whatever you hold after the last answer.
export const ROUND_LENGTH = 4
export const PROMOTION_STREAK = 2

export type TierEvent = 'survived' | 'collapsed' | 'promoted' | 'too-late' | null

export type TierState = {
  tier: Level
  streak: number
}

export const START_TIER: TierState = { tier: 'physicist', streak: 0 }

export function isCuriousId(questionId: string): boolean {
  return /-c\d+$/.test(questionId)
}

export function tierOfQuestion(question: Question): Level {
  return isCuriousId(question.id) ? 'curious' : 'physicist'
}

// `score` is the 0-2 rubric score. `isLast` is true for the final question of the round.
export function advanceTier(
  state: TierState,
  score: number,
  isLast: boolean,
): { state: TierState; event: TierEvent } {
  if (state.tier === 'physicist') {
    return score < 1
      ? { state: { tier: 'curious', streak: 0 }, event: 'collapsed' }
      : { state, event: 'survived' }
  }

  const streak = score >= 2 ? state.streak + 1 : 0
  if (streak >= PROMOTION_STREAK) {
    return isLast
      ? { state: { tier: 'curious', streak }, event: 'too-late' }
      : { state: { tier: 'physicist', streak: 0 }, event: 'promoted' }
  }
  return { state: { tier: 'curious', streak }, event: null }
}

export function nextQuestion(topic: Topic, tier: Level, askedIds: string[]): Question {
  const pool = tier === 'curious' ? topic.curiousQuestions : topic.questions
  return pool.find((question) => !askedIds.includes(question.id)) ?? pool[pool.length - 1]
}

// Replays a finished round from its question ids and scores. Returns null when the
// sequence could not have come from the rules above.
export function replayRound(questionIds: string[], scores: number[]): Level | null {
  if (questionIds.length !== ROUND_LENGTH || scores.length !== ROUND_LENGTH) {
    return null
  }
  let state = START_TIER
  for (const [index, questionId] of questionIds.entries()) {
    const expected = isCuriousId(questionId) ? 'curious' : 'physicist'
    if (expected !== state.tier) {
      return null
    }
    state = advanceTier(state, scores[index], index === ROUND_LENGTH - 1).state
  }
  return state.tier
}

export type RoundPath = 'held' | 'climbed' | 'collapsed' | 'fell-late'

// How the round went, for the results headline.
export function describePath(tiers: Level[], finalTier: Level): RoundPath {
  const everCurious = tiers.includes('curious')
  if (finalTier === 'physicist') {
    return everCurious ? 'climbed' : 'held'
  }
  return tiers.slice(0, -1).every((tier) => tier === 'physicist') ? 'fell-late' : 'collapsed'
}
