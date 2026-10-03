import type { Level } from './schemas'

// Mirrored in api/leaderboard.ts, which caps submitted scores with the same numbers.
// Physicist questions are spoken and graded 0-2. Curious questions are multiple choice,
// so they are either right (2) or wrong (0), and worth less.
export const TIER_POINTS: Record<
  Level,
  { accuracy: readonly [number, number, number]; speedMax: number; hintCost: number; seconds: number }
> = {
  physicist: { accuracy: [0, 125, 200], speedMax: 50, hintCost: 50, seconds: 60 },
  curious: { accuracy: [0, 40, 80], speedMax: 20, hintCost: 25, seconds: 20 },
}

export const MAX_POINTS = 999

export type TurnPlay = {
  secondsUsed: number
  usedHint: boolean
}

export type QuestionPoints = {
  accuracy: number
  speed: number
  hintPenalty: number
  total: number
}

export function questionPoints(rubricScore: number, play: TurnPlay, tier: Level): QuestionPoints {
  const rules = TIER_POINTS[tier]
  const accuracy = rules.accuracy[Math.max(0, Math.min(2, Math.round(rubricScore)))]
  if (accuracy === 0) {
    return { accuracy: 0, speed: 0, hintPenalty: 0, total: 0 }
  }

  const timeLeft = Math.max(0, Math.min(1, 1 - play.secondsUsed / rules.seconds))
  const speed = Math.round(rules.speedMax * timeLeft)
  const hintPenalty = play.usedHint ? rules.hintCost : 0
  return {
    accuracy,
    speed,
    hintPenalty,
    total: Math.max(0, accuracy + speed - hintPenalty),
  }
}

export function roundTotal(points: QuestionPoints[]): number {
  return Math.min(MAX_POINTS, points.reduce((sum, item) => sum + item.total, 0))
}
