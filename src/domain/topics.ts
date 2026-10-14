import { curiousQuestions } from './curiousQuestions'
import type { Question, Topic, TopicId } from './schemas'

export const topics: Topic[] = [
  {
    id: 'tunneling',
    title: 'Quantum Tunneling',
    shortName: 'Tunneling',
    emoji: '👻',
    tagline: 'Walk through walls',
    curiousQuestions: curiousQuestions['tunneling'],
    premise:
      'Can the candidate explain why a classically forbidden barrier is not necessarily forbidden to a wavefunction?',
    questions: [
      {
        id: 'tunneling-1',
        prompt:
          'A particle approaches a finite potential barrier with energy below the barrier height. Explain why transmission can still occur.',
        expectedConcepts: [
          'wavefunction penetrates the classically forbidden region',
          'exponential decay inside the barrier',
          'nonzero amplitude on the far side',
          'probability current or boundary matching',
        ],
        commonMisconception:
          'Treating the particle as secretly borrowing energy to climb over the barrier.',
        followUp:
          'Do not hide behind the word probability. What feature of the wavefunction survives inside the barrier?',
      },
      {
        id: 'tunneling-2',
        prompt:
          'How does the tunneling probability change when the barrier gets wider or taller?',
        expectedConcepts: [
          'probability decreases exponentially with barrier width',
          'probability decreases as barrier height exceeds particle energy',
          'decay constant depends on square root of barrier height minus energy',
        ],
        commonMisconception:
          'Assuming the probability decreases linearly with barrier width.',
        followUp:
          'Name the qualitative dependence. Is it linear, quadratic, or exponential?',
      },
      {
        id: 'tunneling-3',
        prompt:
          'Give one real physical example where tunneling matters and explain the mechanism briefly.',
        expectedConcepts: [
          'alpha decay or scanning tunneling microscopy or fusion',
          'barrier penetration',
          'measurable transmission despite classical prohibition',
        ],
        commonMisconception:
          'Giving an example with no actual classically forbidden barrier.',
        followUp:
          'Where exactly is the barrier in your example, and what crosses it?',
      },
      {
        id: 'tunneling-4',
        prompt:
          'Alpha decay is a tunneling process. Why do half-lives range from microseconds to billions of years?',
        expectedConcepts: [
          'alpha particle tunnels through the Coulomb barrier',
          'tunneling probability is exponentially sensitive to energy and barrier width',
          'small changes in decay energy give enormous changes in half-life',
        ],
        commonMisconception:
          'Thinking the alpha particle eventually gains enough energy to escape over the barrier.',
        followUp:
          'How sensitive is the tunneling rate to the decay energy? Linear, or something worse?',
      },
    ],
  },
  {
    id: 'measurement',
    title: 'Measurement and Collapse',
    shortName: 'Measurement',
    emoji: '👀',
    tagline: 'Look, and it changes',
    curiousQuestions: curiousQuestions['measurement'],
    premise:
      'Can the candidate distinguish states, observables, probabilities, and post-measurement updates?',
    questions: [
      {
        id: 'measurement-1',
        prompt:
          'What does it mean to measure an observable in a quantum state?',
        expectedConcepts: [
          'observables correspond to operators',
          'possible outcomes are eigenvalues',
          'probabilities come from projection amplitudes',
          'state updates to an eigenstate or eigenspace',
        ],
        commonMisconception:
          'Saying measurement merely reveals a pre-existing value in every case.',
        followUp:
          'What determines the list of possible measurement outcomes?',
      },
      {
        id: 'measurement-2',
        prompt:
          'If a state is already an eigenstate of the measured observable, what happens on repeated measurements?',
        expectedConcepts: [
          'same eigenvalue is obtained with certainty',
          'state remains in that eigenstate under ideal measurement',
          'repeatability depends on measuring the same observable',
        ],
        commonMisconception:
          'Assuming every measurement necessarily randomizes the state.',
        followUp:
          'Why is the second identical measurement not a fresh lottery?',
      },
      {
        id: 'measurement-3',
        prompt:
          'Why can measuring one observable disturb predictions for another observable?',
        expectedConcepts: [
          'noncommuting observables',
          'measurement changes the state',
          'new state may not be an eigenstate of the second observable',
          'uncertainty is structural not just instrumental',
        ],
        commonMisconception:
          'Blaming only clumsy instruments or experimental noise.',
        followUp:
          'What mathematical relation between observables captures this incompatibility?',
      },
      {
        id: 'measurement-4',
        prompt:
          'What is the difference between a superposition and a classical mixture of the same two states?',
        expectedConcepts: [
          'superposition has definite relative phase and is coherent',
          'superposition can show interference while a mixture cannot',
          'mixture describes ignorance about which state the system is in',
          'off-diagonal density matrix terms or coherences',
        ],
        commonMisconception:
          'Saying a superposition just means we do not know which state it is really in.',
        followUp:
          'What experiment would tell the two apart?',
      },
    ],
  },
  {
    id: 'spin',
    title: 'Spin and Stern-Gerlach',
    shortName: 'Spin',
    emoji: '🧲',
    tagline: 'Tiny magnets, big weirdness',
    curiousQuestions: curiousQuestions['spin'],
    premise:
      'Can the candidate reason about two-level spin systems and basis changes?',
    questions: [
      {
        id: 'spin-1',
        prompt:
          'A spin one-half particle is prepared spin-up along z. What outcomes are possible when measuring spin along z?',
        expectedConcepts: [
          'only up along z occurs for the prepared eigenstate',
          'probability one for plus hbar over two',
          'measurement basis matches preparation basis',
        ],
        commonMisconception:
          'Claiming up and down are equally likely even in the prepared z eigenstate.',
        followUp:
          'Which basis is the state already an eigenstate of?',
      },
      {
        id: 'spin-2',
        prompt:
          'Now measure that same spin-up-z particle along x. What outcomes and probabilities do you expect?',
        expectedConcepts: [
          'plus x and minus x are possible',
          'equal probabilities one half each',
          'z-up is a superposition in the x basis',
        ],
        commonMisconception:
          'Assuming spin-up-z means spin-up in every direction.',
        followUp:
          'How does the z basis state look when expressed in the x basis?',
      },
      {
        id: 'spin-3',
        prompt:
          'What did the Stern-Gerlach experiment reveal that was surprising classically?',
        expectedConcepts: [
          'discrete beam splitting',
          'quantized angular momentum projection',
          'two outcomes for spin one-half',
          'not a continuous smear of magnetic moments',
        ],
        commonMisconception:
          'Describing the result as a continuous classical deflection pattern.',
        followUp:
          'Why did a split into discrete spots matter?',
      },
      {
        id: 'spin-4',
        prompt:
          'Why does a spin one-half state need a 720-degree rotation to come back to itself?',
        expectedConcepts: [
          'a 360-degree rotation multiplies the spinor by minus one',
          'the sign change is a phase that shows up in interference experiments',
          'spinors transform under SU(2), a double cover of ordinary rotations',
        ],
        commonMisconception:
          'Claiming the electron is physically spinning twice as fast.',
        followUp:
          'If the minus sign is a global phase, how could anyone ever detect it?',
      },
    ],
  },
  {
    id: 'harmonic-oscillator',
    title: 'Quantum Harmonic Oscillator',
    shortName: 'Energy levels',
    emoji: '🪜',
    tagline: 'Quantum leaps',
    curiousQuestions: curiousQuestions['harmonic-oscillator'],
    premise:
      'Can the candidate connect ladder operators, quantized energy, and zero-point motion?',
    questions: [
      {
        id: 'oscillator-1',
        prompt:
          'What are the allowed energy levels of the quantum harmonic oscillator?',
        expectedConcepts: [
          'energy levels are discrete',
          'levels are evenly spaced by hbar omega',
          'ground state energy is one half hbar omega',
        ],
        commonMisconception:
          'Setting the ground-state energy to zero as in the classical oscillator.',
        followUp:
          'What is special about the lowest energy level?',
      },
      {
        id: 'oscillator-2',
        prompt:
          'What do creation and annihilation operators do in this system?',
        expectedConcepts: [
          'raise or lower the energy quantum number',
          'change energy by hbar omega',
          'annihilation operator kills the ground state',
        ],
        commonMisconception:
          'Treating ladder operators as ordinary position shifts.',
        followUp:
          'What quantity is being stepped up or down?',
      },
      {
        id: 'oscillator-3',
        prompt:
          'Why does the oscillator have zero-point energy?',
        expectedConcepts: [
          'uncertainty principle prevents both position and momentum being zero',
          'ground state still has finite spread',
          'minimum energy is above the classical minimum',
        ],
        commonMisconception:
          'Explaining zero-point energy as thermal motion.',
        followUp:
          'Would zero-point energy vanish at absolute zero, and why?',
      },
      {
        id: 'oscillator-4',
        prompt:
          'Why does the harmonic oscillator show up as a model in so many different physical systems?',
        expectedConcepts: [
          'any smooth potential is approximately quadratic near a minimum',
          'small oscillations about equilibrium are harmonic',
          'examples like molecular vibrations, phonons, or modes of the electromagnetic field',
        ],
        commonMisconception:
          'Saying it is because springs are common in nature.',
        followUp:
          'What happens to a general potential if you Taylor expand it around its minimum?',
      },
    ],
  },
  {
    id: 'entanglement',
    title: 'Entanglement and Bell States',
    shortName: 'Entanglement',
    emoji: '🔗',
    tagline: 'Spooky action',
    curiousQuestions: curiousQuestions['entanglement'],
    premise:
      'Can the candidate distinguish correlation, entanglement, and faster-than-light signaling?',
    questions: [
      {
        id: 'entanglement-1',
        prompt:
          'What makes a two-particle state entangled rather than merely correlated?',
        expectedConcepts: [
          'state cannot be factored into individual particle states',
          'joint state contains correlations not reducible to local pure states',
          'measurement outcomes are described by shared amplitudes',
        ],
        commonMisconception:
          'Calling any classical correlation entanglement.',
        followUp:
          'Can the total state be written as a simple product of each particle state?',
      },
      {
        id: 'entanglement-2',
        prompt:
          'What does a Bell inequality test rule out?',
        expectedConcepts: [
          'local hidden variable theories',
          'certain classical explanations of correlations',
          'quantum predictions violate Bell inequalities',
        ],
        commonMisconception:
          'Saying it proves measurement signals travel faster than light.',
        followUp:
          'What kind of hidden-variable explanation is constrained?',
      },
      {
        id: 'entanglement-3',
        prompt:
          'Why does entanglement not allow faster-than-light communication?',
        expectedConcepts: [
          'individual local outcomes are random',
          'correlations require classical comparison',
          'no controllable message is transmitted by choosing a measurement',
        ],
        commonMisconception:
          'Assuming instantaneous correlation is the same as sending information.',
        followUp:
          'What would the distant observer see before comparing notes classically?',
      },
      {
        id: 'entanglement-4',
        prompt:
          'What is quantum teleportation, and why does it not send anything faster than light?',
        expectedConcepts: [
          'transfers an unknown quantum state using shared entanglement',
          'requires a Bell measurement and sending two classical bits',
          'the classical channel limits the speed',
          'the original state is destroyed, consistent with no cloning',
        ],
        commonMisconception:
          'Thinking the particle itself physically jumps to the other location instantly.',
        followUp:
          'What does the receiver have before the classical bits arrive?',
      },
    ],
  },
]

export function getTopicById(id: TopicId): Topic {
  const topic = topics.find((candidate) => candidate.id === id)
  if (!topic) {
    throw new Error(`Unknown topic: ${id}`)
  }
  return topic
}

export function findQuestion(topic: Topic, questionId: string): Question | undefined {
  return [...topic.questions, ...topic.curiousQuestions].find(
    (question) => question.id === questionId,
  )
}
