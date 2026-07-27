// Accompaniment patterns (반주 패턴) and the clock that plays them.
//
// The hand picks the chord; the pattern decides *how* that chord is played.
// That split is what makes gesture accompaniment usable — you are conducting
// harmony, not trying to hit individual keys in mid-air.

import type { AudioEngine } from './audio'
import type { Voicing } from './theory'

export interface PatternEvent {
  /** Offset from the start of the bar, in beats. */
  at: number
  kind: 'bass' | 'chord' | 'arp'
  /** For `arp`: which chord tone to play, wrapping up an octave past the top. */
  step?: number
  /** Note length in beats. */
  length: number
  velocity: number
}

export interface Pattern {
  id: string
  name: string
  description: string
  /** Beats per bar; 6/8 is counted as six eighths. */
  beatsPerBar: number
  /** Whether to lay a sustained pad under the pattern. */
  pad: boolean
  events: PatternEvent[]
}

const arp = (at: number, step: number, velocity = 0.5, length = 0.9): PatternEvent => ({
  at,
  kind: 'arp',
  step,
  length,
  velocity,
})

export const PATTERNS: Pattern[] = [
  {
    id: 'pad',
    name: '패드 · 잔잔한 경배',
    description: '코드를 길게 깔아줍니다. 기도·묵상 시간에.',
    beatsPerBar: 4,
    pad: true,
    events: [
      { at: 0, kind: 'bass', length: 3.5, velocity: 0.45 },
      { at: 0, kind: 'chord', length: 3.5, velocity: 0.4 },
    ],
  },
  {
    id: 'arpeggio8',
    name: '아르페지오 8비트',
    description: '가장 무난한 찬양 반주. 대부분의 곡에 어울립니다.',
    beatsPerBar: 4,
    pad: true,
    events: [
      { at: 0, kind: 'bass', length: 1.8, velocity: 0.6 },
      arp(0, 0, 0.5),
      arp(0.5, 1, 0.38),
      arp(1, 2, 0.44),
      arp(1.5, 3, 0.38),
      { at: 2, kind: 'bass', length: 1.8, velocity: 0.45 },
      arp(2, 2, 0.48),
      arp(2.5, 3, 0.38),
      arp(3, 4, 0.44),
      arp(3.5, 1, 0.36),
    ],
  },
  {
    id: 'broken',
    name: '브로큰 코드 · 발라드',
    description: '베이스와 화음을 번갈아. 느린 곡에 좋습니다.',
    beatsPerBar: 4,
    pad: true,
    events: [
      { at: 0, kind: 'bass', length: 1.9, velocity: 0.62 },
      { at: 1, kind: 'chord', length: 0.9, velocity: 0.4 },
      { at: 2, kind: 'bass', length: 1.9, velocity: 0.48 },
      { at: 3, kind: 'chord', length: 0.9, velocity: 0.42 },
    ],
  },
  {
    id: 'block8',
    name: '8비트 블록 코드',
    description: '힘있는 찬양·후렴부. 리듬이 또렷합니다.',
    beatsPerBar: 4,
    pad: false,
    events: [
      { at: 0, kind: 'bass', length: 0.9, velocity: 0.68 },
      { at: 0, kind: 'chord', length: 0.45, velocity: 0.58 },
      { at: 0.5, kind: 'chord', length: 0.45, velocity: 0.34 },
      { at: 1, kind: 'chord', length: 0.45, velocity: 0.46 },
      { at: 1.5, kind: 'chord', length: 0.45, velocity: 0.34 },
      { at: 2, kind: 'bass', length: 0.9, velocity: 0.6 },
      { at: 2, kind: 'chord', length: 0.45, velocity: 0.54 },
      { at: 2.5, kind: 'chord', length: 0.45, velocity: 0.34 },
      { at: 3, kind: 'chord', length: 0.45, velocity: 0.46 },
      { at: 3.5, kind: 'chord', length: 0.45, velocity: 0.36 },
    ],
  },
  {
    id: 'sixeight',
    name: '6/8 흐름',
    description: '흘러가는 6/8 곡. 셋잇단 느낌.',
    beatsPerBar: 6,
    pad: true,
    events: [
      { at: 0, kind: 'bass', length: 2.8, velocity: 0.6 },
      arp(0, 0, 0.48, 0.9),
      arp(1, 1, 0.34, 0.9),
      arp(2, 2, 0.38, 0.9),
      { at: 3, kind: 'bass', length: 2.8, velocity: 0.44 },
      arp(3, 3, 0.46, 0.9),
      arp(4, 2, 0.34, 0.9),
      arp(5, 1, 0.36, 0.9),
    ],
  },
  {
    id: 'waltz',
    name: '3/4 찬송가',
    description: '전통 찬송가 왈츠 반주. 쿵-짝-짝.',
    beatsPerBar: 3,
    pad: false,
    events: [
      { at: 0, kind: 'bass', length: 1.4, velocity: 0.65 },
      { at: 1, kind: 'chord', length: 0.85, velocity: 0.42 },
      { at: 2, kind: 'chord', length: 0.85, velocity: 0.38 },
    ],
  },
  {
    id: 'gospel',
    name: '가스펠 · 싱커페이션',
    description: '당김음이 들어간 흑인 가스펠 느낌.',
    beatsPerBar: 4,
    pad: false,
    events: [
      { at: 0, kind: 'bass', length: 0.9, velocity: 0.7 },
      { at: 0, kind: 'chord', length: 0.4, velocity: 0.55 },
      { at: 0.75, kind: 'chord', length: 0.4, velocity: 0.42 },
      { at: 1.5, kind: 'chord', length: 0.4, velocity: 0.5 },
      { at: 2, kind: 'bass', length: 0.9, velocity: 0.55 },
      { at: 2.5, kind: 'chord', length: 0.4, velocity: 0.46 },
      { at: 3.25, kind: 'chord', length: 0.6, velocity: 0.52 },
    ],
  },
]

export function findPattern(id: string): Pattern {
  return PATTERNS.find((pattern) => pattern.id === id) ?? PATTERNS[0]
}

/** Chord tone `step`, wrapping into higher octaves once past the top note. */
function arpNote(voicing: Voicing, step: number): number {
  const notes = voicing.notes
  if (notes.length === 0) return voicing.bass
  const index = ((step % notes.length) + notes.length) % notes.length
  const octave = Math.floor(step / notes.length)
  return notes[index] + octave * 12
}

export interface SequencerHooks {
  /** Latest voicing to play; read fresh on every beat so chord changes land. */
  getVoicing: () => Voicing | null
  getPattern: () => Pattern
  /** 0-1 expression, folded into every note's velocity. */
  getIntensity: () => number
  metronome: () => boolean
  /** Fires on each beat so the UI can flash in time. */
  onBeat?: (beatInBar: number, beatsPerBar: number, atAudioTime: number) => void
  /** Fires at each bar line, for progression auto-advance. */
  onBar?: () => void
}

/**
 * Lookahead scheduler. `setTimeout` is far too jittery to drive music directly,
 * so we wake up every 25 ms and schedule anything due in the next 120 ms
 * against the audio clock, which is sample-accurate.
 */
export class Sequencer {
  private timer: number | null = null
  private nextBeatTime = 0
  private beat = 0
  private bpm = 76
  private running = false

  private static readonly LOOKAHEAD_S = 0.12
  private static readonly TICK_MS = 25

  private engine: AudioEngine
  private hooks: SequencerHooks

  constructor(engine: AudioEngine, hooks: SequencerHooks) {
    this.engine = engine
    this.hooks = hooks
  }

  get isRunning(): boolean {
    return this.running
  }

  setBpm(bpm: number) {
    this.bpm = Math.min(200, Math.max(40, bpm))
  }

  start() {
    if (this.running) return
    this.running = true
    this.beat = 0
    this.nextBeatTime = this.engine.currentTime + 0.08
    this.timer = window.setInterval(() => this.tick(), Sequencer.TICK_MS)
  }

  stop() {
    this.running = false
    if (this.timer !== null) {
      window.clearInterval(this.timer)
      this.timer = null
    }
  }

  /** Jump back to beat one, e.g. when the player restarts a verse. */
  resetBar() {
    this.beat = 0
    this.nextBeatTime = this.engine.currentTime + 0.05
  }

  private tick() {
    const pattern = this.hooks.getPattern()
    // 6/8 is written in eighths, so its beat unit is half a quarter note.
    const beatUnit = pattern.beatsPerBar === 6 ? 0.5 : 1
    const secondsPerBeat = (60 / this.bpm) * beatUnit

    while (this.nextBeatTime < this.engine.currentTime + Sequencer.LOOKAHEAD_S) {
      const beatInBar = this.beat % pattern.beatsPerBar
      this.scheduleBeat(pattern, beatInBar, this.nextBeatTime, secondsPerBeat)

      if (this.hooks.metronome()) {
        this.engine.playClick(this.nextBeatTime, beatInBar === 0)
      }
      this.hooks.onBeat?.(beatInBar, pattern.beatsPerBar, this.nextBeatTime)
      if (beatInBar === pattern.beatsPerBar - 1) this.hooks.onBar?.()

      this.beat += 1
      this.nextBeatTime += secondsPerBeat
    }
  }

  private scheduleBeat(
    pattern: Pattern,
    beatInBar: number,
    when: number,
    secondsPerBeat: number,
  ) {
    const voicing = this.hooks.getVoicing()
    if (!voicing) return
    const intensity = this.hooks.getIntensity()

    for (const event of pattern.events) {
      // Events are placed within a beat; only fire those owned by this beat.
      if (Math.floor(event.at) !== beatInBar) continue
      const offset = (event.at - beatInBar) * secondsPerBeat
      const at = when + offset
      const length = event.length * secondsPerBeat
      const velocity = Math.min(1, event.velocity * (0.55 + intensity * 0.75))

      switch (event.kind) {
        case 'bass':
          this.engine.playBass(voicing.bass, {
            velocity,
            hold: length,
            when: at,
          })
          break
        case 'chord':
          voicing.notes.forEach((note, index) => {
            // Roll the notes a few milliseconds apart so blocks sound played,
            // not triggered.
            this.engine.playPiano(note, {
              velocity: velocity * (index === 0 ? 1 : 0.85),
              hold: length,
              when: at + index * 0.008,
            })
          })
          break
        case 'arp':
          this.engine.playPiano(arpNote(voicing, event.step ?? 0), {
            velocity,
            hold: length,
            when: at,
          })
          break
      }
    }
  }
}
