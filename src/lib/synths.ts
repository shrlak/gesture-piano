// The synth bank: every character the instrument can take on.
//
// This app has no samples and no piano voice — the whole instrument is one
// subtractive synth engine, and a preset is just a description of how to set it
// up: which oscillators to stack, how the filter opens, how the envelope moves,
// and how much the note distorts when it is played hard.
//
// Presets are plain data so that `audio.ts` stays a single code path. Adding a
// new sound means adding an entry here, not another `playX` method.

export type SynthPresetId = 'warm' | 'bright' | 'glass' | 'lead' | 'air' | 'growl'

/** One oscillator inside a preset. */
export interface OscLayer {
  type: OscillatorType
  /** Fine detune in cents; a pair of opposite values gives the classic width. */
  detune: number
  /** Transposition in semitones, for sub-octaves and bell partials. */
  semitones?: number
  gain: number
}

export interface FilterShape {
  /** Cutoff in Hz at the softest touch. */
  base: number
  /** Extra cutoff, in Hz, that a full-force strike adds. */
  velocity: number
  /** Cutoff that follows the note's own pitch, as a multiple of it. */
  track: number
  q: number
  /** Seconds to reach the peak, then to settle to the sustain cutoff. */
  attack: number
  decay: number
  /** Where the filter settles, as a fraction of its peak. */
  sustain: number
}

export interface AmpShape {
  attack: number
  decay: number
  /** Level held while the key is down, as a fraction of the peak. */
  sustain: number
  release: number
  /** Overall loudness trim, so presets sit at the same level. */
  level: number
}

export interface DriveShape {
  /** Grit the preset always has. */
  base: number
  /** Extra grit a full-force strike adds — this is the "press harder" knob. */
  velocity: number
}

export interface SynthPreset {
  id: SynthPresetId
  /** Korean name shown on the button. */
  name: string
  /** Two or three words under the name. */
  hint: string
  /** One sentence explaining when to reach for it. */
  description: string
  layers: OscLayer[]
  filter: FilterShape
  amp: AmpShape
  drive: DriveShape
  /** Pitch wobble that fades in, for singing lead sounds. */
  vibrato?: { rate: number; cents: number; delay: number }
}

export const SYNTH_PRESETS: SynthPreset[] = [
  {
    id: 'warm',
    name: '따뜻한',
    hint: '둥글고 포근한',
    description: '부드러운 삼각파에 서브를 깔았습니다. 잔잔한 경배와 기도 시간에.',
    layers: [
      { type: 'triangle', detune: 0, gain: 0.24 },
      { type: 'sawtooth', detune: -8, gain: 0.1 },
      { type: 'sine', detune: 0, semitones: -12, gain: 0.16 },
    ],
    filter: {
      base: 900,
      velocity: 2600,
      track: 1.4,
      q: 0.9,
      attack: 0.06,
      decay: 0.5,
      sustain: 0.62,
    },
    amp: { attack: 0.035, decay: 0.22, sustain: 0.86, release: 0.34, level: 0.44 },
    drive: { base: 0.12, velocity: 0.4 },
  },
  {
    id: 'bright',
    name: '밝은',
    hint: '또렷하고 시원한',
    description: '디튠된 톱니파 둘에 사각파를 얹은 기본 신디. 대부분의 찬양에 어울립니다.',
    layers: [
      { type: 'sawtooth', detune: -10, gain: 0.16 },
      { type: 'sawtooth', detune: 10, gain: 0.16 },
      { type: 'square', detune: 0, gain: 0.07 },
    ],
    filter: {
      base: 2100,
      velocity: 6800,
      track: 3,
      q: 3.5,
      attack: 0.014,
      decay: 0.38,
      sustain: 0.5,
    },
    amp: { attack: 0.008, decay: 0.18, sustain: 0.82, release: 0.22, level: 0.4 },
    drive: { base: 0.1, velocity: 0.5 },
  },
  {
    id: 'glass',
    name: '유리',
    hint: '맑은 종소리',
    description: '배음이 얇게 반짝입니다. 간주나 조용한 멜로디를 얹을 때.',
    layers: [
      { type: 'sine', detune: 0, gain: 0.22 },
      { type: 'sine', detune: 4, semitones: 12, gain: 0.12 },
      { type: 'triangle', detune: 0, semitones: 19, gain: 0.06 },
    ],
    filter: {
      base: 2800,
      velocity: 6000,
      track: 4,
      q: 1,
      attack: 0.006,
      decay: 0.7,
      sustain: 0.45,
    },
    amp: { attack: 0.004, decay: 0.5, sustain: 0.55, release: 0.5, level: 0.46 },
    drive: { base: 0.04, velocity: 0.22 },
  },
  {
    id: 'lead',
    name: '리드',
    hint: '노래하는 솔로',
    description: '비브라토가 실린 단선율용 소리. 멜로디를 앞으로 끌어냅니다.',
    layers: [
      { type: 'square', detune: 0, gain: 0.16 },
      { type: 'sawtooth', detune: 7, gain: 0.1 },
      { type: 'square', detune: 0, semitones: -12, gain: 0.07 },
    ],
    filter: {
      base: 1500,
      velocity: 5200,
      track: 2.4,
      q: 6,
      attack: 0.018,
      decay: 0.3,
      sustain: 0.55,
    },
    amp: { attack: 0.014, decay: 0.12, sustain: 0.9, release: 0.18, level: 0.4 },
    drive: { base: 0.3, velocity: 0.55 },
    vibrato: { rate: 5.4, cents: 10, delay: 0.35 },
  },
  {
    id: 'air',
    name: '에어',
    hint: '천천히 번지는',
    description: '소리가 늦게 피어오르는 패드. 코드를 길게 눌러 깔아 두세요.',
    layers: [
      { type: 'sawtooth', detune: -14, gain: 0.12 },
      { type: 'sawtooth', detune: 14, gain: 0.12 },
      { type: 'triangle', detune: 0, gain: 0.1 },
    ],
    filter: {
      base: 600,
      velocity: 2400,
      track: 1,
      q: 0.8,
      attack: 0.6,
      decay: 1.2,
      sustain: 0.78,
    },
    amp: { attack: 0.45, decay: 0.8, sustain: 0.92, release: 0.9, level: 0.5 },
    drive: { base: 0.05, velocity: 0.2 },
  },
  {
    id: 'growl',
    name: '그로울',
    hint: '거칠게 밀어붙이는',
    description: '세게 칠수록 확 일그러집니다. 후렴을 크게 몰아갈 때.',
    layers: [
      { type: 'sawtooth', detune: 0, gain: 0.18 },
      { type: 'sawtooth', detune: -18, gain: 0.13 },
      { type: 'square', detune: 0, semitones: -12, gain: 0.1 },
    ],
    filter: {
      base: 800,
      velocity: 4600,
      track: 1.8,
      q: 8,
      attack: 0.02,
      decay: 0.28,
      sustain: 0.5,
    },
    amp: { attack: 0.01, decay: 0.2, sustain: 0.8, release: 0.2, level: 0.38 },
    drive: { base: 0.5, velocity: 0.85 },
  },
]

export const DEFAULT_PRESET_ID: SynthPresetId = 'bright'

export function findPreset(id: SynthPresetId): SynthPreset {
  return SYNTH_PRESETS.find((preset) => preset.id === id) ?? SYNTH_PRESETS[1]
}
