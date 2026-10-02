const OPENERS = [
  'Ah. A volunteer. The door locks from my side.',
  'Welcome to my chamber. Three questions, and you may leave.',
  'Another challenger. How refreshing. How brief.',
]

const IMPRESSED = [
  'Hm. Annoyingly correct.',
  'Not bad. I am almost disappointed.',
  'Correct. Do not let it go to your head.',
]

const UNIMPRESSED = [
  'Bold. Wrong, but bold.',
  'Fascinating. Physics disagrees.',
  'I have heard sharper answers from a toaster.',
]

const HINT_TAUNTS = [
  'A hint? How very classical of you.',
  'Fine. Take it. I am keeping the points.',
  'Cheating. I respect it, slightly.',
]

function pick(lines: string[]): string {
  return lines[Math.floor(Math.random() * lines.length)]
}

export const villainLines = {
  opener: () => pick(OPENERS),
  reaction: (strong: boolean) => pick(strong ? IMPRESSED : UNIMPRESSED),
  hint: () => pick(HINT_TAUNTS),
  final: 'That is all. Let us see how badly that went.',
}
