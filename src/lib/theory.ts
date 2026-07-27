// Diatonic harmony helpers, sized for what worship accompaniment actually needs:
// pick a key, get the seven chords of that key, and voice them so consecutive
// chords stay close to each other instead of leaping around the keyboard.

export type ChordQuality = 'major' | 'minor' | 'diminished'
export type ChordColor = 'triad' | 'add9' | 'sus4' | 'seventh'

export interface KeyDef {
  /** Pitch class of the tonic, 0 = C. */
  tonic: number
  /** Display name, e.g. "G" or "Em". */
  name: string
  /** Spelling preference for accidentals. */
  useFlats: boolean
}

export interface Chord {
  /** 1-7, the scale degree this chord is built on. */
  degree: number
  /** Roman numeral, lower case for minor: I, ii, iii, IV, V, vi, vii°. */
  numeral: string
  /** Concert chord symbol, e.g. "Am7". */
  symbol: string
  /** Korean function name, e.g. 딸림화음. */
  functionName: string
  quality: ChordQuality
  /** Semitone offsets above the chord root, before voicing. */
  intervals: number[]
  /** Pitch class of the chord root. */
  rootPc: number
}

const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']

/** Semitones above the tonic for each degree of the major scale. */
const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11]

const DEGREE_QUALITY: ChordQuality[] = [
  'major', // I
  'minor', // ii
  'minor', // iii
  'major', // IV
  'major', // V
  'minor', // vi
  'diminished', // vii°
]

const DEGREE_NUMERALS = ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°']

// The names a Korean worship team would actually say out loud.
const DEGREE_FUNCTIONS = [
  '으뜸화음',
  '웃으뜸화음',
  '가온화음',
  '버금딸림화음',
  '딸림화음',
  '버금가온화음',
  '이끔화음',
]

/** Keys worship sets usually live in, tonic-major only. */
export const KEYS: KeyDef[] = [
  { tonic: 0, name: 'C', useFlats: false },
  { tonic: 1, name: 'Db', useFlats: true },
  { tonic: 2, name: 'D', useFlats: false },
  { tonic: 3, name: 'Eb', useFlats: true },
  { tonic: 4, name: 'E', useFlats: false },
  { tonic: 5, name: 'F', useFlats: true },
  { tonic: 6, name: 'F#', useFlats: false },
  { tonic: 7, name: 'G', useFlats: false },
  { tonic: 8, name: 'Ab', useFlats: true },
  { tonic: 9, name: 'A', useFlats: false },
  { tonic: 10, name: 'Bb', useFlats: true },
  { tonic: 11, name: 'B', useFlats: false },
]

export function noteName(pitchClass: number, useFlats: boolean): string {
  const names = useFlats ? FLAT_NAMES : SHARP_NAMES
  return names[((pitchClass % 12) + 12) % 12]
}

export function midiToFrequency(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12)
}

function intervalsFor(quality: ChordQuality, color: ChordColor): number[] {
  const base = quality === 'major' ? [0, 4, 7] : quality === 'minor' ? [0, 3, 7] : [0, 3, 6]

  switch (color) {
    case 'triad':
      return base
    case 'add9':
      // add9 on a diminished chord is not a worship sound; leave it alone.
      return quality === 'diminished' ? base : [...base, 14]
    case 'sus4':
      // Suspensions erase the third, so they only make sense on major/minor.
      return quality === 'diminished' ? base : [0, 5, 7]
    case 'seventh':
      if (quality === 'major') return [0, 4, 7, 11] // maj7
      if (quality === 'minor') return [0, 3, 7, 10] // m7
      return [0, 3, 6, 10] // half-diminished
  }
}

function symbolSuffix(quality: ChordQuality, color: ChordColor): string {
  if (quality === 'diminished') return color === 'seventh' ? 'm7♭5' : 'dim'
  const minor = quality === 'minor' ? 'm' : ''
  switch (color) {
    case 'triad':
      return minor
    case 'add9':
      return `${minor}add9`
    case 'sus4':
      return 'sus4'
    case 'seventh':
      return quality === 'major' ? 'maj7' : 'm7'
  }
}

/** The seven diatonic chords of `key`, dressed in `color`. */
export function diatonicChords(key: KeyDef, color: ChordColor): Chord[] {
  return MAJOR_SCALE.map((offset, index) => {
    const quality = DEGREE_QUALITY[index]
    const rootPc = (key.tonic + offset) % 12
    return {
      degree: index + 1,
      numeral: DEGREE_NUMERALS[index],
      symbol: noteName(rootPc, key.useFlats) + symbolSuffix(quality, color),
      functionName: DEGREE_FUNCTIONS[index],
      quality,
      intervals: intervalsFor(quality, color),
      rootPc,
    }
  })
}

/** Scale pitches of `key` as MIDI notes, ascending from `fromMidi`. */
export function scaleNotes(key: KeyDef, fromMidi: number, count: number): number[] {
  const notes: number[] = []
  for (let i = 0; i < count; i += 1) {
    const octave = Math.floor(i / MAJOR_SCALE.length)
    const degree = i % MAJOR_SCALE.length
    notes.push(fromMidi + key.tonic + MAJOR_SCALE[degree] + octave * 12)
  }
  return notes
}

/**
 * MIDI note for scale `degree` of `key`, counting 0 as the tonic. Degrees run
 * past 7 into the octaves above, so degree 7 is the tonic an octave up.
 */
export function degreeToMidi(key: KeyDef, fromMidi: number, degree: number): number {
  const octave = Math.floor(degree / MAJOR_SCALE.length)
  const step = ((degree % MAJOR_SCALE.length) + MAJOR_SCALE.length) % MAJOR_SCALE.length
  return fromMidi + key.tonic + MAJOR_SCALE[step] + octave * 12
}

/** Movable-do solfège name for a scale degree. */
const SOLFA = ['도', '레', '미', '파', '솔', '라', '시']

export function solfaForDegree(degree: number): string {
  const octave = Math.floor(degree / SOLFA.length)
  const name = SOLFA[((degree % SOLFA.length) + SOLFA.length) % SOLFA.length]
  // A prime mark per octave above the starting one, as in Korean sheet music.
  return name + '′'.repeat(Math.max(0, octave))
}

/** Solfège for a concert pitch, given the key it is being read in. */
export function solfaForMidi(key: KeyDef, midi: number): string | null {
  const offset = (((midi - key.tonic) % 12) + 12) % 12
  const degree = MAJOR_SCALE.indexOf(offset)
  return degree < 0 ? null : SOLFA[degree]
}

export interface Voicing {
  /** Bass note, played by the left hand of a real pianist. */
  bass: number
  /** Right-hand notes, already inverted for smooth voice leading. */
  notes: number[]
}

/** Average pitch of a set of notes, used to measure voice-leading distance. */
function centroid(notes: number[]): number {
  return notes.reduce((sum, note) => sum + note, 0) / notes.length
}

/**
 * Voice `chord` near `previous` so the accompaniment moves by step rather than
 * jumping an octave every time the chord changes. Tries every inversion and
 * keeps whichever one sits closest to the last voicing.
 */
export function voiceChord(
  chord: Chord,
  options: {
    /** Roughly where the right hand should sit; MIDI note. */
    center?: number
    /** Octave shift applied to the bass note. */
    bassOctave?: number
    previous?: Voicing | null
  } = {},
): Voicing {
  const center = options.center ?? 64 // E4
  const bassOctave = options.bassOctave ?? 0

  // Start from the chord in root position somewhere below the target center.
  const rootBase = chord.rootPc + 48 // C3 register
  const candidates: number[][] = []

  for (let inversion = 0; inversion < chord.intervals.length; inversion += 1) {
    const rotated = chord.intervals.map((interval, index) =>
      index < inversion ? interval + 12 : interval,
    )
    // Slide the whole shape into octaves around the target center.
    for (let octave = -1; octave <= 2; octave += 1) {
      candidates.push(rotated.map((interval) => rootBase + interval + octave * 12))
    }
  }

  const target = options.previous?.notes.length ? centroid(options.previous.notes) : center

  let best = candidates[0]
  let bestCost = Number.POSITIVE_INFINITY
  for (const candidate of candidates) {
    const low = Math.min(...candidate)
    const high = Math.max(...candidate)
    // Keep the voicing inside a comfortable right-hand register.
    if (low < 52 || high > 84) continue

    let cost = Math.abs(centroid(candidate) - target)
    if (options.previous?.notes.length) {
      // Reward common tones: chords that share notes should barely move.
      for (const note of candidate) {
        const nearest = Math.min(...options.previous.notes.map((prev) => Math.abs(prev - note)))
        cost += nearest * 0.35
      }
    }
    if (cost < bestCost) {
      bestCost = cost
      best = candidate
    }
  }

  return {
    bass: chord.rootPc + 36 + bassOctave * 12, // C2 register
    notes: [...best].sort((a, b) => a - b),
  }
}

export interface Progression {
  id: string
  name: string
  /** Scale degrees, 1-7. */
  degrees: number[]
}

/** Progressions that cover most of a Korean worship set. */
export const PROGRESSIONS: Progression[] = [
  { id: 'free', name: '자유 연주 (진행 없음)', degrees: [] },
  { id: '1564', name: '1-5-6-4 · 가장 흔한 찬양 진행', degrees: [1, 5, 6, 4] },
  { id: '6415', name: '6-4-1-5 · 잔잔한 경배', degrees: [6, 4, 1, 5] },
  { id: '1645', name: '1-6-4-5 · 옛 찬송가풍', degrees: [1, 6, 4, 5] },
  { id: '4156', name: '4-1-5-6 · 후렴 고조', degrees: [4, 1, 5, 6] },
  {
    id: 'canon',
    name: '캐논 진행 1-5-6-3-4-1-4-5',
    degrees: [1, 5, 6, 3, 4, 1, 4, 5],
  },
  { id: '1425', name: '1-4-2-5 · 찬송가 마침', degrees: [1, 4, 2, 5] },
]
