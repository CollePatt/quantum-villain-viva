import type { Level } from './schemas'

// Mirrored in api/leaderboard.ts, which caps submitted scores with the same numbers.
export const ACCURACY_POINTS = [0, 125, 250] as const
export const SPEED_BONUS_MAX = 83
export const HINT_COST = 50
export const MAX_POINTS = 3 * (ACCURACY_POINTS[2] + SPEED_BONUS_MAX)

export const TIME_LIMIT_SECONDS: Record<Level, number> = {
  curious: 40,
  physicist: 60,
}

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

export function questionPoints(
  rubricScore: number,
  play: TurnPlay,
  timeLimitSeconds: number,
): QuestionPoints {
  const accuracy = ACCURACY_POINTS[Math.max(0, Math.min(2, Math.round(rubricScore)))]
  if (accuracy === 0) {
    return { accuracy: 0, speed: 0, hintPenalty: 0, total: 0 }
  }

  const timeLeft = Math.max(0, Math.min(1, 1 - play.secondsUsed / timeLimitSeconds))
  const speed = Math.round(SPEED_BONUS_MAX * timeLeft)
  const hintPenalty = play.usedHint ? HINT_COST : 0
  return {
    accuracy,
    speed,
    hintPenalty,
    total: Math.max(0, accuracy + speed - hintPenalty),
  }
}

export type Rank = {
  title: string
  line: string
}

export function rankFor(points: number): Rank {
  if (points >= 900) {
    return { title: 'Quantum Overlord', line: 'Nocturne is filing a formal complaint.' }
  }
  if (points >= 700) {
    return { title: 'Wavefunction Whisperer', line: 'He will pretend this never happened.' }
  }
  if (points >= 450) {
    return { title: 'Superposition Survivor', line: 'Half right, half wrong, fully escaped.' }
  }
  if (points >= 200) {
    return { title: 'Classically Trained', line: 'Newton would be proud. Nocturne is not.' }
  }
  return { title: 'Collapsed on Contact', line: 'The chamber door stays locked. For now.' }
}
