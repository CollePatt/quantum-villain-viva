export type TranscriptEntry = {
  id: string
  role: 'user' | 'assistant' | 'system' | 'unknown'
  text: string
}

type RealtimeContent = {
  type?: string
  text?: string | null
  transcript?: string | null
}

type RealtimeLikeItem = {
  itemId?: string
  id?: string
  role?: string
  content?: RealtimeContent[]
  text?: string
  transcript?: string
}

function textFromItem(item: RealtimeLikeItem): string {
  const direct = item.text ?? item.transcript
  if (direct) {
    return direct
  }

  return (
    item.content
      ?.map((part) => part.text ?? part.transcript ?? '')
      .filter(Boolean)
      .join(' ')
      .trim() ?? ''
  )
}

export function extractTranscriptEntries(history: unknown[]): TranscriptEntry[] {
  return history
    .map((raw, index) => {
      const item = raw as RealtimeLikeItem
      const text = textFromItem(item)
      const role: TranscriptEntry['role'] =
        item.role === 'user' || item.role === 'assistant' || item.role === 'system'
          ? item.role
          : 'unknown'

      return {
        id: item.itemId ?? item.id ?? `history-${index}`,
        role,
        text,
      }
    })
    .filter((entry) => entry.text.length > 0)
}

export function collectNewUserText(
  entries: TranscriptEntry[],
  consumedIds: Set<string>,
): { text: string; ids: string[] } {
  const fresh = entries.filter(
    (entry) => entry.role === 'user' && !consumedIds.has(entry.id),
  )

  return {
    text: fresh.map((entry) => entry.text).join(' ').trim(),
    ids: fresh.map((entry) => entry.id),
  }
}
