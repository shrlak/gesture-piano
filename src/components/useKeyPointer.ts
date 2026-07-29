import { useCallback, useRef } from 'react'
import { pointerVelocity } from '../lib/dynamics'

/**
 * Mouse and touch handling shared by both on-screen keyboards. Tracks the note
 * each pointer is sounding so that dragging across the keys glides from one
 * note to the next instead of leaving a trail of stuck notes behind.
 *
 * Presses also carry a velocity: touch and pen use the real pressure reading,
 * and everything else uses how far down the key the press landed, so the
 * on-screen keyboard is as dynamic as the physical one.
 */
export function useKeyPointer(
  onNoteDown: (midi: number, velocity: number) => void,
  onNoteUp: (midi: number) => void,
  sensitivity = 0.6,
) {
  const pointerNote = useRef(new Map<number, number>())
  // Read inside the handlers so a sensitivity change never re-binds the keys.
  const sensitivityRef = useRef(sensitivity)
  sensitivityRef.current = sensitivity

  const press = useCallback(
    (event: React.PointerEvent, midi: number) => {
      const previous = pointerNote.current.get(event.pointerId)
      if (previous === midi) return
      if (previous !== undefined) onNoteUp(previous)
      pointerNote.current.set(event.pointerId, midi)

      const bounds = event.currentTarget.getBoundingClientRect()
      onNoteDown(midi, pointerVelocity(event, bounds, sensitivityRef.current))
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

  const keyHandlers = useCallback(
    (midi: number) => ({
      onPointerDown: (event: React.PointerEvent) => {
        event.preventDefault()
        press(event, midi)
      },
      onPointerEnter: (event: React.PointerEvent) => {
        if (event.buttons === 1) press(event, midi)
      },
      onPointerUp: (event: React.PointerEvent) => lift(event.pointerId),
      onPointerCancel: (event: React.PointerEvent) => lift(event.pointerId),
      onPointerLeave: (event: React.PointerEvent) => {
        if (event.buttons === 1) lift(event.pointerId)
      },
    }),
    [press, lift],
  )

  return { keyHandlers }
}
