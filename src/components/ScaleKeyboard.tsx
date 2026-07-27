import { EASY_MAX_DEGREE, labelsForDegree } from '../lib/keymap'
import { degreeToMidi, noteName, solfaForDegree, type KeyDef } from '../lib/theory'
import { useKeyPointer } from './useKeyPointer'

interface Props {
  musicalKey: KeyDef
  /** MIDI note the tonic sits on. */
  baseMidi: number
  activeNotes: Set<number>
  /** Pitch classes of the chord sounding right now, highlighted as safe notes. */
  chordPitchClasses: Set<number>
  onNoteDown: (midi: number) => void
  onNoteUp: (midi: number) => void
}

/**
 * The easy keyboard: one key per scale degree, so there is no such thing as a
 * wrong note. Degree 0 is always 도 regardless of which key is selected, which
 * means one set of fingerings works everywhere.
 */
export function ScaleKeyboard({
  musicalKey,
  baseMidi,
  activeNotes,
  chordPitchClasses,
  onNoteDown,
  onNoteUp,
}: Props) {
  const { keyHandlers } = useKeyPointer(onNoteDown, onNoteUp)

  const degrees = Array.from({ length: EASY_MAX_DEGREE + 1 }, (_, degree) => degree)

  return (
    <div className="rounded-3xl border border-white/10 bg-sanctuary-950 p-3 shadow-2xl shadow-black/50 sm:p-4">
      <div className="flex h-44 touch-none gap-[3px] select-none sm:h-56">
        {degrees.map((degree) => {
          const midi = degreeToMidi(musicalKey, baseMidi, degree)
          const active = activeNotes.has(midi)
          const inChord = chordPitchClasses.has(((midi % 12) + 12) % 12)
          const isTonic = degree % 7 === 0
          const labels = labelsForDegree(degree)

          return (
            <div
              key={degree}
              {...keyHandlers(midi)}
              className={[
                'relative flex flex-1 cursor-pointer flex-col items-center justify-end gap-0.5 rounded-b-xl pb-2 transition-colors duration-75',
                active
                  ? 'bg-glow-400 text-sanctuary-950'
                  : inChord
                    ? 'bg-mint-400/85 text-sanctuary-950 hover:bg-mint-400'
                    : 'bg-white text-sanctuary-900 hover:bg-white/80',
              ].join(' ')}
            >
              {/* The tonic gets a bar across the top so octaves are findable. */}
              {isTonic && (
                <span className="absolute inset-x-0 top-0 h-1.5 rounded-b bg-glow-600/70" />
              )}
              <span className="text-base font-black sm:text-lg">{solfaForDegree(degree)}</span>
              <span className="text-[0.6rem] font-semibold opacity-45">
                {noteName(midi % 12, musicalKey.useFlats)}
                {Math.floor(midi / 12) - 1}
              </span>
              {/* Degrees reachable from both rows show both keys, as separate
                  chips so "K Q" never reads as one word. */}
              <span className="mt-0.5 flex gap-0.5">
                {labels.map((label) => (
                  <span
                    key={label}
                    className="rounded bg-sanctuary-950/15 px-1.5 py-0.5 text-[0.7rem] font-bold tabular-nums"
                  >
                    {label}
                  </span>
                ))}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
