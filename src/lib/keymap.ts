// Computer keyboard → piano keys.
//
// Bindings are keyed by `KeyboardEvent.code` (physical key) rather than `.key`
// (produced character). With a Korean IME active `.key` comes back as Hangul
// jamo — "ㅋ" instead of "z" — which would break the whole layout. `.code` is
// immune to both the IME and the keyboard layout.
//
// The layout is the one every tracker and DAW uses: the bottom two rows are one
// octave, the top two rows are the octave above, so both hands sit naturally.

export interface KeyBinding {
  /** KeyboardEvent.code */
  code: string
  /** Semitones above the base note. */
  semitone: number
  /** What is printed on the physical key, for on-screen labels. */
  label: string
}

/** Bottom two rows: base octave. */
const LOWER_ROW: KeyBinding[] = [
  { code: 'KeyZ', semitone: 0, label: 'Z' },
  { code: 'KeyS', semitone: 1, label: 'S' },
  { code: 'KeyX', semitone: 2, label: 'X' },
  { code: 'KeyD', semitone: 3, label: 'D' },
  { code: 'KeyC', semitone: 4, label: 'C' },
  { code: 'KeyV', semitone: 5, label: 'V' },
  { code: 'KeyG', semitone: 6, label: 'G' },
  { code: 'KeyB', semitone: 7, label: 'B' },
  { code: 'KeyH', semitone: 8, label: 'H' },
  { code: 'KeyN', semitone: 9, label: 'N' },
  { code: 'KeyJ', semitone: 10, label: 'J' },
  { code: 'KeyM', semitone: 11, label: 'M' },
  { code: 'Comma', semitone: 12, label: ',' },
  { code: 'KeyL', semitone: 13, label: 'L' },
  { code: 'Period', semitone: 14, label: '.' },
  { code: 'Semicolon', semitone: 15, label: ';' },
  { code: 'Slash', semitone: 16, label: '/' },
]

/** Top two rows: one octave up. Overlaps the lower row from C, as on a tracker. */
const UPPER_ROW: KeyBinding[] = [
  { code: 'KeyQ', semitone: 12, label: 'Q' },
  { code: 'Digit2', semitone: 13, label: '2' },
  { code: 'KeyW', semitone: 14, label: 'W' },
  { code: 'Digit3', semitone: 15, label: '3' },
  { code: 'KeyE', semitone: 16, label: 'E' },
  { code: 'KeyR', semitone: 17, label: 'R' },
  { code: 'Digit5', semitone: 18, label: '5' },
  { code: 'KeyT', semitone: 19, label: 'T' },
  { code: 'Digit6', semitone: 20, label: '6' },
  { code: 'KeyY', semitone: 21, label: 'Y' },
  { code: 'Digit7', semitone: 22, label: '7' },
  { code: 'KeyU', semitone: 23, label: 'U' },
  { code: 'KeyI', semitone: 24, label: 'I' },
  { code: 'Digit9', semitone: 25, label: '9' },
  { code: 'KeyO', semitone: 26, label: 'O' },
  { code: 'Digit0', semitone: 27, label: '0' },
  { code: 'KeyP', semitone: 28, label: 'P' },
]

export const KEY_BINDINGS: KeyBinding[] = [...LOWER_ROW, ...UPPER_ROW]

/** Total span of the on-screen keyboard, in semitones above the base note. */
export const KEYBOARD_SPAN = 28

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

/** Transport and performance keys that are not part of the piano layout. */
export const CONTROL_KEYS = {
  sustain: 'Space',
  chordDown: 'ArrowLeft',
  chordUp: 'ArrowRight',
  octaveDown: 'ArrowDown',
  octaveUp: 'ArrowUp',
  strikeChord: 'Enter',
  toggleAccompaniment: 'Backslash',
  panic: 'Escape',
} as const
