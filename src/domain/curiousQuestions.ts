import type { Question, TopicId } from './schemas'

// Plain-English multiple choice for players the Observer has collapsed to Curious.
// Fixed answers grade instantly, so this tier stays fast.
// Mirrored in api/grade-exam.ts, which must stay standalone for Vercel.
export const curiousQuestions: Record<TopicId, Question[]> = {
  tunneling: [
    {
      id: 'tunneling-c1',
      prompt:
        "A particle hits a wall it doesn't have the energy to climb. How can it still end up on the other side?",
      choices: ['It borrows energy for a moment', 'Its wave leaks through the wall', 'It slips between the atoms'],
      answer: 1,
      expectedConcepts: ['particle behaves like a spread out wave', 'wave leaks into and through the barrier'],
      commonMisconception: 'It borrows energy to jump over the wall.',
    },
    {
      id: 'tunneling-c2',
      prompt: 'Make the wall twice as thick. What happens to the chance of getting through?',
      choices: ['It halves', 'It barely changes', 'It drops off a cliff'],
      answer: 2,
      expectedConcepts: ['thicker barrier makes tunneling less likely', 'chance drops exponentially'],
      commonMisconception: 'Doubling the thickness only halves the chance.',
    },
    {
      id: 'tunneling-c3',
      prompt: 'Which of these only works because of tunneling?',
      choices: ['The Sun shining', 'A rainbow', 'A fridge magnet'],
      answer: 0,
      expectedConcepts: ['fusion in stars needs particles to tunnel', 'particles crossing an energy barrier'],
      commonMisconception: 'Picking something with no barrier to cross.',
    },
  ],
  measurement: [
    {
      id: 'measurement-c1',
      prompt: "What is Schrödinger's cat actually about?",
      choices: ['Cats are secretly quantum', 'Superposition until you look', 'Why boxes are dangerous'],
      answer: 1,
      expectedConcepts: ['quantum systems can be in a superposition', 'looking gives one definite result'],
      commonMisconception: 'That cats are literally half alive.',
    },
    {
      id: 'measurement-c2',
      prompt: 'You measure a particle, then instantly measure it again the same way. You get…',
      choices: ['A fresh random result', 'Nothing at all', 'The same result'],
      answer: 2,
      expectedConcepts: ['you get the same result again', 'the first measurement settled the state'],
      commonMisconception: 'Every measurement is a fresh coin flip.',
    },
    {
      id: 'measurement-c3',
      prompt: "Why can't you know a particle's exact position and exact speed at the same time?",
      choices: ["Our tools aren't good enough", 'Nature does not allow it', 'It moves too fast to see'],
      answer: 1,
      expectedConcepts: ['uncertainty principle', 'a property of nature, not bad equipment'],
      commonMisconception: 'Our instruments just are not good enough yet.',
    },
  ],
  spin: [
    {
      id: 'spin-c1',
      prompt: "Electrons have 'spin'. Is an electron literally a tiny spinning ball?",
      choices: ['No, spin is a built-in property', 'Yes, it rotates very fast', 'Only while someone watches'],
      answer: 0,
      expectedConcepts: ['not literally spinning', 'built in quantum angular momentum'],
      commonMisconception: 'Yes, it is a ball rotating on an axis.',
    },
    {
      id: 'spin-c2',
      prompt: "Measure an electron's spin along one direction. How many different results can you get?",
      choices: ['Any angle at all', 'Two', 'Three'],
      answer: 1,
      expectedConcepts: ['only two results, up or down', 'spin is quantized'],
      commonMisconception: 'Any angle at all, like a compass needle.',
    },
    {
      id: 'spin-c3',
      prompt: 'Quantum computers use qubits. How is a qubit different from a normal bit?',
      choices: ['It is just a faster bit', 'It stores a million bits', 'It can be a mix of 0 and 1'],
      answer: 2,
      expectedConcepts: ['qubit can be in a superposition of zero and one', 'measuring gives zero or one'],
      commonMisconception: 'A qubit just stores lots of bits at once.',
    },
  ],
  'harmonic-oscillator': [
    {
      id: 'oscillator-c1',
      prompt: 'Why do glowing atoms give off only certain colors of light?',
      choices: ['Energy comes in fixed steps', 'Atoms prefer warm colors', 'The air absorbs the rest'],
      answer: 0,
      expectedConcepts: ['electrons only have certain energy levels', 'each jump releases one color'],
      commonMisconception: 'Atoms just happen to prefer some colors.',
    },
    {
      id: 'oscillator-c2',
      prompt: 'Can a quantum object ever sit perfectly still with zero energy?',
      choices: ['Yes, at absolute zero', 'Only in a vacuum', 'No, some energy always remains'],
      answer: 2,
      expectedConcepts: ['never perfectly still', 'zero point energy remains'],
      commonMisconception: 'Yes, at absolute zero everything stops.',
    },
    {
      id: 'oscillator-c3',
      prompt: "In physics, how big is a 'quantum leap'?",
      choices: ['Enormous', 'Tiny', 'Depends on the slide deck'],
      answer: 1,
      expectedConcepts: ['energy comes in discrete chunks', 'a quantum leap is tiny'],
      commonMisconception: 'A huge, dramatic change.',
    },
  ],
  entanglement: [
    {
      id: 'entanglement-c1',
      prompt: "Einstein called entanglement 'spooky action at a distance'. What is it?",
      choices: ['Two particles sharing one state', 'Particles sending secret signals', 'Particles stuck together'],
      answer: 0,
      expectedConcepts: ['two particles share one joint quantum state', 'measurements are correlated'],
      commonMisconception: 'One particle sends a signal to the other.',
    },
    {
      id: 'entanglement-c2',
      prompt: 'Could entangled particles let you text a friend on Mars instantly?',
      choices: ['Yes, instantly', 'Yes, but only one bit', 'No, no message gets through'],
      answer: 2,
      expectedConcepts: ['no faster than light messaging', 'each side only sees random results'],
      commonMisconception: 'Yes, flip one and the other flips instantly.',
    },
    {
      id: 'entanglement-c3',
      prompt: 'Which technology actually uses entanglement?',
      choices: ['Faster-than-light internet', 'Quantum encryption', 'Wireless charging'],
      answer: 1,
      expectedConcepts: ['quantum key distribution', 'detects eavesdroppers on a channel'],
      commonMisconception: 'Faster-than-light internet.',
    },
  ],
}
