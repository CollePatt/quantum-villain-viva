import { useCallback, useEffect, useRef, useState } from 'react'

// Minimal typing for the Web Speech API, which TypeScript's DOM lib does not ship.
type RecognitionAlternative = { transcript: string }
type RecognitionResult = { isFinal: boolean; 0: RecognitionAlternative; length: number }
type RecognitionEvent = { resultIndex: number; results: ArrayLike<RecognitionResult> }
type Recognition = {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((event: RecognitionEvent) => void) | null
  onend: (() => void) | null
  onerror: ((event: { error: string }) => void) | null
  start(): void
  stop(): void
  abort(): void
}
type RecognitionConstructor = new () => Recognition

function getRecognitionConstructor(): RecognitionConstructor | null {
  if (typeof window === 'undefined') {
    return null
  }
  const candidate = window as unknown as {
    SpeechRecognition?: RecognitionConstructor
    webkitSpeechRecognition?: RecognitionConstructor
  }
  return candidate.SpeechRecognition ?? candidate.webkitSpeechRecognition ?? null
}

export function useSpeechRecognition(onFinalText: (text: string) => void) {
  const [isSupported] = useState(() => getRecognitionConstructor() !== null)
  const [isListening, setIsListening] = useState(false)
  const [interim, setInterim] = useState('')
  const [error, setError] = useState<string | null>(null)
  const recognitionRef = useRef<Recognition | null>(null)
  const wantsListeningRef = useRef(false)
  const onFinalRef = useRef(onFinalText)

  useEffect(() => {
    onFinalRef.current = onFinalText
  }, [onFinalText])

  const stop = useCallback(() => {
    wantsListeningRef.current = false
    recognitionRef.current?.stop()
    setIsListening(false)
    setInterim('')
  }, [])

  const start = useCallback(() => {
    const Constructor = getRecognitionConstructor()
    if (!Constructor) {
      return
    }

    recognitionRef.current?.abort()
    const recognition = new Constructor()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-US'
    recognition.onresult = (event) => {
      let interimText = ''
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index]
        if (result.isFinal) {
          onFinalRef.current(result[0].transcript)
        } else {
          interimText += result[0].transcript
        }
      }
      setInterim(interimText)
    }
    recognition.onerror = (event) => {
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        wantsListeningRef.current = false
        setError('Microphone blocked. You can type your answer instead.')
      }
    }
    recognition.onend = () => {
      // Mobile browsers end recognition after short pauses; resume while the player still wants it.
      if (wantsListeningRef.current && recognitionRef.current === recognition) {
        try {
          recognition.start()
          return
        } catch {
          // Fall through and show the mic as off.
        }
      }
      setIsListening(false)
      setInterim('')
    }

    recognitionRef.current = recognition
    wantsListeningRef.current = true
    setError(null)
    try {
      recognition.start()
      setIsListening(true)
    } catch {
      wantsListeningRef.current = false
      setIsListening(false)
    }
  }, [])

  useEffect(() => () => {
    wantsListeningRef.current = false
    recognitionRef.current?.abort()
  }, [])

  return { isSupported, isListening, interim, error, start, stop }
}
