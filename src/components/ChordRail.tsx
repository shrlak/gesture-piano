import type { Chord } from '../lib/theory'

interface Props {
  chords: Chord[]
  activeIndex: number
  /** Index the progression guide says is coming next, or -1. */
  nextIndex: number
  onSelect: (index: number) => void
}

/**
 * The seven chords of the key, laid out in the same order as the on-camera
 * zones so the screen and the air above the desk agree with each other.
 * Doubles as the mouse/touch fallback when the camera is off.
 */
export function ChordRail({ chords, activeIndex, nextIndex, onSelect }: Props) {
  return (
    <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
      {chords.map((chord, index) => {
        const isActive = index === activeIndex
        const isNext = index === nextIndex && !isActive
        return (
          <button
            key={chord.numeral}
            type="button"
            onPointerDown={() => onSelect(index)}
            aria-pressed={isActive}
            className={[
              'group relative flex flex-col items-center gap-0.5 rounded-2xl border px-2 py-3 transition',
              isActive
                ? 'border-glow-400 bg-glow-400/15 shadow-lg shadow-glow-600/20'
                : isNext
                  ? 'border-mint-400/60 bg-mint-400/10'
                  : 'border-white/10 bg-white/5 hover:border-white/25 hover:bg-white/10',
            ].join(' ')}
          >
            <span className="text-[0.65rem] font-medium tracking-widest text-white/40">
              {index + 1} · {chord.numeral}
            </span>
            <span
              className={[
                'text-xl font-bold tabular-nums',
                isActive ? 'text-glow-400' : 'text-white',
              ].join(' ')}
            >
              {chord.symbol}
            </span>
            <span className="text-[0.65rem] text-white/40">{chord.functionName}</span>
          </button>
        )
      })}
    </div>
  )
}
