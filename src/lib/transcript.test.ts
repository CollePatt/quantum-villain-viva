import { describe, expect, it } from 'vitest'
import { collectNewUserText, extractTranscriptEntries } from './transcript'

describe('transcript helpers', () => {
  it('extracts user and assistant transcript text from realtime-like history', () => {
    const entries = extractTranscriptEntries([
      {
        itemId: 'u1',
        role: 'user',
        content: [{ type: 'input_audio', transcript: 'The amplitude decays.' }],
      },
      {
        itemId: 'a1',
        role: 'assistant',
        content: [{ type: 'output_audio', transcript: 'Acceptable. Barely.' }],
      },
    ])

    expect(entries).toEqual([
      { id: 'u1', role: 'user', text: 'The amplitude decays.' },
      { id: 'a1', role: 'assistant', text: 'Acceptable. Barely.' },
    ])
  })

  it('collects only unconsumed user text', () => {
    const consumed = new Set(['u1'])
    const result = collectNewUserText(
      [
        { id: 'u1', role: 'user', text: 'Old answer' },
        { id: 'u2', role: 'user', text: 'New answer' },
        { id: 'a1', role: 'assistant', text: 'Question' },
      ],
      consumed,
    )

    expect(result).toEqual({ text: 'New answer', ids: ['u2'] })
  })
})
