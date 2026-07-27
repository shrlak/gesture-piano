// Prepares the MediaPipe assets the app serves itself, so the browser never has
// to reach a third-party CDN at runtime.
//
//   public/mediapipe/wasm/*          <- copied out of node_modules
//   public/models/hand_landmarker.task <- downloaded once, then cached
//
// Both are gitignored. If the download fails (offline build, blocked egress)
// we warn instead of failing: the app falls back to the public CDN at runtime.

import { cp, mkdir, stat, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const WASM_SRC = resolve(root, 'node_modules/@mediapipe/tasks-vision/wasm')
const WASM_DEST = resolve(root, 'public/mediapipe/wasm')

const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'
const MODEL_DEST = resolve(root, 'public/models/hand_landmarker.task')

async function exists(path) {
  try {
    const info = await stat(path)
    return info.size > 0
  } catch {
    return false
  }
}

async function copyWasm() {
  if (!(await exists(WASM_SRC))) {
    console.warn('[setup-vision] @mediapipe/tasks-vision not installed, skipping wasm copy')
    return
  }
  await mkdir(dirname(WASM_DEST), { recursive: true })
  await cp(WASM_SRC, WASM_DEST, { recursive: true })
  console.log('[setup-vision] wasm runtime ready')
}

async function downloadModel() {
  if (await exists(MODEL_DEST)) {
    console.log('[setup-vision] hand landmark model already cached')
    return
  }
  await mkdir(dirname(MODEL_DEST), { recursive: true })
  try {
    const response = await fetch(MODEL_URL)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    await writeFile(MODEL_DEST, Buffer.from(await response.arrayBuffer()))
    console.log('[setup-vision] hand landmark model downloaded')
  } catch (error) {
    console.warn(
      `[setup-vision] could not download the hand landmark model (${error.message}).`,
      'The app will fall back to the public CDN at runtime.',
    )
  }
}

await copyWasm()
await downloadModel()
