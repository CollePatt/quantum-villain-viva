const PREFERRED_VOICES = [
  'Daniel',
  'Google UK English Male',
  'Microsoft Ryan',
  'Arthur',
  'Oliver',
  'Microsoft Guy',
]

function pickVoice(): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices()
  for (const name of PREFERRED_VOICES) {
    const match = voices.find((voice) => voice.name.includes(name))
    if (match) {
      return match
    }
  }
  return voices.find((voice) => voice.lang.startsWith('en-GB')) ??
    voices.find((voice) => voice.lang.startsWith('en'))
}

export function canSpeakLocally(): boolean {
  return (
    typeof window !== 'undefined' &&
    Boolean(window.speechSynthesis) &&
    typeof window.SpeechSynthesisUtterance !== 'undefined'
  )
}

export function speakLocally(
  text: string,
  handlers: { onStart?: () => void; onEnd?: () => void } = {},
) {
  if (!canSpeakLocally()) {
    handlers.onEnd?.()
    return
  }

  window.speechSynthesis.cancel()
  const utterance = new window.SpeechSynthesisUtterance(text)
  const voice = pickVoice()
  if (voice) {
    utterance.voice = voice
  }
  utterance.rate = 1.04
  utterance.pitch = 0.8
  utterance.onstart = () => handlers.onStart?.()
  utterance.onend = () => handlers.onEnd?.()
  utterance.onerror = () => handlers.onEnd?.()
  window.speechSynthesis.speak(utterance)
}

export function stopLocalSpeech() {
  if (canSpeakLocally()) {
    window.speechSynthesis.cancel()
  }
}
