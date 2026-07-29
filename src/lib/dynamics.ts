// How hard was that key pressed?
//
// A computer keyboard reports no force at all: every key is a bare on/off
// switch. So "playing hard" has to be inferred from what the browser *does*
// tell us, and each input device gives a different clue:
//
//   physical keys   how fast the notes are coming. Hammering a phrase out is
//                   playing hard; placing notes slowly is playing softly.
//                   Shift is an explicit accent for when that is not enough.
//   touch / pen     `PointerEvent.pressure` is a real force reading, so it is
//                   used directly where the hardware supplies it.
//   mouse           how far down the key the click landed, the way a MIDI
//                   keyboard turns key depth into velocity.
//
// The resulting 0-1 velocity drives loudness, brightness, and distortion in
// `audio.ts`, so the difference is heard three ways at once.

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** Softest and loudest a note can come out, whatever the input says. */
const MIN_VELOCITY = 0.14
const MAX_VELOCITY = 1

/** Notes landing closer together than this are one chord, not two strikes. */
const CHORD_WINDOW_MS = 28

/** A gap this short reads as a full-force strike… */
const FASTEST_GAP_MS = 90
/**
 * …and one this long as a note placed gently. Slow hymn playing lands near
 * here, so the soft end has to stay musical rather than trailing off to
 * nothing — a beginner picking out a melody one note at a time still needs to
 * be heard.
 */
const SLOWEST_GAP_MS = 650

/** Musical name for a velocity, shown next to the meter. */
export function dynamicLabel(velocity: number): string {
  if (velocity < 0.22) return 'pp'
  if (velocity < 0.36) return 'p'
  if (velocity < 0.5) return 'mp'
  if (velocity < 0.66) return 'mf'
  if (velocity < 0.84) return 'f'
  return 'ff'
}

/**
 * Turns a stream of keydowns into velocities. One instance per keyboard, kept
 * in a ref: it is stateful because a strike is only fast or slow relative to
 * the one before it.
 */
export class StrikeTracker {
  private lastAt = Number.NEGATIVE_INFINITY
  private lastVelocity = 0.55

  /**
   * @param now         `performance.now()` at the keydown.
   * @param accent      Shift held — an explicit "hit this one hard".
   * @param sensitivity 0-1 setting: how far apart soft and hard should be.
   */
  strike(now: number, options: { accent?: boolean; sensitivity?: number } = {}): number {
    const sensitivity = clamp(options.sensitivity ?? 0.6, 0, 1)
    const gap = now - this.lastAt

    // Keys pressed together are a chord grab, and a chord whose notes had
    // different velocities would sound broken. Reuse the first note's force.
    if (gap < CHORD_WINDOW_MS) {
      this.lastAt = now
      return this.lastVelocity
    }

    const speed = clamp((SLOWEST_GAP_MS - gap) / (SLOWEST_GAP_MS - FASTEST_GAP_MS), 0, 1)
    // Around mezzo-forte at a moderate pace, opening out as sensitivity rises.
    let velocity = 0.62 + (speed - 0.5) * (0.2 + sensitivity * 0.5)
    if (options.accent) velocity += 0.16 + sensitivity * 0.26

    velocity = clamp(velocity, MIN_VELOCITY, MAX_VELOCITY)
    this.lastAt = now
    this.lastVelocity = velocity
    return velocity
  }

  /** Forget the timing history, e.g. after the window loses focus. */
  reset() {
    this.lastAt = Number.NEGATIVE_INFINITY
  }
}

/**
 * Velocity for an on-screen key press. Touch and pen report real pressure, so
 * that leads; everything else falls back to how far down the key was struck.
 */
export function pointerVelocity(
  event: { clientY: number; pressure: number; pointerType: string },
  bounds: { top: number; height: number },
  sensitivity = 0.6,
): number {
  const sense = clamp(sensitivity, 0, 1)
  const depth = clamp((event.clientY - bounds.top) / Math.max(1, bounds.height), 0, 1)

  // A mouse always reports 0.5, and pen/touch report 0 when the hardware has no
  // force sensor — in both cases the reading carries no information.
  const hasForce = event.pointerType !== 'mouse' && event.pressure > 0 && event.pressure !== 0.5
  const strength = hasForce ? event.pressure * 0.7 + depth * 0.3 : depth

  return clamp(0.58 + (strength - 0.5) * (0.25 + sense * 0.7), MIN_VELOCITY, MAX_VELOCITY)
}
