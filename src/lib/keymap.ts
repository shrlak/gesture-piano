// Computer keyboard → piano keys.
//
// Bindings are keyed by `KeyboardEvent.code` (physical key) rather than `.key`
// (produced character). With a Korean IME active `.key` comes back as Hangul
// jamo — "ㅋ" instead of "z" — which would break the whole layout. `.code` is
// immune to both the IME and the keyboard layout.
//
// The layout sits entirely on the two alphabet rows under the resting hands:
// the home row is the white keys, and the row above it holds the black keys,
// physically above and between their neighbours exactly like a real piano.
// Nothing reaches for the number row, so the hands never leave home position.
//
//   black:   W E     T Y U     O P
//   white:  A S D F G H J K L ;

export interface KeyBinding {
  /** KeyboardEvent.code */
  code: string
  /** Semitones above the base note. */
  semitone: number
  /** What is printed on the physical key, for on-screen labels. */
  label: string
}

/** Home row: the white keys, C through E an octave and a half up. */
const WHITE_ROW: KeyBinding[] = [
  { code: 'KeyA', semitone: 0, label: 'A' }, // C
  { code: 'KeyS', semitone: 2, label: 'S' }, // D
  { code: 'KeyD', semitone: 4, label: 'D' }, // E
  { code: 'KeyF', semitone: 5, label: 'F' }, // F
  { code: 'KeyG', semitone: 7, label: 'G' }, // G
  { code: 'KeyH', semitone: 9, label: 'H' }, // A
  { code: 'KeyJ', semitone: 11, label: 'J' }, // B
  { code: 'KeyK', semitone: 12, label: 'K' }, // C
  { code: 'KeyL', semitone: 14, label: 'L' }, // D
  { code: 'Semicolon', semitone: 16, label: ';' }, // E
]

/**
 * Top row: the black keys. Q, R and I are deliberately unbound — they sit above
 * E–F and B–C, where a piano has no black key either.
 */
const BLACK_ROW: KeyBinding[] = [
  { code: 'KeyW', semitone: 1, label: 'W' }, // C#
  { code: 'KeyE', semitone: 3, label: 'E' }, // D#
  { code: 'KeyT', semitone: 6, label: 'T' }, // F#
  { code: 'KeyY', semitone: 8, label: 'Y' }, // G#
  { code: 'KeyU', semitone: 10, label: 'U' }, // A#
  { code: 'KeyO', semitone: 13, label: 'O' }, // C#
  { code: 'KeyP', semitone: 15, label: 'P' }, // D#
]

export const KEY_BINDINGS: KeyBinding[] = [...WHITE_ROW, ...BLACK_ROW]

/** Total span of the on-screen keyboard, in semitones above the base note. */
export const KEYBOARD_SPAN = 16

const BY_CODE = new Map(KEY_BINDINGS.map((binding) => [binding.code, binding.semitone]))

export function semitoneForCode(code: string): number | undefined {
  return BY_CODE.get(code)
}

/**
 * Labels shown on each on-screen key. Notes reachable from both rows list both
 * keys, since either one works and players use whichever hand is free.
 */
const LABELS_BY_SEMITONE = new Map<number, string[]>()
for (const binding of KEY_BINDINGS) {
  const existing = LABELS_BY_SEMITONE.get(binding.semitone)
  if (existing) existing.push(binding.label)
  else LABELS_BY_SEMITONE.set(binding.semitone, [binding.label])
}

export function labelsForSemitone(semitone: number): string[] {
  return LABELS_BY_SEMITONE.get(semitone) ?? []
}

/** Pitch classes that are black keys on a piano. */
const BLACK_PITCH_CLASSES = new Set([1, 3, 6, 8, 10])

export function isBlackKey(midi: number): boolean {
  return BLACK_PITCH_CLASSES.has(((midi % 12) + 12) % 12)
}

/**
 * Transport and performance keys. None of these collide with the piano layout:
 * the octave keys sit on the row *below* the keyboard, where the left hand can
 * reach them without leaving home position, and the chord keys take the number
 * row that the two-row layout no longer needs.
 */
export const CONTROL_KEYS = {
  sustain: 'Space',
  /** Dedicated octave keys, one row below the white keys. */
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
