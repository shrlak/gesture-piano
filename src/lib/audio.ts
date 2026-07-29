// The synth rack. Everything you hear is generated here — there is no sampler
// and no piano voice anywhere in the app.
//
// One subtractive engine covers every part: the preset chosen in `synths.ts`
// shapes the note you play, and the accompaniment reuses the same oscillator
// stack with a shorter envelope so the whole arrangement sounds like one
// instrument rather than a keyboard playing over a piano.
//
// Dynamics run through three places at once. A harder strike is
//   louder      (amp envelope peak),
//   brighter    (filter envelope peak), and
//   dirtier     (waveshaper drive),
// which together read as "pressed harder" far more convincingly than volume
// on its own.

import { midiToFrequency } from './theory'
import { DEFAULT_PRESET_ID, findPreset, type SynthPreset, type SynthPresetId } from './synths'

/** Mixer busses. Each is a synth voice; none of them is a sampled instrument. */
export type VoiceName = 'lead' | 'keys' | 'pad' | 'bass' | 'click'

export interface ActiveVoice {
  /** Stop the voice, letting it release naturally. */
  release: (when: number) => void
  /** Cut the voice off immediately, used when the engine is muted. */
  kill: () => void
  endsAt: number
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
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

/**
 * Soft-clipping curve for the drive stage. Curves are expensive enough to build
 * that they are cached per rounded amount — a fast run of notes would otherwise
 * allocate a table per keypress.
 */
// `WaveShaperNode.curve` insists on a plain (non-shared) buffer, hence the
// explicit type argument.
const CURVE_CACHE = new Map<number, Float32Array<ArrayBuffer>>()

function driveCurve(amount: number): Float32Array<ArrayBuffer> {
  const quantised = Math.round(clamp(amount, 0, 1) * 24) / 24
  const cached = CURVE_CACHE.get(quantised)
  if (cached) return cached

  const samples = 1024
  const curve = new Float32Array(samples)
  // Classic soft clipper: gentle rounding at low k, hard edges as it climbs.
  const k = quantised * 60
  for (let i = 0; i < samples; i += 1) {
    const x = (i * 2) / samples - 1
    curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x))
  }
  CURVE_CACHE.set(quantised, curve)
  return curve
}

export class AudioEngine {
  private context: AudioContext | null = null
  private master: GainNode | null = null
  private reverbSend: GainNode | null = null
  private busses = new Map<VoiceName, GainNode>()
  private active = new Set<ActiveVoice>()
  private sustaining = new Map<string, ActiveVoice>()

  private preset: SynthPreset = findPreset(DEFAULT_PRESET_ID)
  /** Player-dialled grit, multiplying whatever the preset already has. */
  private driveAmount = 0.35

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

    // Safety net after the compressor: hard strikes on a driven preset can
    // still overshoot, and a rounded edge is far kinder than digital clipping.
    const limiter = context.createWaveShaper()
    limiter.curve = driveCurve(0.12)

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
    compressor.connect(limiter)
    limiter.connect(context.destination)

    this.master = master
    this.reverbSend = reverbSend

    const levels: Record<VoiceName, number> = {
      lead: 0.85,
      keys: 0.6,
      pad: 0.5,
      bass: 0.75,
      click: 0.6,
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

  /** Notes already sounding keep their character; the next one changes. */
  setPreset(id: SynthPresetId) {
    this.preset = findPreset(id)
  }

  get presetId(): SynthPresetId {
    return this.preset.id
  }

  setDrive(amount: number) {
    this.driveAmount = clamp(amount, 0, 1)
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
   * Overdrive stage. Louder into the shaper means more of the curve's bent
   * region gets used, so `amount` controls grit while the post gain keeps the
   * level from running away with it.
   */
  private buildDrive(
    context: AudioContext,
    amount: number,
  ): { input: GainNode; output: GainNode } {
    const level = clamp(amount, 0, 1)
    const input = context.createGain()
    input.gain.value = 1 + level * 7

    const shaper = context.createWaveShaper()
    shaper.curve = driveCurve(level)
    shaper.oversample = '2x'

    const output = context.createGain()
    // Compensate most, but not all, of the gain the clipper adds: a dirty note
    // should still arrive a little hotter than a clean one.
    output.gain.value = 1 / (1 + level * 2.6)

    input.connect(shaper)
    shaper.connect(output)
    return { input, output }
  }

  /**
   * Builds the oscillator stack and filter shared by every preset voice, and
   * returns the node its amplifier should hang off.
   */
  private buildTone(
    context: AudioContext,
    preset: SynthPreset,
    frequency: number,
    velocity: number,
    when: number,
    destination: AudioNode,
  ): { oscillators: OscillatorNode[]; stop: (at: number) => void } {
    const drive = clamp(
      preset.drive.base + preset.drive.velocity * this.driveAmount * Math.pow(velocity, 2),
      0,
      1,
    )
    const { input: driveIn, output: driveOut } = this.buildDrive(context, drive)
    driveOut.connect(destination)

    const filter = context.createBiquadFilter()
    filter.type = 'lowpass'
    filter.Q.value = preset.filter.q
    filter.connect(driveIn)

    // Filter envelope. Playing harder opens it further, which is most of what
    // "dynamics" means on a synth.
    const shape = preset.filter
    const peak = clamp(
      shape.base + shape.velocity * Math.pow(velocity, 1.4) + frequency * shape.track,
      120,
      16000,
    )
    const settled = clamp(Math.max(frequency * 1.4, peak * shape.sustain), 120, 16000)
    filter.frequency.setValueAtTime(
      clamp(Math.max(frequency * 1.1, peak * 0.3), 60, 16000),
      when,
    )
    filter.frequency.linearRampToValueAtTime(peak, when + shape.attack)
    filter.frequency.exponentialRampToValueAtTime(settled, when + shape.attack + shape.decay)

    const oscillators: OscillatorNode[] = []
    for (const layer of preset.layers) {
      const osc = context.createOscillator()
      osc.type = layer.type
      osc.frequency.value = frequency * Math.pow(2, (layer.semitones ?? 0) / 12)
      osc.detune.value = layer.detune
      const gain = context.createGain()
      gain.gain.value = layer.gain
      osc.connect(gain)
      gain.connect(filter)
      osc.start(when)
      oscillators.push(osc)
    }

    // Vibrato fades in, the way a singer leans into a held note.
    let lfo: OscillatorNode | null = null
    if (preset.vibrato) {
      lfo = context.createOscillator()
      lfo.type = 'sine'
      lfo.frequency.value = preset.vibrato.rate
      const depth = context.createGain()
      depth.gain.setValueAtTime(0, when)
      depth.gain.setValueAtTime(0, when + preset.vibrato.delay)
      depth.gain.linearRampToValueAtTime(
        preset.vibrato.cents,
        when + preset.vibrato.delay + 0.4,
      )
      lfo.connect(depth)
      for (const osc of oscillators) depth.connect(osc.detune)
      lfo.start(when)
    }

    const stop = (at: number) => {
      for (const osc of oscillators) {
        try {
          osc.stop(at)
        } catch {
          /* already stopped */
        }
      }
      try {
        lfo?.stop(at)
      } catch {
        /* already stopped */
      }
    }

    return { oscillators, stop }
  }

  /**
   * The note the player holds down. It sustains for as long as the key is
   * down — that is the whole point of a synth voice — and its loudness,
   * brightness, and distortion all come from `velocity`.
   */
  playLead(
    midi: number,
    options: { velocity?: number; when?: number; voice?: VoiceName } = {},
  ): ActiveVoice | null {
    const context = this.context
    const bus = this.bus(options.voice ?? 'lead')
    if (!context || !bus) return null

    const preset = this.preset
    const velocity = clamp(options.velocity ?? 0.6, 0.05, 1)
    const when = options.when ?? context.currentTime
    const frequency = midiToFrequency(midi)

    const amp = context.createGain()
    amp.gain.value = 0
    amp.connect(bus)

    const { stop } = this.buildTone(context, preset, frequency, velocity, when, amp)

    // Loudness rises faster than velocity so soft playing really does drop back.
    const peak = preset.amp.level * Math.pow(velocity, 1.35)
    amp.gain.setValueAtTime(0.0001, when)
    amp.gain.linearRampToValueAtTime(peak, when + preset.amp.attack)
    amp.gain.linearRampToValueAtTime(
      peak * preset.amp.sustain,
      when + preset.amp.attack + preset.amp.decay,
    )

    const voice: ActiveVoice = {
      endsAt: Number.POSITIVE_INFINITY,
      release: (at) => {
        amp.gain.cancelScheduledValues(at)
        amp.gain.setValueAtTime(Math.max(0.0001, amp.gain.value), at)
        amp.gain.setTargetAtTime(0.0001, at, preset.amp.release / 3)
        stop(at + preset.amp.release * 4 + 0.2)
        this.active.delete(voice)
      },
      kill: () => {
        const now = context.currentTime
        amp.gain.cancelScheduledValues(now)
        amp.gain.setTargetAtTime(0.0001, now, 0.02)
        stop(now + 0.2)
        this.active.delete(voice)
      },
    }
    this.active.add(voice)
    return voice
  }

  /**
   * Accompaniment note: the same preset, but struck and decaying so patterns
   * stay rhythmic instead of smearing into one held chord. `hold` is how long
   * the note stays up before it starts to fall away.
   */
  playStab(
    midi: number,
    options: { velocity?: number; hold?: number; when?: number; voice?: VoiceName } = {},
  ): ActiveVoice | null {
    const context = this.context
    const bus = this.bus(options.voice ?? 'keys')
    if (!context || !bus) return null

    const preset = this.preset
    const velocity = clamp(options.velocity ?? 0.6, 0.05, 1)
    const when = options.when ?? context.currentTime
    const hold = options.hold ?? 0.9
    const frequency = midiToFrequency(midi)

    const amp = context.createGain()
    amp.gain.value = 0
    amp.connect(bus)

    const { stop } = this.buildTone(context, preset, frequency, velocity, when, amp)

    // Slow-attack presets would swallow a short pattern note, so the
    // accompaniment caps the attack and always decays.
    const attack = Math.min(preset.amp.attack, 0.06)
    const peak = preset.amp.level * Math.pow(velocity, 1.35) * 0.85
    const tail = 0.5
    amp.gain.setValueAtTime(0.0001, when)
    amp.gain.linearRampToValueAtTime(peak, when + attack)
    amp.gain.linearRampToValueAtTime(peak * 0.6, when + attack + Math.min(0.25, hold))
    const releaseStart = when + Math.max(attack + 0.02, hold)
    amp.gain.setTargetAtTime(0.0001, releaseStart, tail / 3)

    const endsAt = releaseStart + tail
    stop(endsAt + 0.2)

    const voice: ActiveVoice = {
      endsAt,
      release: (at) => {
        amp.gain.cancelScheduledValues(at)
        amp.gain.setTargetAtTime(0.0001, at, 0.12)
        stop(at + 0.8)
      },
      kill: () => {
        const now = context.currentTime
        amp.gain.cancelScheduledValues(now)
        amp.gain.setTargetAtTime(0.0001, now, 0.02)
        stop(now + 0.1)
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

    const velocity = clamp(options.velocity ?? 0.5, 0.05, 1)
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

  /** Rounded synth bass, sits under the chord without muddying it. */
  playBass(midi: number, options: { velocity?: number; hold?: number; when?: number } = {}) {
    const context = this.context
    const bus = this.bus('bass')
    if (!context || !bus) return null

    const velocity = clamp(options.velocity ?? 0.6, 0.05, 1)
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
    const bus = this.bus('click')
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
   * by both the on-screen keys and the computer keyboard: the note rings until
   * the matching `releaseNote` call.
   */
  holdNote(id: string, midi: number, velocity: number) {
    const existing = this.sustaining.get(id)
    if (existing) existing.release(this.currentTime)
    const voice = this.playLead(midi, { velocity })
    if (voice) this.sustaining.set(id, voice)
  }

  releaseNote(id: string) {
    const voice = this.sustaining.get(id)
    if (!voice) return
    voice.release(this.currentTime)
    this.sustaining.delete(id)
  }

  /** Silence everything now — the panic key and the stop button land here. */
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
