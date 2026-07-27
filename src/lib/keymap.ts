// Computer keyboard → piano keys.
//
// Bindings are keyed by `KeyboardEvent.code` (physical key) rather than `.key`
// (produced character). With a Korean IME active `.key` comes back as Hangul
// jamo — "ㅋ" instead of "z" — which would break the whole layout. `.code` is
// immune to both the IME and the keyboard layout.
//
// There are two layouts, and the difference is what makes this playable for
// someone who is not a pianist:
//
//   easy      every key is a note of the chosen key. No accidentals exist, so
//             no keypress can sound wrong. The same fingering plays the same
//             tune in all twelve keys.
//   chromatic a literal piano: home row is the white keys, the row above holds
//             the black keys, sitting between their neighbours as on a piano.

export type Layout = 'easy' | 'chromatic'

/** Home row, left to right — the row the hands already rest on. */
const HOME_ROW = [
  'KeyA',
  'KeyS',
  'KeyD',
  'KeyF',
  'KeyG',
  'KeyH',
  'KeyJ',
  'KeyK',
  'KeyL',
  'Semicolon',
] as const

/** The row above it. */
const TOP_ROW = [
  'KeyQ',
  'KeyW',
  'KeyE',
  'KeyR',
  'KeyT',
  'KeyY',
  'KeyU',
  'KeyI',
  'KeyO',
  'KeyP',
] as const

const KEY_LABELS: Record<string, string> = {
  KeyA: 'A',
  KeyS: 'S',
  KeyD: 'D',
  KeyF: 'F',
  KeyG: 'G',
  KeyH: 'H',
  KeyJ: 'J',
  KeyK: 'K',
  KeyL: 'L',
  Semicolon: ';',
  KeyQ: 'Q',
  KeyW: 'W',
  KeyE: 'E',
  KeyR: 'R',
  KeyT: 'T',
  KeyY: 'Y',
  KeyU: 'U',
  KeyI: 'I',
  KeyO: 'O',
  KeyP: 'P',
}

// ---------------------------------------------------------------------------
// Easy layout: keys are scale degrees, not semitones.
// ---------------------------------------------------------------------------

/**
 * Home row is degrees 0-9 (도 to the 미 an octave up); the top row is the same
 * shape one octave higher, so both hands use identical fingering. Highest
 * degree reachable is 16.
 */
export const EASY_TOP_OFFSET = 7
export const EASY_MAX_DEGREE = EASY_TOP_OFFSET + TOP_ROW.length - 1

const EASY_BY_CODE = new Map<string, number>()
HOME_ROW.forEach((code, index) => EASY_BY_CODE.set(code, index))
TOP_ROW.forEach((code, index) => EASY_BY_CODE.set(code, EASY_TOP_OFFSET + index))

/** Scale degree for a key in the easy layout, or undefined. */
export function degreeForCode(code: string): number | undefined {
  return EASY_BY_CODE.get(code)
}

// ---------------------------------------------------------------------------
// Chromatic layout: a real piano keyboard.
//
//   black:   W E     T Y U     O P
//   white:  A S D F G H J K L ;
// ---------------------------------------------------------------------------

/** Semitones above the base note for each white key, in home-row order. */
const WHITE_SEMITONES = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16]

/**
 * Black keys, paired with the top-row key that sits above them. `null` marks
 * E–F and B–C, where a piano has no black key either, leaving Q, R and I free.
 */
const BLACK_SEMITONES: Array<number | null> = [null, 1, 3, null, 6, 8, 10, null, 13, 15]

/** Total span of the chromatic keyboard, in semitones above the base note. */
export const KEYBOARD_SPAN = 16

const CHROMATIC_BY_CODE = new Map<string, number>()
HOME_ROW.forEach((code, index) => CHROMATIC_BY_CODE.set(code, WHITE_SEMITONES[index]))
TOP_ROW.forEach((code, index) => {
  const semitone = BLACK_SEMITONES[index]
  if (semitone !== null) CHROMATIC_BY_CODE.set(code, semitone)
})

/** Semitone offset for a key in the chromatic layout, or undefined. */
export function semitoneForCode(code: string): number | undefined {
  return CHROMATIC_BY_CODE.get(code)
}

// ---------------------------------------------------------------------------
// Labels for the on-screen keyboard
// ---------------------------------------------------------------------------

function buildLabels(source: Map<string, number>): Map<number, string[]> {
  const labels = new Map<number, string[]>()
  for (const [code, value] of source) {
    const existing = labels.get(value)
    if (existing) existing.push(KEY_LABELS[code])
    else labels.set(value, [KEY_LABELS[code]])
  }
  return labels
}

const EASY_LABELS = buildLabels(EASY_BY_CODE)
const CHROMATIC_LABELS = buildLabels(CHROMATIC_BY_CODE)

/** Keys that play scale degree `degree`; a degree may sit on both rows. */
export function labelsForDegree(degree: number): string[] {
  return EASY_LABELS.get(degree) ?? []
}

export function labelsForSemitone(semitone: number): string[] {
  return CHROMATIC_LABELS.get(semitone) ?? []
}

/** Pitch classes that are black keys on a piano. */
const BLACK_PITCH_CLASSES = new Set([1, 3, 6, 8, 10])

export function isBlackKey(midi: number): boolean {
  return BLACK_PITCH_CLASSES.has(((midi % 12) + 12) % 12)
}

// ---------------------------------------------------------------------------
// Everything that is not a note
// ---------------------------------------------------------------------------

/**
 * Transport and performance keys. None collide with either layout: the octave
 * keys sit on the row below the notes, where the left hand reaches them without
 * leaving home position, and chords take the number row.
 */
export const CONTROL_KEYS = {
  sustain: 'Space',
  octaveDown: 'KeyZ',
  octaveUp: 'KeyX',
  strikeChord: 'Enter',
  toggleAccompaniment: 'Backslash',
  panic: 'Escape',
} as const

/** Arrow-key aliases, for players who would rather not hunt for Z and X. */
export const ARROW_KEYS = {
  chordDown: 'ArrowLeft',
  chordUp: 'ArrowRight',
  octaveDown: 'ArrowDown',
  octaveUp: 'ArrowUp',
} as const

/** `Digit1`…`Digit7` pick chord degrees 1-7. Returns 0-6, or -1. */
export function chordIndexForCode(code: string): number {
  const match = /^Digit([1-7])$/.exec(code)
  return match ? Number(match[1]) - 1 : -1
}
