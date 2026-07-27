// A small Web Audio instrument rack: piano, pad, bass, and a click.
//
// Everything is synthesised, so there are no samples to download and the app
// stays responsive on a phone. The piano voice is additive (fundamental plus a
// few stretched partials) with a percussive hammer transient, which lands close
// enough to an upright piano for accompaniment work.

import { midiToFrequency } from './theory'

export type VoiceName = 'piano' | 'pad' | 'bass' | 'bell'

export interface ActiveVoice {
  /** Stop the voice, letting it release naturally. */
  release: (when: number) => void
  /** Cut the voice off immediately, used when the engine is muted. */
  kill: () => void
  endsAt: number
}

/** Generates a decaying-noise impulse response for the reverb send. */
function buildImpulse(context: AudioContext, seconds: number, decay: number): AudioBuffer {
  const rate = context.sampleRate
  const length = Math.floor(rate * seconds)
  const impulse = context.createBuffer(2, length, rate)
  for (let channel = 0; channel < 2; channel += 1) {
    const data = impulse.getChannelData(channel)
    for (let i = 0; i < length; i += 1) {
      const progress = i / length
      // A little early silence reads as room distance rather than a metallic tail.
      const preDelay = progress < 0.012 ? progress / 0.012 : 1
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - progress, decay) * preDelay
    }
  }
  return impulse
}

export class AudioEngine {
  private context: AudioContext | null = null
  private master: GainNode | null = null
  private reverbSend: GainNode | null = null
  private busses = new Map<VoiceName, GainNode>()
  private active = new Set<ActiveVoice>()
  private sustaining = new Map<string, ActiveVoice>()

  get ready(): boolean {
    return this.context !== null
  }

  get currentTime(): number {
    return this.context?.currentTime ?? 0
  }

  /** Must be called from a user gesture; browsers block audio otherwise. */
  async start(): Promise<void> {
    if (this.context) {
      if (this.context.state === 'suspended') await this.context.resume()
      return
    }

    const context = new AudioContext({ latencyHint: 'interactive' })
    this.context = context

    const master = context.createGain()
    master.gain.value = 0.8

    // A gentle compressor keeps stacked chords from clipping when the pad,
    // bass, and melody all land on the same beat.
    const compressor = context.createDynamicsCompressor()
    compressor.threshold.value = -18
    compressor.knee.value = 24
    compressor.ratio.value = 3
    compressor.attack.value = 0.006
    compressor.release.value = 0.25

    const convolver = context.createConvolver()
    convolver.buffer = buildImpulse(context, 2.8, 2.4)

    const reverbSend = context.createGain()
    reverbSend.gain.value = 0.28
    const reverbReturn = context.createGain()
    reverbReturn.gain.value = 0.9

    const dry = context.createGain()
    dry.gain.value = 1

    dry.connect(master)
    reverbSend.connect(convolver)
    convolver.connect(reverbReturn)
    reverbReturn.connect(master)
    master.connect(compressor)
    compressor.connect(context.destination)

    this.master = master
    this.reverbSend = reverbSend

    const levels: Record<VoiceName, number> = {
      piano: 0.9,
      pad: 0.5,
      bass: 0.75,
      bell: 0.6,
    }
    for (const [name, level] of Object.entries(levels) as [VoiceName, number][]) {
      const bus = context.createGain()
      bus.gain.value = level
      bus.connect(dry)
      bus.connect(reverbSend)
      this.busses.set(name, bus)
    }

    if (context.state === 'suspended') await context.resume()
  }

  setMasterVolume(value: number) {
    if (!this.master || !this.context) return
    this.master.gain.setTargetAtTime(value, this.context.currentTime, 0.05)
  }

  setReverb(amount: number) {
    if (!this.reverbSend || !this.context) return
    this.reverbSend.gain.setTargetAtTime(amount, this.context.currentTime, 0.08)
  }

  setVoiceLevel(voice: VoiceName, value: number) {
    const bus = this.busses.get(voice)
    if (!bus || !this.context) return
    bus.gain.setTargetAtTime(value, this.context.currentTime, 0.05)
  }

  private bus(voice: VoiceName): GainNode | null {
    return this.busses.get(voice) ?? null
  }

  private track(voice: ActiveVoice) {
    this.active.add(voice)
    const context = this.context
    if (!context) return
    const delay = Math.max(0, voice.endsAt - context.currentTime) * 1000 + 200
    window.setTimeout(() => this.active.delete(voice), delay)
  }

  /**
   * Struck string voice. `hold` is how long the key stays down; the tail rings
   * on past it the way a real piano does.
   */
  playPiano(
    midi: number,
    options: {
      velocity?: number
      hold?: number
      when?: number
      voice?: VoiceName
    } = {},
  ): ActiveVoice | null {
    const context = this.context
    const bus = this.bus(options.voice ?? 'piano')
    if (!context || !bus) return null

    const velocity = Math.min(1, Math.max(0.05, options.velocity ?? 0.7))
    const when = options.when ?? context.currentTime
    const hold = options.hold ?? 0.9
    const frequency = midiToFrequency(midi)

    // Higher notes decay faster, exactly like real strings.
    const decay = Math.max(0.5, 5.5 * Math.pow(0.5, (midi - 48) / 26))

    const amp = context.createGain()
    amp.gain.value = 0
    amp.connect(bus)

    const tone = context.createBiquadFilter()
    tone.type = 'lowpass'
    // Playing harder opens the tone up, which is most of what "dynamics" means.
    tone.frequency.value = 1400 + velocity * 5200
    tone.Q.value = 0.4
    tone.connect(amp)

    const partials: Array<[number, number]> = [
      [1, 1],
      [2, 0.42],
      [3, 0.18],
      [4, 0.1],
      [6, 0.04],
    ]
    const oscillators: OscillatorNode[] = []
    for (const [ratio, level] of partials) {
      const osc = context.createOscillator()
      osc.type = 'sine'
      // Slight stretch tuning: real piano partials run sharp of pure harmonics.
      osc.frequency.value = frequency * ratio * (1 + 0.0004 * ratio * ratio)
      const partialGain = context.createGain()
      partialGain.gain.value = level * 0.25
      osc.connect(partialGain)
      partialGain.connect(tone)
      osc.start(when)
      oscillators.push(osc)
    }

    // Hammer noise: a few milliseconds of filtered noise glued to the attack.
    const noiseLength = Math.floor(context.sampleRate * 0.03)
    const noiseBuffer = context.createBuffer(1, noiseLength, context.sampleRate)
    const noiseData = noiseBuffer.getChannelData(0)
    for (let i = 0; i < noiseLength; i += 1) {
      noiseData[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / noiseLength, 3)
    }
    const noise = context.createBufferSource()
    noise.buffer = noiseBuffer
    const noiseGain = context.createGain()
    noiseGain.gain.value = velocity * 0.09
    const noiseFilter = context.createBiquadFilter()
    noiseFilter.type = 'bandpass'
    noiseFilter.frequency.value = frequency * 3
    noiseFilter.Q.value = 0.8
    noise.connect(noiseFilter)
    noiseFilter.connect(noiseGain)
    noiseGain.connect(amp)
    noise.start(when)

    const peak = velocity * 0.5
    amp.gain.setValueAtTime(0.0001, when)
    amp.gain.linearRampToValueAtTime(peak, when + 0.006)
    amp.gain.exponentialRampToValueAtTime(peak * 0.32, when + 0.35)
    const releaseStart = when + hold
    amp.gain.setTargetAtTime(0.0001, releaseStart, decay / 6)

    const endsAt = releaseStart + decay
    const stopAll = (at: number) => {
      for (const osc of oscillators) {
        try {
          osc.stop(at)
        } catch {
          /* already stopped */
        }
      }
      try {
        noise.stop(at)
      } catch {
        /* already stopped */
      }
    }
    stopAll(endsAt + 0.1)

    const voice: ActiveVoice = {
      endsAt,
      release: (at) => {
        amp.gain.cancelScheduledValues(at)
        amp.gain.setTargetAtTime(0.0001, at, 0.18)
        stopAll(at + 1.2)
      },
      kill: () => {
        const now = context.currentTime
        amp.gain.cancelScheduledValues(now)
        amp.gain.setTargetAtTime(0.0001, now, 0.02)
        stopAll(now + 0.1)
      },
    }
    this.track(voice)
    return voice
  }

  /** Sustained string/synth pad. Returns a handle you release yourself. */
  playPad(
    midi: number,
    options: { velocity?: number; when?: number } = {},
  ): ActiveVoice | null {
    const context = this.context
    const bus = this.bus('pad')
    if (!context || !bus) return null

    const velocity = Math.min(1, Math.max(0.05, options.velocity ?? 0.5))
    const when = options.when ?? context.currentTime
    const frequency = midiToFrequency(midi)

    const amp = context.createGain()
    amp.gain.value = 0
    amp.connect(bus)

    const filter = context.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.setValueAtTime(400, when)
    filter.frequency.linearRampToValueAtTime(900 + velocity * 2200, when + 1.4)
    filter.Q.value = 0.7
    filter.connect(amp)

    const oscillators: OscillatorNode[] = []
    for (const detune of [-7, 0, 7]) {
      const osc = context.createOscillator()
      osc.type = 'sawtooth'
      osc.frequency.value = frequency
      osc.detune.value = detune
      const level = context.createGain()
      level.gain.value = 0.12
      osc.connect(level)
      level.connect(filter)
      osc.start(when)
      oscillators.push(osc)
    }

    amp.gain.setValueAtTime(0.0001, when)
    amp.gain.linearRampToValueAtTime(velocity * 0.34, when + 0.9)

    const stopAll = (at: number) => {
      for (const osc of oscillators) {
        try {
          osc.stop(at)
        } catch {
          /* already stopped */
        }
      }
    }

    const voice: ActiveVoice = {
      endsAt: Number.POSITIVE_INFINITY,
      release: (at) => {
        amp.gain.cancelScheduledValues(at)
        amp.gain.setTargetAtTime(0.0001, at, 0.5)
        stopAll(at + 3)
        this.active.delete(voice)
      },
      kill: () => {
        const now = context.currentTime
        amp.gain.cancelScheduledValues(now)
        amp.gain.setTargetAtTime(0.0001, now, 0.05)
        stopAll(now + 0.3)
        this.active.delete(voice)
      },
    }
    this.active.add(voice)
    return voice
  }

  /** Rounded sine bass, sits under the chord without muddying it. */
  playBass(midi: number, options: { velocity?: number; hold?: number; when?: number } = {}) {
    const context = this.context
    const bus = this.bus('bass')
    if (!context || !bus) return null

    const velocity = Math.min(1, Math.max(0.05, options.velocity ?? 0.6))
    const when = options.when ?? context.currentTime
    const hold = options.hold ?? 0.8

    const amp = context.createGain()
    amp.gain.value = 0
    amp.connect(bus)

    const osc = context.createOscillator()
    osc.type = 'triangle'
    osc.frequency.value = midiToFrequency(midi)
    const sub = context.createOscillator()
    sub.type = 'sine'
    sub.frequency.value = midiToFrequency(midi)

    const subGain = context.createGain()
    subGain.gain.value = 0.5
    osc.connect(amp)
    sub.connect(subGain)
    subGain.connect(amp)

    amp.gain.setValueAtTime(0.0001, when)
    amp.gain.linearRampToValueAtTime(velocity * 0.32, when + 0.02)
    amp.gain.setTargetAtTime(0.0001, when + hold, 0.25)

    osc.start(when)
    sub.start(when)
    const endsAt = when + hold + 1
    osc.stop(endsAt)
    sub.stop(endsAt)

    const voice: ActiveVoice = {
      endsAt,
      release: (at) => {
        amp.gain.cancelScheduledValues(at)
        amp.gain.setTargetAtTime(0.0001, at, 0.15)
      },
      kill: () => {
        const now = context.currentTime
        amp.gain.cancelScheduledValues(now)
        amp.gain.setTargetAtTime(0.0001, now, 0.02)
      },
    }
    this.track(voice)
    return voice
  }

  /** Metronome click. `accent` marks beat one. */
  playClick(when: number, accent: boolean) {
    const context = this.context
    const bus = this.bus('bell')
    if (!context || !bus) return

    const osc = context.createOscillator()
    osc.type = 'square'
    osc.frequency.value = accent ? 1600 : 1050
    const amp = context.createGain()
    amp.gain.setValueAtTime(0.0001, when)
    amp.gain.linearRampToValueAtTime(accent ? 0.16 : 0.09, when + 0.002)
    amp.gain.exponentialRampToValueAtTime(0.0001, when + 0.06)
    osc.connect(amp)
    amp.connect(bus)
    osc.start(when)
    osc.stop(when + 0.1)
  }

  /**
   * Holds a note under a stable id, replacing whatever was sounding there. Used
   * for the melody hand, where a note rings until the pinch is released.
   */
  holdNote(id: string, midi: number, velocity: number) {
    const existing = this.sustaining.get(id)
    if (existing) existing.release(this.currentTime)
    const voice = this.playPiano(midi, { velocity, hold: 4 })
    if (voice) this.sustaining.set(id, voice)
  }

  releaseNote(id: string) {
    const voice = this.sustaining.get(id)
    if (!voice) return
    voice.release(this.currentTime)
    this.sustaining.delete(id)
  }

  /** Silence everything now — the "fist to stop" gesture lands here. */
  panic() {
    for (const voice of this.active) voice.kill()
    for (const voice of this.sustaining.values()) voice.kill()
    this.active.clear()
    this.sustaining.clear()
  }

  async close() {
    this.panic()
    await this.context?.close()
    this.context = null
    this.busses.clear()
  }
}
