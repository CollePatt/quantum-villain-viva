import { describe, expect, it } from 'vitest'
import {
  beginExam,
  canAskFollowUp,
  createInitialExamState,
  markQuestionAsked,
  recordAnswer,
  recordFollowUp,
} from './examState'
import { getTopicById } from './topics'

describe('exam state machine', () => {
  it('starts with the first question selected', () => {
    const topic = getTopicById('tunneling')
    const state = createInitialExamState(topic)

    expect(state.phase).toBe('idle')
    expect(state.questionIndex).toBe(0)
    expect(state.completedTurns).toHaveLength(0)
  })

  it('enforces one follow-up per answer', () => {
    const topic = getTopicById('measurement')
    const answering = markQuestionAsked(beginExam(createInitialExamState(topic)))
    const afterFollowUp = recordFollowUp(topic, answering)
    const afterSecondAttempt = recordFollowUp(topic, afterFollowUp)

    expect(canAskFollowUp(topic, answering)).toBe(true)
    expect(canAskFollowUp(topic, afterFollowUp)).toBe(false)
    expect(afterSecondAttempt).toBe(afterFollowUp)
  })

  it('advances through exactly three turns and then moves to grading', () => {
    const topic = getTopicById('spin')
    let state = markQuestionAsked(beginExam(createInitialExamState(topic)))

    state = recordAnswer(topic, state, 'The prepared z eigenstate gives up z with certainty.')
    expect(state.phase).toBe('asking')
    expect(state.questionIndex).toBe(1)

    state = recordAnswer(topic, state, 'Along x, plus and minus are equally likely.')
    expect(state.phase).toBe('asking')
    expect(state.questionIndex).toBe(2)

    state = recordAnswer(topic, state, 'Stern-Gerlach revealed discrete splitting.')
    expect(state.phase).toBe('grading')
    expect(state.completedTurns).toHaveLength(3)
  })
})
