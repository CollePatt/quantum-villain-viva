import type { TierEvent } from '../domain/round'

const OPENERS = [
  'Before we begin, I need to measure you. Hard question first.',
  'One measurement first. It tells me which version of you showed up.',
  'Hold still. This first question decides what you are.',
]

const IMPRESSED = [
  'Hm. Annoyingly correct.',
  'Correct. I saw that coming. Mostly.',
  'Not bad. Noted.',
]

const UNIMPRESSED = [
  'Bold. Wrong, but bold.',
  'I observed that. I wish I had not.',
  'Fascinating. Physics disagrees.',
]

const TIER_LINES: Record<Exclude<TierEvent, null>, string[]> = {
  survived: [
    'Measurement holds. You remain a physicist. For now.',
    'Physicist confirmed. Do not let it go to your head.',
    'Still standing. I will look harder.',
  ],
  collapsed: [
    'Measurement complete. Collapsing you to a simpler state.',
    'You were in a superposition of physicist and not. I have looked. Not.',
    'Downgrading you to Curious. Multiple choice. Take your time. Actually, do not.',
  ],
  promoted: [
    'Two in a row. Suspicious. Back up you go.',
    'Your wavefunction is creeping upward. I will allow one more hard one.',
    'Fine. Physicist again. Prove it was not luck.',
  ],
  'too-late': [
    'That would have earned a promotion. Pity there is nothing left to ask.',
    'Two in a row. Promotion denied on a technicality: time.',
  ],
}

const HINT_TAUNTS = [
  'A hint? I saw that.',
  'Fine. Take it. I am keeping the points.',
  'Peeking at the notes. I am the one who watches here.',
]

function pick(lines: string[]): string {
  return lines[Math.floor(Math.random() * lines.length)]
}

export const villainLines = {
  opener: () => pick(OPENERS),
  reaction: (strong: boolean) => pick(strong ? IMPRESSED : UNIMPRESSED),
  tier: (event: Exclude<TierEvent, null>) => pick(TIER_LINES[event]),
  hint: () => pick(HINT_TAUNTS),
  measuring: 'Measuring.',
  final: 'That is all. Let us see what collapsed.',
}
