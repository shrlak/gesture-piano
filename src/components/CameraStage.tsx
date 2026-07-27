import { useEffect, useRef } from 'react'
import type { SmoothedHand } from '../lib/gestures'

/** Shared mutable frame state, written by the tracking loop and read by the canvas. */
export interface Scene {
  hands: SmoothedHand[]
  /** Index of the highlighted chord zone, 0-6. */
  chordZone: number
  /** Index of the melody rung currently sounding, -1 when silent. */
  melodyStep: number
  melodyActive: boolean
  /** Beat within the bar, for the pulse ring. */
  beatInBar: number
  beatsPerBar: number
  intensity: number
}

const HAND_CONNECTIONS: Array<[number, number]> = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [0, 5],
  [5, 6],
  [6, 7],
  [7, 8],
  [5, 9],
  [9, 10],
  [10, 11],
  [11, 12],
  [9, 13],
  [13, 14],
  [14, 15],
  [15, 16],
  [13, 17],
  [17, 18],
  [18, 19],
  [19, 20],
  [0, 17],
]

interface Props {
  setVideo: (element: HTMLVideoElement | null) => void
  sceneRef: React.RefObject<Scene>
  /** Fraction of the frame width given to the chord region. */
  split: number
  chordLabels: string[]
  melodyLabels: string[]
  mirror: boolean
  active: boolean
}

export function CameraStage({
  setVideo,
  sceneRef,
  split,
  chordLabels,
  melodyLabels,
  mirror,
  active,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)

  // Props the draw loop needs, mirrored into refs so the loop never restarts.
  const configRef = useRef({ split, chordLabels, melodyLabels, mirror })
  configRef.current = { split, chordLabels, melodyLabels, mirror }

  useEffect(() => {
    let rafId = 0

    const draw = () => {
      rafId = requestAnimationFrame(draw)
      const canvas = canvasRef.current
      const video = videoRef.current
      const scene = sceneRef.current
      if (!canvas || !scene) return

      const rect = canvas.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      if (canvas.width !== Math.round(rect.width * dpr)) {
        canvas.width = Math.round(rect.width * dpr)
        canvas.height = Math.round(rect.height * dpr)
      }

      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, rect.width, rect.height)

      // The video is object-cover, so replicate that crop here — otherwise the
      // drawn zones drift away from where the hand actually appears.
      const vw = video?.videoWidth || 16
      const vh = video?.videoHeight || 9
      const scale = Math.max(rect.width / vw, rect.height / vh)
      const dispW = vw * scale
      const dispH = vh * scale
      const offsetX = (rect.width - dispW) / 2
      const offsetY = (rect.height - dispH) / 2

      const toX = (normalized: number) => offsetX + normalized * dispW
      const toY = (normalized: number) => offsetY + normalized * dispH

      const {
        split: splitRatio,
        chordLabels: chords,
        melodyLabels: melody,
        mirror: mirrored,
      } = configRef.current

      drawChordZones(ctx, scene, chords, splitRatio, toX, toY, dispH, offsetY)
      drawMelodyLadder(ctx, scene, melody, splitRatio, toX, toY, dispW, offsetX)
      drawSplit(ctx, toX(splitRatio), offsetY, dispH)
      for (const hand of scene.hands) drawHand(ctx, hand, splitRatio, toX, toY, mirrored)
    }

    draw()
    return () => cancelAnimationFrame(rafId)
  }, [sceneRef])

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-3xl border border-white/10 bg-sanctuary-950 shadow-2xl shadow-black/50">
      <video
        ref={(element) => {
          videoRef.current = element
          setVideo(element)
        }}
        className="absolute inset-0 h-full w-full object-cover"
        style={{
          transform: mirror ? 'scaleX(-1)' : undefined,
          opacity: active ? 0.62 : 0,
        }}
        playsInline
        muted
      />
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      {!active && (
        <div className="absolute inset-0 grid place-items-center px-6 text-center">
          <div className="max-w-md space-y-2">
            <p className="text-4xl">🙌</p>
            <p className="text-lg font-semibold text-white">카메라가 꺼져 있습니다</p>
            <p className="text-sm text-white/60">
              아래 <span className="text-glow-400">연주 시작</span> 을 누르면 손 인식이
              시작됩니다. 카메라 없이 키보드로도 연주할 수 있어요.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

type Mapper = (value: number) => number

function drawChordZones(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  labels: string[],
  split: number,
  toX: Mapper,
  toY: Mapper,
  dispH: number,
  offsetY: number,
) {
  const count = labels.length
  const zoneWidth = split / count

  for (let i = 0; i < count; i += 1) {
    const x0 = toX(i * zoneWidth)
    const x1 = toX((i + 1) * zoneWidth)
    const isActive = i === scene.chordZone

    const gradient = ctx.createLinearGradient(0, offsetY, 0, offsetY + dispH)
    if (isActive) {
      gradient.addColorStop(0, 'rgba(244, 200, 106, 0.30)')
      gradient.addColorStop(1, 'rgba(244, 200, 106, 0.05)')
    } else {
      gradient.addColorStop(0, 'rgba(255, 255, 255, 0.06)')
      gradient.addColorStop(1, 'rgba(255, 255, 255, 0.01)')
    }
    ctx.fillStyle = gradient
    ctx.fillRect(x0 + 2, offsetY, x1 - x0 - 4, dispH)

    ctx.strokeStyle = isActive ? 'rgba(244, 200, 106, 0.85)' : 'rgba(255,255,255,0.12)'
    ctx.lineWidth = isActive ? 2 : 1
    ctx.strokeRect(x0 + 2, offsetY + 1, x1 - x0 - 4, dispH - 2)

    ctx.save()
    ctx.textAlign = 'center'
    ctx.fillStyle = isActive ? '#f4c86a' : 'rgba(255,255,255,0.55)'
    // Chord symbols run long ("F#madd9"), so shrink them to fit their column
    // rather than letting neighbouring zones collide.
    const weight = isActive ? 700 : 500
    const room = x1 - x0 - 10
    let size = isActive ? 22 : 17
    ctx.font = `${weight} ${size}px system-ui, sans-serif`
    while (size > 9 && ctx.measureText(labels[i]).width > room) {
      size -= 1
      ctx.font = `${weight} ${size}px system-ui, sans-serif`
    }
    ctx.fillText(labels[i], (x0 + x1) / 2, offsetY + dispH - 24)
    ctx.font = '500 12px system-ui, sans-serif'
    ctx.fillStyle = 'rgba(255,255,255,0.4)'
    ctx.fillText(String(i + 1), (x0 + x1) / 2, offsetY + dispH - 8)
    ctx.restore()
  }

  // Dynamics rail: the higher the chord hand, the louder the accompaniment.
  const railX = toX(0.012)
  ctx.strokeStyle = 'rgba(255,255,255,0.18)'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(railX, offsetY + dispH * 0.1)
  ctx.lineTo(railX, offsetY + dispH * 0.9)
  ctx.stroke()
  ctx.strokeStyle = '#6fe3c4'
  ctx.beginPath()
  ctx.moveTo(railX, offsetY + dispH * 0.9)
  ctx.lineTo(railX, offsetY + dispH * (0.9 - 0.8 * scene.intensity))
  ctx.stroke()

  // Beat pulse, so the player can catch the tempo without watching the panel.
  if (scene.beatsPerBar > 0) {
    const dotY = toY(0.055)
    const spacing = 20
    const startX = toX(split / 2) - ((scene.beatsPerBar - 1) * spacing) / 2
    for (let beat = 0; beat < scene.beatsPerBar; beat += 1) {
      const isCurrent = beat === scene.beatInBar
      ctx.beginPath()
      ctx.arc(startX + beat * spacing, dotY, isCurrent ? 6 : 3.5, 0, Math.PI * 2)
      ctx.fillStyle = isCurrent
        ? beat === 0
          ? '#f4c86a'
          : '#ece9ff'
        : 'rgba(255,255,255,0.25)'
      ctx.fill()
    }
  }
}

function drawMelodyLadder(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  labels: string[],
  split: number,
  toX: Mapper,
  toY: Mapper,
  dispW: number,
  offsetX: number,
) {
  const count = labels.length
  const left = toX(split)
  const right = offsetX + dispW
  const rungHeight = 1 / count

  for (let i = 0; i < count; i += 1) {
    // Rung 0 is the lowest note, so draw from the bottom up.
    const fromTop = count - 1 - i
    const y0 = toY(fromTop * rungHeight)
    const y1 = toY((fromTop + 1) * rungHeight)
    const isActive = i === scene.melodyStep

    ctx.fillStyle = isActive
      ? scene.melodyActive
        ? 'rgba(111, 227, 196, 0.32)'
        : 'rgba(111, 227, 196, 0.14)'
      : i % 2 === 0
        ? 'rgba(255,255,255,0.05)'
        : 'rgba(255,255,255,0.02)'
    ctx.fillRect(left + 2, y0 + 1, right - left - 4, y1 - y0 - 2)

    ctx.save()
    ctx.textAlign = 'right'
    ctx.font = `${isActive ? 700 : 500} ${isActive ? 16 : 13}px system-ui, sans-serif`
    ctx.fillStyle = isActive ? '#6fe3c4' : 'rgba(255,255,255,0.45)'
    ctx.fillText(labels[i], right - 12, (y0 + y1) / 2 + 5)
    ctx.restore()
  }

  ctx.save()
  ctx.textAlign = 'left'
  ctx.font = '600 12px system-ui, sans-serif'
  ctx.fillStyle = 'rgba(255,255,255,0.4)'
  ctx.fillText('멜로디', left + 12, toY(0.045))
  ctx.restore()
}

function drawSplit(ctx: CanvasRenderingContext2D, x: number, offsetY: number, dispH: number) {
  ctx.save()
  ctx.setLineDash([6, 8])
  ctx.strokeStyle = 'rgba(255,255,255,0.28)'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(x, offsetY)
  ctx.lineTo(x, offsetY + dispH)
  ctx.stroke()
  ctx.restore()
}

function drawHand(
  ctx: CanvasRenderingContext2D,
  hand: SmoothedHand,
  split: number,
  toX: Mapper,
  toY: Mapper,
  mirror: boolean,
) {
  const isChordHand = hand.x < split
  const color = isChordHand ? '#f4c86a' : '#6fe3c4'

  // Landmarks are raw video-space; the palm centre was already mirrored during
  // feature extraction, so apply the same flip here to keep them together.
  const px = (index: number) => {
    const x = hand.landmarks[index].x
    return toX(mirror ? 1 - x : x)
  }
  const py = (index: number) => toY(hand.landmarks[index].y)

  ctx.save()
  ctx.strokeStyle = color
  ctx.globalAlpha = 0.55
  ctx.lineWidth = 2.5
  ctx.lineCap = 'round'
  for (const [from, to] of HAND_CONNECTIONS) {
    ctx.beginPath()
    ctx.moveTo(px(from), py(from))
    ctx.lineTo(px(to), py(to))
    ctx.stroke()
  }

  ctx.globalAlpha = 0.9
  ctx.fillStyle = color
  for (let i = 0; i < hand.landmarks.length; i += 1) {
    ctx.beginPath()
    ctx.arc(px(i), py(i), 3, 0, Math.PI * 2)
    ctx.fill()
  }

  // Pinch marker: the ring closes as the fingertips meet, and fills on contact.
  const thumb = { x: px(4), y: py(4) }
  const index = { x: px(8), y: py(8) }
  const midX = (thumb.x + index.x) / 2
  const midY = (thumb.y + index.y) / 2
  const radius = Math.max(8, Math.hypot(thumb.x - index.x, thumb.y - index.y) / 2)
  ctx.globalAlpha = 1
  ctx.beginPath()
  ctx.arc(midX, midY, radius, 0, Math.PI * 2)
  ctx.strokeStyle = hand.pinched ? color : 'rgba(255,255,255,0.5)'
  ctx.lineWidth = hand.pinched ? 4 : 2
  ctx.stroke()
  if (hand.pinched) {
    ctx.globalAlpha = 0.35
    ctx.fillStyle = color
    ctx.fill()
  }

  if (hand.fist) {
    ctx.globalAlpha = 1
    ctx.fillStyle = '#ff8a8a'
    ctx.font = '700 14px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('정지', midX, midY - radius - 10)
  }
  ctx.restore()
}
