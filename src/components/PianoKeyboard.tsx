import { useCallback, useRef } from 'react'
import { KEYBOARD_SPAN, isBlackKey, labelsForSemitone } from '../lib/keymap'
import { noteName } from '../lib/theory'

interface Props {
  /** MIDI note the leftmost key plays. */
  baseMidi: number
  activeNotes: Set<number>
  /** Pitch classes of the current key, marked so players stay in key. */
  scalePitchClasses: Set<number>
  useFlats: boolean
  onNoteDown: (midi: number) => void
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

export function PianoKeyboard({
  baseMidi,
  activeNotes,
  scalePitchClasses,
  useFlats,
  onNoteDown,
  onNoteUp,
}: Props) {
  const { keys, whiteCount } = buildKeys(baseMidi)
  const whiteWidth = 100 / whiteCount
  const blackWidth = whiteWidth * 0.62

  // Which note this pointer is currently sounding, so dragging across the
  // keyboard glides instead of piling up stuck notes.
  const pointerNote = useRef(new Map<number, number>())

  const press = useCallback(
    (pointerId: number, midi: number) => {
      const previous = pointerNote.current.get(pointerId)
      if (previous === midi) return
      if (previous !== undefined) onNoteUp(previous)
      pointerNote.current.set(pointerId, midi)
      onNoteDown(midi)
    },
    [onNoteDown, onNoteUp],
  )

  const lift = useCallback(
    (pointerId: number) => {
      const previous = pointerNote.current.get(pointerId)
      if (previous === undefined) return
      pointerNote.current.delete(pointerId)
      onNoteUp(previous)
    },
    [onNoteUp],
  )

  const keyHandlers = (midi: number) => ({
    onPointerDown: (event: React.PointerEvent) => {
      event.preventDefault()
      press(event.pointerId, midi)
    },
    onPointerEnter: (event: React.PointerEvent) => {
      if (event.buttons === 1) press(event.pointerId, midi)
    },
    onPointerUp: (event: React.PointerEvent) => lift(event.pointerId),
    onPointerCancel: (event: React.PointerEvent) => lift(event.pointerId),
    onPointerLeave: (event: React.PointerEvent) => {
      if (event.buttons === 1) lift(event.pointerId)
    },
  })

  const whites = keys.filter((key) => !key.black)
  const blacks = keys.filter((key) => key.black)

  return (
    <div className="rounded-3xl border border-white/10 bg-sanctuary-950 p-3 shadow-2xl shadow-black/50 sm:p-4">
      <div className="relative h-44 touch-none select-none sm:h-56">
        {/* White keys first; black keys are layered on top of them. */}
        <div className="flex h-full w-full gap-[2px]">
          {whites.map((key) => {
            const active = activeNotes.has(key.midi)
            const inScale = scalePitchClasses.has(((key.midi % 12) + 12) % 12)
            const isC = key.midi % 12 === 0
            return (
              <div
                key={key.midi}
                {...keyHandlers(key.midi)}
                className={[
                  'relative flex flex-1 cursor-pointer flex-col items-center justify-end rounded-b-lg pb-2 transition-colors duration-75',
                  active
                    ? 'bg-glow-400 text-sanctuary-950'
                    : inScale
                      ? 'bg-white text-sanctuary-900 hover:bg-glow-400/40'
                      : 'bg-white/70 text-sanctuary-900/60 hover:bg-white/85',
                ].join(' ')}
              >
                {/* In-key notes get a dot, so worship players can stay diatonic. */}
                {inScale && !active && (
                  <span className="absolute top-2 h-1.5 w-1.5 rounded-full bg-glow-500/60" />
                )}
                <span className="text-[0.6rem] font-semibold opacity-45">
                  {isC
                    ? `${noteName(key.midi % 12, useFlats)}${Math.floor(key.midi / 12) - 1}`
                    : ''}
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
            const inScale = scalePitchClasses.has(((key.midi % 12) + 12) % 12)
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
