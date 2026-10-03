import { describe, expect, it } from 'vitest'
import { replayRound as replayOnServer } from '../../api/leaderboard'
import { matchChoice } from './grading'
import { advanceTier, describePath, nextQuestion, replayRound, START_TIER } from './round'
import { getTopicById } from './topics'

describe('tiers', () => {
  it('collapses on a missed hard question and survives a partial one', () => {
    expect(advanceTier(START_TIER, 0, false)).toEqual({
      state: { tier: 'curious', streak: 0 },
      event: 'collapsed',
    })
    expect(advanceTier(START_TIER, 1, false).event).toBe('survived')
  })

  it('promotes after two right in a row, but not on the last question', () => {
    const one = advanceTier({ tier: 'curious', streak: 0 }, 2, false)
    expect(one.event).toBeNull()
    expect(advanceTier(one.state, 2, false)).toEqual({
      state: { tier: 'physicist', streak: 0 },
      event: 'promoted',
    })
    expect(advanceTier(one.state, 2, true).event).toBe('too-late')
    expect(advanceTier(one.state, 0, false).state.streak).toBe(0)
  })

  it('serves unused questions from the current tier', () => {
    const topic = getTopicById('spin')
    expect(nextQuestion(topic, 'curious', ['spin-1']).id).toBe('spin-c1')
    expect(nextQuestion(topic, 'physicist', ['spin-1', 'spin-c1', 'spin-c2']).id).toBe('spin-2')
  })

  it('replays rounds the same way on the client and the server', () => {
    const rounds: Array<[string[], number[], string | null]> = [
      [['spin-1', 'spin-2', 'spin-3', 'spin-4'], [2, 1, 2, 2], 'physicist'],
      [['spin-1', 'spin-c1', 'spin-c2', 'spin-2'], [0, 2, 2, 1], 'physicist'],
      [['spin-1', 'spin-c1', 'spin-c2', 'spin-2'], [0, 2, 2, 0], 'curious'],
      [['spin-1', 'spin-c1', 'spin-c2', 'spin-c3'], [0, 0, 2, 2], 'curious'],
      // Claiming a hard question you were never promoted to is rejected.
      [['spin-1', 'spin-c1', 'spin-2', 'spin-3'], [0, 2, 2, 2], null],
      // So is skipping the measurement.
      [['spin-c1', 'spin-c2', 'spin-c3', 'spin-1'], [2, 2, 2, 2], null],
    ]
    for (const [ids, scores, expected] of rounds) {
      expect(replayRound(ids, scores)).toBe(expected)
      expect(replayOnServer(ids, scores)).toBe(expected)
    }
  })

  it('describes how the round went', () => {
    expect(describePath(['physicist', 'physicist', 'physicist', 'physicist'], 'physicist')).toBe('held')
    expect(describePath(['physicist', 'curious', 'curious', 'physicist'], 'physicist')).toBe('climbed')
    expect(describePath(['physicist', 'physicist', 'physicist', 'physicist'], 'curious')).toBe('fell-late')
    expect(describePath(['physicist', 'curious', 'curious', 'curious'], 'curious')).toBe('collapsed')
  })
})

describe('spoken multiple choice', () => {
  const choices = ['Two', 'Any angle at all', 'Three']
  it('reads letters, ordinals and the choice itself', () => {
    expect(matchChoice('B', choices)).toBe(1)
    expect(matchChoice('option c', choices)).toBe(2)
    expect(matchChoice('the second one', choices)).toBe(1)
    expect(matchChoice('I think any angle', choices)).toBe(1)
    expect(matchChoice('no idea honestly', choices)).toBeNull()
  })
})
