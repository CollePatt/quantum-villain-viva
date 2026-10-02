import type { Question, TopicId } from './schemas'

// Plain-English question set for players without a physics background.
// Mirrored in api/grade-exam.ts, which must stay standalone for Vercel.
export const curiousQuestions: Record<TopicId, Question[]> = {
  tunneling: [
    {
      id: 'tunneling-c1',
      prompt:
        "How can a tiny particle get through a wall it doesn't have enough energy to climb over?",
      expectedConcepts: [
        'particle behaves like a spread out wave',
        'wave leaks into and through the barrier',
        'small chance of appearing on the other side',
      ],
      commonMisconception: 'It smashes through the wall or borrows energy to jump over it.',
      hint: 'Think of the particle as a wave, not a ball.',
    },
    {
      id: 'tunneling-c2',
      prompt: 'Does a thicker wall make tunneling more likely or less likely? By a little, or a lot?',
      expectedConcepts: [
        'thicker barrier makes tunneling less likely',
        'chance drops very quickly, exponentially',
        'taller barrier also lowers the chance',
      ],
      commonMisconception: 'Doubling the thickness only halves the chance.',
      hint: 'The drop-off is dramatic, not gradual.',
    },
    {
      id: 'tunneling-c3',
      prompt: 'Name something in the real world that only works because of tunneling.',
      expectedConcepts: [
        'nuclear fusion in stars, radioactive decay, flash memory, or tunneling microscopes',
        'particles crossing an energy barrier',
        'would be impossible in classical physics',
      ],
      commonMisconception: 'Naming something with no barrier to cross.',
      hint: 'The Sun, your phone storage, and some microscopes all rely on it.',
    },
  ],
  measurement: [
    {
      id: 'measurement-c1',
      prompt: "What is the point of Schrödinger's cat, the one that's alive and dead at the same time?",
      expectedConcepts: [
        'quantum systems can be in a superposition of states',
        'measuring or looking gives one definite result',
        'shows how strange quantum rules look on everyday objects',
      ],
      commonMisconception: 'That cats are literally half alive.',
      hint: 'Superposition, and what happens when you open the box.',
    },
    {
      id: 'measurement-c2',
      prompt:
        'You measure a quantum particle, then instantly measure it again the same way. What happens?',
      expectedConcepts: [
        'you get the same result again',
        'the first measurement already settled the state',
        'randomness only shows up the first time',
      ],
      commonMisconception: 'Every measurement is a fresh coin flip.',
      hint: 'Does the first measurement change anything?',
    },
    {
      id: 'measurement-c3',
      prompt: "Why can't you know exactly where a particle is and exactly how fast it's going?",
      expectedConcepts: [
        'uncertainty principle',
        'pinning down position spreads out momentum',
        'a property of nature, not bad equipment',
      ],
      commonMisconception: 'Our instruments just are not good enough yet.',
      hint: 'Heisenberg would like a word.',
    },
  ],
  spin: [
    {
      id: 'spin-c1',
      prompt: "Electrons have 'spin'. Is an electron literally a tiny spinning ball?",
      expectedConcepts: [
        'not literally spinning',
        'built in quantum angular momentum',
        'behaves like a tiny magnet',
        'measured as only up or down',
      ],
      commonMisconception: 'Yes, it is a ball rotating on an axis.',
      hint: 'It acts like a tiny magnet, but nothing is actually rotating.',
    },
    {
      id: 'spin-c2',
      prompt: "When you measure an electron's spin, how many different answers can you get?",
      expectedConcepts: [
        'only two results, up or down',
        'spin is quantized, not continuous',
        'which one you get can be random',
      ],
      commonMisconception: 'Any angle at all, like a compass needle.',
      hint: 'Fewer than you would think. Much fewer.',
    },
    {
      id: 'spin-c3',
      prompt: "Quantum computers use 'qubits'. How is a qubit different from a normal bit?",
      expectedConcepts: [
        'normal bit is either zero or one',
        'qubit can be in a superposition of zero and one',
        'measuring a qubit gives zero or one with some probability',
        'qubits can be entangled with each other',
      ],
      commonMisconception: 'A qubit just stores lots of bits at once.',
      hint: 'Zero, one, or a bit of both until you look.',
    },
  ],
  'harmonic-oscillator': [
    {
      id: 'oscillator-c1',
      prompt: 'Why do glowing atoms only give off certain colors of light instead of every color?',
      expectedConcepts: [
        'electrons only have certain allowed energy levels',
        'jumping between levels releases a specific energy',
        'that energy matches one color or frequency of light',
      ],
      commonMisconception: 'Atoms just happen to prefer some colors.',
      hint: 'Energy comes in fixed steps, like a staircase.',
    },
    {
      id: 'oscillator-c2',
      prompt: 'Can a quantum object ever sit perfectly still with zero energy? Why or why not?',
      expectedConcepts: [
        'never perfectly still',
        'zero point energy remains',
        'uncertainty principle forbids exact position and momentum',
      ],
      commonMisconception: 'Yes, at absolute zero everything stops.',
      hint: 'Even at absolute zero, something is left over.',
    },
    {
      id: 'oscillator-c3',
      prompt: "What does 'quantum' in 'quantum leap' actually mean?",
      expectedConcepts: [
        'energy comes in discrete chunks',
        'packets called quanta',
        'a quantum leap is actually tiny, not huge',
        'jumping between levels with nothing in between',
      ],
      commonMisconception: 'A huge, dramatic change.',
      hint: 'Corporate slides got this one backwards.',
    },
  ],
  entanglement: [
    {
      id: 'entanglement-c1',
      prompt: "Einstein called entanglement 'spooky action at a distance'. What is entanglement?",
      expectedConcepts: [
        'two particles share one joint quantum state',
        'measuring one is correlated with the other',
        'correlation holds even when far apart',
      ],
      commonMisconception: 'One particle sends a signal to the other.',
      hint: 'Two particles, one shared state.',
    },
    {
      id: 'entanglement-c2',
      prompt: 'Could you use entangled particles to text a friend on Mars instantly?',
      expectedConcepts: [
        'no faster than light messaging',
        'each side only sees random results',
        'need a normal signal to compare results',
      ],
      commonMisconception: 'Yes, flip one and the other flips instantly.',
      hint: 'What would your friend actually see on their end?',
    },
    {
      id: 'entanglement-c3',
      prompt: 'Name one real technology that uses entanglement, and what it does.',
      expectedConcepts: [
        'quantum cryptography or quantum key distribution',
        'quantum computers linking qubits',
        'quantum teleportation of states',
        'detects eavesdroppers on a channel',
      ],
      commonMisconception: 'Faster-than-light internet.',
      hint: 'Think unbreakable encryption.',
    },
  ],
}
