import { describe, expect, it } from 'vitest'
import { MAX_POINTS, questionPoints, TIER_POINTS } from './scoring'
import { maxPointsForScores } from '../../api/leaderboard'
import { topics } from './topics'

describe('scoring', () => {
  it('rewards accuracy plus speed and charges for hints', () => {
    expect(questionPoints(2, { secondsUsed: 0, usedHint: false }, 'physicist').total).toBe(250)
    expect(questionPoints(2, { secondsUsed: 30, usedHint: true }, 'physicist').total).toBe(200 + 25 - 50)
    expect(questionPoints(1, { secondsUsed: 60, usedHint: false }, 'physicist').total).toBe(125)
    expect(questionPoints(2, { secondsUsed: 10, usedHint: false }, 'curious').total).toBe(80 + 10)
  })

  it('gives nothing for a wrong answer, however fast', () => {
    expect(questionPoints(0, { secondsUsed: 1, usedHint: false }, 'physicist').total).toBe(0)
  })

  it('matches the leaderboard cap used by the server', () => {
    const physicistMax = TIER_POINTS.physicist.accuracy[2] + TIER_POINTS.physicist.speedMax
    const curiousMax = TIER_POINTS.curious.accuracy[2] + TIER_POINTS.curious.speedMax
    expect(maxPointsForScores([2, 2, 2, 2], 'pppp')).toBe(MAX_POINTS)
    expect(maxPointsForScores([0, 2, 2, 1], 'pccp')).toBe(2 * curiousMax + 125 + TIER_POINTS.physicist.speedMax)
    expect(maxPointsForScores([2, 0, 2, 2], 'ppcc')).toBe(physicistMax + 2 * curiousMax)
  })

  it('has four hard and three multiple-choice questions per topic', () => {
    for (const topic of topics) {
      expect(topic.questions).toHaveLength(4)
      expect(topic.curiousQuestions).toHaveLength(3)
      topic.curiousQuestions.forEach((question) => {
        expect(question.id).toMatch(/-c\d$/)
        expect(question.choices).toHaveLength(3)
        expect(question.answer).toBeGreaterThanOrEqual(0)
      })
    }
  })
})
