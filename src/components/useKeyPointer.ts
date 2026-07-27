import { useCallback, useRef } from 'react'

/**
 * Mouse and touch handling shared by both on-screen keyboards. Tracks the note
 * each pointer is sounding so that dragging across the keys glides from one
 * note to the next instead of leaving a trail of stuck notes behind.
 */
export function useKeyPointer(
  onNoteDown: (midi: number) => void,
  onNoteUp: (midi: number) => void,
) {
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

  const keyHandlers = useCallback(
    (midi: number) => ({
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
    }),
    [press, lift],
  )

  return { keyHandlers }
}
