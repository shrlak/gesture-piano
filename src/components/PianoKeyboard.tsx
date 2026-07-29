import { KEYBOARD_SPAN, isBlackKey, labelsForSemitone } from '../lib/keymap'
import { noteName, solfaForMidi, type KeyDef } from '../lib/theory'
import { useKeyPointer } from './useKeyPointer'

interface Props {
  musicalKey: KeyDef
  /** MIDI note the leftmost key plays. */
  baseMidi: number
  activeNotes: Set<number>
  /** Pitch classes of the current key, marked so players stay in key. */
  scalePitchClasses: Set<number>
  /** Pitch classes of the chord sounding right now, highlighted as safe notes. */
  chordPitchClasses: Set<number>
  /** How far apart a soft and a hard press should sound. */
  sensitivity: number
  onNoteDown: (midi: number, velocity: number) => void
  onNoteUp: (midi: number) => void
}

interface KeyModel {
  semitone: number
  midi: number
  black: boolean
  labels: string[]
  /** Number of white keys to the left, used to place black keys. */
  whitesBefore: number
}

function buildKeys(baseMidi: number): { keys: KeyModel[]; whiteCount: number } {
  const keys: KeyModel[] = []
  let whitesBefore = 0
  for (let semitone = 0; semitone <= KEYBOARD_SPAN; semitone += 1) {
    const midi = baseMidi + semitone
    const black = isBlackKey(midi)
    keys.push({ semitone, midi, black, labels: labelsForSemitone(semitone), whitesBefore })
    if (!black) whitesBefore += 1
  }
  return { keys, whiteCount: whitesBefore }
}

/** The full chromatic keyboard, for players who want the accidentals. */
export function PianoKeyboard({
  musicalKey,
  baseMidi,
  activeNotes,
  scalePitchClasses,
  chordPitchClasses,
  sensitivity,
  onNoteDown,
  onNoteUp,
}: Props) {
  const { keys, whiteCount } = buildKeys(baseMidi)
  const whiteWidth = 100 / whiteCount
  const blackWidth = whiteWidth * 0.62
  const { keyHandlers } = useKeyPointer(onNoteDown, onNoteUp, sensitivity)

  const whites = keys.filter((key) => !key.black)
  const blacks = keys.filter((key) => key.black)

  return (
    <div className="rounded-3xl border border-white/10 bg-sanctuary-950 p-3 shadow-2xl shadow-black/50 sm:p-4">
      <div className="relative h-44 touch-none select-none sm:h-56">
        {/* White keys first; black keys are layered on top of them. */}
        <div className="flex h-full w-full gap-[2px]">
          {whites.map((key) => {
            const active = activeNotes.has(key.midi)
            const pitchClass = ((key.midi % 12) + 12) % 12
            const inChord = chordPitchClasses.has(pitchClass)
            const inScale = scalePitchClasses.has(pitchClass)
            const solfa = solfaForMidi(musicalKey, key.midi)
            return (
              <div
                key={key.midi}
                {...keyHandlers(key.midi)}
                className={[
                  'relative flex flex-1 cursor-pointer flex-col items-center justify-end gap-0.5 rounded-b-lg pb-2 transition-colors duration-75',
                  active
                    ? 'bg-glow-400 text-sanctuary-950'
                    : inChord
                      ? 'bg-mint-400/85 text-sanctuary-950 hover:bg-mint-400'
                      : inScale
                        ? 'bg-white text-sanctuary-900 hover:bg-white/80'
                        : 'bg-white/55 text-sanctuary-900/50 hover:bg-white/70',
                ].join(' ')}
              >
                <span className="text-sm font-bold">{solfa ?? ''}</span>
                <span className="text-[0.6rem] font-semibold opacity-45">
                  {noteName(pitchClass, musicalKey.useFlats)}
                  {Math.floor(key.midi / 12) - 1}
                </span>
                <span className="text-[0.7rem] font-bold tabular-nums sm:text-xs">
                  {key.labels[0] ?? ''}
                </span>
              </div>
            )
          })}
        </div>

        <div className="pointer-events-none absolute inset-0">
          {blacks.map((key) => {
            const active = activeNotes.has(key.midi)
            const pitchClass = ((key.midi % 12) + 12) % 12
            const inChord = chordPitchClasses.has(pitchClass)
            const inScale = scalePitchClasses.has(pitchClass)
            return (
              <div
                key={key.midi}
                {...keyHandlers(key.midi)}
                style={{
                  left: `${key.whitesBefore * whiteWidth - blackWidth / 2}%`,
                  width: `${blackWidth}%`,
                }}
                className={[
                  'pointer-events-auto absolute top-0 flex h-[62%] cursor-pointer flex-col items-center justify-end rounded-b-lg pb-1.5 transition-colors duration-75',
                  active
                    ? 'bg-glow-500 text-sanctuary-950'
                    : inChord
                      ? 'bg-mint-500 text-sanctuary-950 hover:bg-mint-400'
                      : inScale
                        ? 'bg-sanctuary-700 text-white/70 hover:bg-sanctuary-600'
                        : 'bg-sanctuary-900 text-white/40 hover:bg-sanctuary-800',
                ].join(' ')}
              >
                <span className="text-[0.65rem] font-bold tabular-nums">
                  {key.labels[0] ?? ''}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
