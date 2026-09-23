import { describe, expect, it } from 'vitest'
import { gradeExamLocally } from './grading'
import type { ExamMetrics } from './schemas'
import { getTopicById } from './topics'

const metrics: ExamMetrics = {
  sessionStartedAt: '2026-09-23T18:00:00.000Z',
  sessionEndedAt: '2026-09-23T18:01:00.000Z',
  durationMs: 60_000,
  firstResponseLatencyMs: 820,
  promptLatenciesMs: [820],
  interruptions: 1,
  transcriptItems: 5,
}

describe('local grading', () => {
  it('normalizes rubric scores and preserves measured behavior', () => {
    const topic = getTopicById('tunneling')
    const report = gradeExamLocally(
      topic,
      [
        {
          questionId: 'tunneling-1',
          question: topic.questions[0].prompt,
          answer:
            'The wavefunction penetrates the forbidden region, decays exponentially, and leaves nonzero amplitude on the far side.',
        },
      ],
      metrics,
    )

    expect(report.source).toBe('local-heuristic')
    expect(report.maxScore).toBe(6)
    expect(report.totalScore).toBeGreaterThanOrEqual(1)
    expect(report.measuredBehavior.interruptions).toBe(1)
  })
})
