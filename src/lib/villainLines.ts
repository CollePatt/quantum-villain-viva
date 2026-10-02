const OPENERS = [
  'I see you. Three questions. Try not to blink.',
  'Hold still. I am observing.',
  'Another wavefunction wanders in. Let us collapse it.',
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
  hint: () => pick(HINT_TAUNTS),
  final: 'That is all. Let us see what collapsed.',
}
