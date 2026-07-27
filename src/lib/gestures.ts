// Turns MediaPipe hand landmarks into the handful of musical signals the app
// actually reacts to: where the palm is, how open the hand is, and whether the
// thumb and index finger are pinched.
//
// Roles are assigned by *screen region*, not by MediaPipe's handedness label.
// Handedness flips depending on whether the camera feed is mirrored, and it
// occasionally swaps mid-session; screen position never lies, and it lets one
// hand cover both jobs when you only have one free.

export interface Landmark {
  x: number
  y: number
  z: number
}

export const LANDMARK = {
  wrist: 0,
  thumbTip: 4,
  indexMcp: 5,
  indexPip: 6,
  indexTip: 8,
  middleMcp: 9,
  middlePip: 10,
  middleTip: 12,
  ringMcp: 13,
  ringPip: 14,
  ringTip: 16,
  pinkyMcp: 17,
  pinkyPip: 18,
  pinkyTip: 20,
} as const

function distance(a: Landmark, b: Landmark): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

export interface HandFeatures {
  /** Palm centre, normalised to the video frame, already mirrored for display. */
  x: number
  y: number
  /** 0 = fingertips touching, 1 = wide apart. */
  pinchDistance: number
  /** 0 = fist, 1 = fully splayed. */
  openness: number
  extendedFingers: number
  landmarks: Landmark[]
}

/**
 * Reads one hand. `mirror` flips x so the on-screen hand moves the same
 * direction the player's real hand does.
 */
export function readHand(landmarks: Landmark[], mirror: boolean): HandFeatures | null {
  if (landmarks.length < 21) return null

  const wrist = landmarks[LANDMARK.wrist]
  const middleMcp = landmarks[LANDMARK.middleMcp]

  // Palm width is the scale reference: it barely changes as fingers move, so
  // distances measured against it are independent of how far away the hand is.
  const palmSize = Math.max(0.02, distance(wrist, middleMcp))

  const palmPoints = [
    LANDMARK.wrist,
    LANDMARK.indexMcp,
    LANDMARK.middleMcp,
    LANDMARK.ringMcp,
    LANDMARK.pinkyMcp,
  ].map((index) => landmarks[index])

  const cx = palmPoints.reduce((sum, point) => sum + point.x, 0) / palmPoints.length
  const cy = palmPoints.reduce((sum, point) => sum + point.y, 0) / palmPoints.length

  const pinchDistance =
    distance(landmarks[LANDMARK.thumbTip], landmarks[LANDMARK.indexTip]) / palmSize

  // A finger counts as extended when its tip is further from the wrist than its
  // middle joint — robust to hand rotation, unlike comparing raw y values.
  const fingers: Array<[number, number]> = [
    [LANDMARK.indexTip, LANDMARK.indexPip],
    [LANDMARK.middleTip, LANDMARK.middlePip],
    [LANDMARK.ringTip, LANDMARK.ringPip],
    [LANDMARK.pinkyTip, LANDMARK.pinkyPip],
  ]
  let extendedFingers = 0
  let reach = 0
  for (const [tip, pip] of fingers) {
    const tipReach = distance(landmarks[tip], wrist) / palmSize
    const pipReach = distance(landmarks[pip], wrist) / palmSize
    if (tipReach > pipReach * 1.12) extendedFingers += 1
    reach += tipReach
  }

  // Averaged fingertip reach maps to roughly 1.1 (closed) .. 2.2 (splayed).
  const openness = Math.min(1, Math.max(0, (reach / fingers.length - 1.15) / 1.0))

  return {
    x: mirror ? 1 - cx : cx,
    y: cy,
    pinchDistance,
    openness,
    extendedFingers,
    landmarks,
  }
}

/** Pinch has to latch: a single threshold chatters and machine-guns notes. */
const PINCH_CLOSE = 0.55
const PINCH_OPEN = 0.78

export interface SmoothedHand extends HandFeatures {
  id: number
  pinched: boolean
  /** True only on the frame the pinch closed — use it to trigger notes. */
  pinchStarted: boolean
  /** True only on the frame the pinch opened. */
  pinchEnded: boolean
  fist: boolean
}

/**
 * Exponential smoothing plus pinch latching, kept per tracked hand slot.
 * Raw landmarks jitter by a couple of pixels every frame; unsmoothed, that
 * jitter is audible as wobbling chord selection.
 */
export class HandFilter {
  private x = 0
  private y = 0
  private openness = 0
  private pinchDistance = 1
  private pinched = false
  private seen = false
  readonly id: number

  constructor(id: number) {
    this.id = id
  }

  reset() {
    this.seen = false
    this.pinched = false
  }

  update(features: HandFeatures, smoothing = 0.45): SmoothedHand {
    if (!this.seen) {
      this.x = features.x
      this.y = features.y
      this.openness = features.openness
      this.pinchDistance = features.pinchDistance
      this.seen = true
    } else {
      this.x += (features.x - this.x) * smoothing
      this.y += (features.y - this.y) * smoothing
      this.openness += (features.openness - this.openness) * smoothing
      // Pinch reacts faster than position: latency here is felt as note lag.
      this.pinchDistance += (features.pinchDistance - this.pinchDistance) * 0.65
    }

    const wasPinched = this.pinched
    if (this.pinched) {
      if (this.pinchDistance > PINCH_OPEN) this.pinched = false
    } else if (this.pinchDistance < PINCH_CLOSE) {
      this.pinched = true
    }

    return {
      ...features,
      id: this.id,
      x: this.x,
      y: this.y,
      openness: this.openness,
      pinchDistance: this.pinchDistance,
      pinched: this.pinched,
      pinchStarted: this.pinched && !wasPinched,
      pinchEnded: !this.pinched && wasPinched,
      fist: features.extendedFingers === 0 && this.openness < 0.22,
    }
  }
}

/**
 * Which zone a hand is playing. Anything left of `split` drives harmony,
 * anything right of it drives melody.
 */
export type HandRole = 'chord' | 'melody'

export function roleForHand(x: number, split: number): HandRole {
  return x < split ? 'chord' : 'melody'
}

/**
 * Maps a position inside a region to one of `count` slots, with a dead band at
 * each boundary so a hand resting on the line does not flicker between slots.
 */
export function quantizeZone(
  position: number,
  count: number,
  current: number,
  deadband = 0.12,
): number {
  const raw = Math.min(count - 1, Math.max(0, Math.floor(position * count)))
  if (raw === current) return current

  // Only accept a change once the hand is meaningfully inside the new slot.
  const slotWidth = 1 / count
  const withinSlot = (position - raw * slotWidth) / slotWidth
  if (withinSlot < deadband || withinSlot > 1 - deadband) return current
  return raw
}
