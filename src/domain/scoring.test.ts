import { describe, expect, it } from 'vitest'
import { MAX_POINTS, questionPoints, rankFor } from './scoring'
import { maxPointsForScores } from '../../api/leaderboard'
import { topics } from './topics'

describe('scoring', () => {
  it('rewards accuracy plus speed and charges for hints', () => {
    expect(questionPoints(2, { secondsUsed: 0, usedHint: false }, 40).total).toBe(333)
    expect(questionPoints(2, { secondsUsed: 20, usedHint: true }, 40).total).toBe(250 + 42 - 50)
    expect(questionPoints(1, { secondsUsed: 40, usedHint: false }, 40).total).toBe(125)
  })

  it('gives nothing for a wrong answer, however fast', () => {
    expect(questionPoints(0, { secondsUsed: 1, usedHint: false }, 40).total).toBe(0)
  })

  it('matches the leaderboard cap used by the server', () => {
    expect(MAX_POINTS).toBe(999)
    expect(maxPointsForScores([2, 2, 2])).toBe(MAX_POINTS)
    expect(maxPointsForScores([2, 0, 1])).toBe(333 + 208)
  })

  it('names a rank for every score', () => {
    expect(rankFor(999).title).toBe('Quantum Overlord')
    expect(rankFor(0).title).toBe('Collapsed on Contact')
  })

  it('has three plain-English questions per topic with curious ids', () => {
    for (const topic of topics) {
      expect(topic.curiousQuestions).toHaveLength(3)
      topic.curiousQuestions.forEach((question) => expect(question.id).toMatch(/-c\d$/))
    }
  })
})
