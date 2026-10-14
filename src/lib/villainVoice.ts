// Makes the live Observer sound less like a helpful assistant: the WebRTC voice is pitched
// down and given a cold, metallic room before it reaches the speakers. If anything here is
// unsupported, the plain voice plays instead.

const PITCH_RATIO = 0.8 // about 4 semitones down

// A classic two-tap delay-line pitch shifter. Each tap sweeps through a short window at the
// pitch ratio and the two are crossfaded, which avoids clicks without needing an FFT.
const PITCH_WORKLET = `
class PitchShift extends AudioWorkletProcessor {
  constructor(options) {
    super()
    this.ratio = options.processorOptions.ratio
    this.window = Math.round(sampleRate * 0.06)
    this.size = this.window * 4
    this.buffer = new Float32Array(this.size)
    this.write = 0
    this.phase = 0
  }
  read(delay) {
    let index = this.write - delay
    while (index < 0) index += this.size
    const base = Math.floor(index)
    const frac = index - base
    const next = (base + 1) % this.size
    return this.buffer[base] * (1 - frac) + this.buffer[next] * frac
  }
  process(inputs, outputs) {
    const input = inputs[0][0]
    const output = outputs[0]
    if (!output || !output[0]) return true
    const step = (1 - this.ratio) / this.window
    for (let i = 0; i < output[0].length; i += 1) {
      this.buffer[this.write] = input ? input[i] : 0
      this.phase = (this.phase + step) % 1
      const phaseB = (this.phase + 0.5) % 1
      const a = this.read(this.phase * this.window + 1)
      const b = this.read(phaseB * this.window + 1)
      // sin² windows offset by half a cycle always sum to 1, so loudness stays steady.
      const sample = a * Math.sin(Math.PI * this.phase) ** 2 + b * Math.sin(Math.PI * phaseB) ** 2
      for (let channel = 0; channel < output.length; channel += 1) output[channel][i] = sample
      this.write = (this.write + 1) % this.size
    }
    return true
  }
}
registerProcessor('pitch-shift', PitchShift)
`

export type VillainVoice = {
  audioElement: HTMLAudioElement
  changePeerConnection: (peerConnection: RTCPeerConnection) => RTCPeerConnection
  close: () => void
}

// Call this inside the Start tap so mobile browsers allow audio to play.
export function prepareVillainVoice(): VillainVoice {
  const audioElement = document.createElement('audio')
  audioElement.autoplay = true
  audioElement.setAttribute('playsinline', '')

  const AudioContextClass =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AudioContextClass || typeof AudioWorkletNode === 'undefined') {
    return { audioElement, changePeerConnection: (pc) => pc, close: () => undefined }
  }

  const context = new AudioContextClass()
  void context.resume()
  const workletUrl = URL.createObjectURL(new Blob([PITCH_WORKLET], { type: 'application/javascript' }))
  const ready = context.audioWorklet.addModule(workletUrl)

  async function route(stream: MediaStream) {
    try {
      await ready
      const source = context.createMediaStreamSource(stream)
      const pitch = new AudioWorkletNode(context, 'pitch-shift', {
        processorOptions: { ratio: PITCH_RATIO },
        outputChannelCount: [1],
      })
      const body = context.createBiquadFilter()
      body.type = 'lowshelf'
      body.frequency.value = 220
      body.gain.value = 5
      const room = context.createConvolver()
      room.buffer = metallicRoom(context)
      const wet = context.createGain()
      wet.gain.value = 0.22
      const dry = context.createGain()
      dry.gain.value = 0.9

      source.connect(pitch).connect(body)
      body.connect(dry).connect(context.destination)
      body.connect(room).connect(wet).connect(context.destination)
      // Chrome only feeds a remote WebRTC stream into Web Audio while a media element plays it.
      audioElement.muted = true
    } catch {
      audioElement.muted = false
    }
  }

  return {
    audioElement,
    changePeerConnection: (peerConnection) => {
      peerConnection.addEventListener('track', (event) => {
        const stream = event.streams[0]
        if (stream) {
          void route(stream)
        }
      })
      return peerConnection
    },
    close: () => {
      URL.revokeObjectURL(workletUrl)
      void context.close()
    },
  }
}

// A short, bright, slightly ringing impulse: a big empty chamber with hard walls.
function metallicRoom(context: BaseAudioContext): AudioBuffer {
  const seconds = 1.1
  const length = Math.round(context.sampleRate * seconds)
  const buffer = context.createBuffer(2, length, context.sampleRate)
  for (let channel = 0; channel < 2; channel += 1) {
    const data = buffer.getChannelData(channel)
    for (let i = 0; i < length; i += 1) {
      const t = i / context.sampleRate
      const ring = 0.35 * Math.sin(2 * Math.PI * 1150 * t)
      data[i] = (Math.random() * 2 - 1 + ring) * Math.pow(1 - i / length, 3)
    }
  }
  return buffer
}
