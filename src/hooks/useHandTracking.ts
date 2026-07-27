import { useCallback, useEffect, useRef, useState } from 'react'
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision'
import { HandFilter, readHand, type SmoothedHand } from '../lib/gestures'

export type TrackingStatus = 'idle' | 'loading' | 'running' | 'error'

const LOCAL_WASM = '/mediapipe/wasm'
const CDN_WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/wasm'
const LOCAL_MODEL = '/models/hand_landmarker.task'
const CDN_MODEL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'

/** True when the URL serves a real file, so we can prefer self-hosted assets. */
async function isReachable(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: 'HEAD' })
    return response.ok
  } catch {
    return false
  }
}

async function createLandmarker(): Promise<HandLandmarker> {
  const wasmPath = (await isReachable(`${LOCAL_WASM}/vision_wasm_internal.wasm`))
    ? LOCAL_WASM
    : CDN_WASM
  const modelPath = (await isReachable(LOCAL_MODEL)) ? LOCAL_MODEL : CDN_MODEL

  const fileset = await FilesetResolver.forVisionTasks(wasmPath)
  return HandLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: modelPath, delegate: 'GPU' },
    runningMode: 'VIDEO',
    numHands: 2,
    minHandDetectionConfidence: 0.6,
    minHandPresenceConfidence: 0.6,
    minTrackingConfidence: 0.6,
  })
}

interface Options {
  enabled: boolean
  mirror: boolean
  /**
   * Called once per camera frame with the current hands. Audio and canvas work
   * belongs here — routing 60 fps of landmarks through React state would
   * re-render the whole app on every frame.
   */
  onFrame: (hands: SmoothedHand[]) => void
}

export function useHandTracking({ enabled, mirror, onFrame }: Options) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [status, setStatus] = useState<TrackingStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [fps, setFps] = useState(0)

  const onFrameRef = useRef(onFrame)
  onFrameRef.current = onFrame
  const mirrorRef = useRef(mirror)
  mirrorRef.current = mirror

  const setVideo = useCallback((element: HTMLVideoElement | null) => {
    videoRef.current = element
  }, [])

  useEffect(() => {
    if (!enabled) {
      setStatus('idle')
      return
    }

    let cancelled = false
    let stream: MediaStream | null = null
    let landmarker: HandLandmarker | null = null
    let rafId = 0
    let lastVideoTime = -1
    let frameCount = 0
    let fpsWindowStart = performance.now()

    const filters = [new HandFilter(0), new HandFilter(1)]

    async function run() {
      setStatus('loading')
      setError(null)
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('이 브라우저는 카메라를 지원하지 않습니다.')
        }

        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'user',
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        })
        if (cancelled) return

        const video = videoRef.current
        if (!video) throw new Error('비디오 요소를 찾을 수 없습니다.')
        video.srcObject = stream
        await video.play()

        landmarker = await createLandmarker()
        if (cancelled) return
        setStatus('running')

        const loop = () => {
          rafId = requestAnimationFrame(loop)
          const element = videoRef.current
          if (!element || !landmarker || element.readyState < 2) return
          // detectForVideo throws if handed the same timestamp twice.
          if (element.currentTime === lastVideoTime) return
          lastVideoTime = element.currentTime

          const result = landmarker.detectForVideo(element, performance.now())
          const hands: SmoothedHand[] = []
          for (let i = 0; i < result.landmarks.length && i < filters.length; i += 1) {
            const features = readHand(result.landmarks[i], mirrorRef.current)
            if (features) hands.push(filters[i].update(features))
          }
          // Reset unused slots so a returning hand does not inherit stale state.
          for (let i = result.landmarks.length; i < filters.length; i += 1) {
            filters[i].reset()
          }

          onFrameRef.current(hands)

          frameCount += 1
          const now = performance.now()
          if (now - fpsWindowStart > 1000) {
            setFps(Math.round((frameCount * 1000) / (now - fpsWindowStart)))
            frameCount = 0
            fpsWindowStart = now
          }
        }
        loop()
      } catch (caught) {
        if (cancelled) return
        const message = caught instanceof Error ? caught.message : String(caught)
        setError(
          message.includes('Permission') || message.includes('NotAllowed')
            ? '카메라 권한이 필요합니다. 브라우저 주소창의 카메라 아이콘에서 허용해 주세요.'
            : message,
        )
        setStatus('error')
      }
    }

    run()

    return () => {
      cancelled = true
      cancelAnimationFrame(rafId)
      landmarker?.close()
      stream?.getTracks().forEach((track) => track.stop())
      const video = videoRef.current
      if (video) video.srcObject = null
    }
  }, [enabled])

  return { setVideo, status, error, fps }
}
