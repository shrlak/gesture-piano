import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AudioEngine, type ActiveVoice } from './lib/audio'
import { Sequencer, findPattern } from './lib/patterns'
import {
  KEYS,
  PROGRESSIONS,
  diatonicChords,
  noteName,
  pentatonicNotes,
  scaleNotes,
  voiceChord,
  type Voicing,
} from './lib/theory'
import { quantizeZone, type SmoothedHand } from './lib/gestures'
import { ARROW_KEYS, CONTROL_KEYS, chordIndexForCode, semitoneForCode } from './lib/keymap'
import { PianoKeyboard } from './components/PianoKeyboard'
import { useHandTracking } from './hooks/useHandTracking'
import { CameraStage, type Scene } from './components/CameraStage'
import { ChordRail } from './components/ChordRail'
import { ControlPanel, type PlayMode, type Settings } from './components/ControlPanel'
import { HelpPanel } from './components/HelpPanel'

/** Rungs on the melody ladder — two octaves of the pentatonic scale. */
const MELODY_STEPS = 10
const SOLFA = ['도', '레', '미', '솔', '라']

const DEFAULT_SETTINGS: Settings = {
  mode: 'keyboard',
  instrument: 'piano',
  baseMidi: 60, // C4 — middle C under the left hand, melody range above it
  keyIndex: 7, // G — the key most Korean worship sets land in
  color: 'add9',
  patternId: 'arpeggio8',
  bpm: 76,
  autoPlay: true,
  metronome: false,
  progressionId: 'free',
  autoAdvance: false,
  volume: 0.8,
  reverb: 0.3,
  padLevel: 0.5,
  mirror: true,
  split: 0.62,
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export default function App() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [running, setRunning] = useState(false)
  const [cameraOn, setCameraOn] = useState(false)
  const [degreeIndex, setDegreeIndex] = useState(0)
  const [progressionStep, setProgressionStep] = useState(0)
  const [beatInBar, setBeatInBar] = useState(0)
  const [activeNotes, setActiveNotes] = useState<Set<number>>(() => new Set())
  const [sustainOn, setSustainOn] = useState(false)

  const key = KEYS[settings.keyIndex]
  const chords = useMemo(() => diatonicChords(key, settings.color), [key, settings.color])
  const pattern = findPattern(settings.patternId)
  const progression =
    PROGRESSIONS.find((item) => item.id === settings.progressionId) ?? PROGRESSIONS[0]

  const melodyNotes = useMemo(() => pentatonicNotes(key, 60, MELODY_STEPS), [key])
  const melodyLabels = useMemo(
    () =>
      melodyNotes.map(
        (note, index) =>
          `${SOLFA[index % SOLFA.length]}${index >= SOLFA.length ? '′' : ''} · ${noteName(note % 12, key.useFlats)}`,
      ),
    [melodyNotes, key],
  )
  const chordLabels = useMemo(() => chords.map((chord) => chord.symbol), [chords])

  /** Pitch classes of the current key, marked on the on-screen keyboard. */
  const scalePitchClasses = useMemo(
    () => new Set(scaleNotes(key, 0, 7).map((note) => note % 12)),
    [key],
  )

  // ---------------------------------------------------------------------------
  // Realtime state. The tracking loop runs at camera rate, so anything it
  // touches lives in a ref; React state is only for things a human can read.
  // ---------------------------------------------------------------------------
  const engineRef = useRef<AudioEngine | null>(null)
  const sequencerRef = useRef<Sequencer | null>(null)
  const voicingRef = useRef<Voicing | null>(null)
  const padVoicesRef = useRef<ActiveVoice[]>([])
  const intensityRef = useRef(0.55)
  const degreeRef = useRef(0)
  const melodyStepRef = useRef(-1)
  const melodyHeldRef = useRef<number | null>(null)
  const fistLatchRef = useRef(false)
  const progressionStepRef = useRef(0)
  /** Keys physically held down right now. */
  const heldNotesRef = useRef(new Set<number>())
  /** Notes released but still ringing because the pedal is down. */
  const pedalledRef = useRef(new Set<number>())
  const sustainRef = useRef(false)

  const sceneRef = useRef<Scene>({
    hands: [],
    chordZone: 0,
    melodyStep: -1,
    melodyActive: false,
    beatInBar: 0,
    beatsPerBar: 4,
    intensity: 0.55,
  })

  const settingsRef = useRef(settings)
  settingsRef.current = settings
  const chordsRef = useRef(chords)
  chordsRef.current = chords
  const melodyNotesRef = useRef(melodyNotes)
  melodyNotesRef.current = melodyNotes
  const progressionRef = useRef(progression)
  progressionRef.current = progression
  const baseMidiRef = useRef(settings.baseMidi)
  baseMidiRef.current = settings.baseMidi

  function getEngine(): AudioEngine {
    if (!engineRef.current) engineRef.current = new AudioEngine()
    return engineRef.current
  }

  // ---------------------------------------------------------------------------
  // Harmony
  // ---------------------------------------------------------------------------

  /** Lay a sustained pad under the current chord, crossfading from the last one. */
  const refreshPad = useCallback((voicing: Voicing) => {
    const engine = getEngine()
    if (!engine.ready) return
    const { autoPlay, patternId } = settingsRef.current
    const wantsPad = autoPlay && findPattern(patternId).pad

    const now = engine.currentTime
    for (const voice of padVoicesRef.current) voice.release(now)
    padVoicesRef.current = []
    if (!wantsPad) return

    // Two chord tones plus the root an octave up is enough body without
    // swamping the piano that plays on top of it.
    const padNotes = [voicing.bass + 12, ...voicing.notes.slice(0, 3)]
    for (const note of padNotes) {
      const voice = engine.playPad(note, { velocity: 0.4 })
      if (voice) padVoicesRef.current.push(voice)
    }
  }, [])

  /** Re-voice whenever the chord, key, or colour changes. */
  useEffect(() => {
    const chord = chords[degreeIndex]
    if (!chord) return
    const voicing = voiceChord(chord, { previous: voicingRef.current })
    voicingRef.current = voicing
    refreshPad(voicing)
  }, [chords, degreeIndex, refreshPad])

  const setStep = useCallback((step: number) => {
    progressionStepRef.current = step
    setProgressionStep(step)
  }, [])

  const selectDegree = useCallback(
    (index: number) => {
      const clamped = clamp(index, 0, 6)
      if (degreeRef.current === clamped) return
      degreeRef.current = clamped
      sceneRef.current.chordZone = clamped
      setDegreeIndex(clamped)

      // Following the guide by hand: land on the expected chord and the guide
      // moves on to the next one.
      const guide = progressionRef.current
      if (guide.degrees.length > 0 && !settingsRef.current.autoAdvance) {
        const step = progressionStepRef.current
        if (guide.degrees[step % guide.degrees.length] === clamped + 1) {
          setStep((step + 1) % guide.degrees.length)
        }
      }
    },
    [setStep],
  )

  /** Strike the current chord by hand, on top of whatever the pattern is doing. */
  const strikeChord = useCallback((velocity: number) => {
    const engine = getEngine()
    const voicing = voicingRef.current
    if (!engine.ready || !voicing) return
    engine.playBass(voicing.bass, { velocity: velocity * 0.9, hold: 1.2 })
    voicing.notes.forEach((note, index) => {
      engine.playPiano(note, {
        velocity: velocity * (index === 0 ? 1 : 0.88),
        hold: 1.4,
        when: engine.currentTime + index * 0.012,
      })
    })
  }, [])

  /** Cut all sound and pause the transport, but stay ready to play again. */
  const panic = useCallback(() => {
    getEngine().panic()
    padVoicesRef.current = []
    melodyHeldRef.current = null
    sceneRef.current.melodyActive = false
    sequencerRef.current?.stop()
    setSettings((current) => ({ ...current, autoPlay: false }))
  }, [])

  /** Full stop: silence, and hand the session back to the start button. */
  const stopSession = useCallback(() => {
    panic()
    setRunning(false)
  }, [panic])

  // ---------------------------------------------------------------------------
  // Gesture → music
  // ---------------------------------------------------------------------------

  const handleFrame = useCallback(
    (hands: SmoothedHand[]) => {
      const engine = getEngine()
      const { split } = settingsRef.current
      const scene = sceneRef.current
      scene.hands = hands

      const chordHand = hands.find((hand) => hand.x < split)
      const melodyHand = hands.find((hand) => hand.x >= split)

      // --- chord hand -------------------------------------------------------
      if (chordHand) {
        if (chordHand.fist) {
          // Latch it, or a held fist would re-fire the panic every frame.
          if (!fistLatchRef.current) {
            fistLatchRef.current = true
            panic()
          }
        } else {
          fistLatchRef.current = false

          // Height is dynamics. The usable band stops short of the frame edges,
          // where hands get clipped and tracking turns unreliable.
          const intensity = clamp((0.85 - chordHand.y) / 0.7, 0, 1)
          intensityRef.current = intensity
          scene.intensity = intensity

          // The hand drives chord choice unless a progression is driving it.
          const driven =
            settingsRef.current.autoAdvance && progressionRef.current.degrees.length > 0
          if (!driven) {
            const local = clamp(chordHand.x / split, 0, 0.9999)
            const zone = quantizeZone(local, 7, degreeRef.current)
            if (zone !== degreeRef.current) selectDegree(zone)
          }

          if (chordHand.pinchStarted && engine.ready) {
            strikeChord(clamp(0.45 + intensity * 0.5, 0.2, 0.95))
          }
        }
      } else {
        fistLatchRef.current = false
      }

      // --- melody hand ------------------------------------------------------
      if (melodyHand) {
        // Invert y so the top of the frame is the top of the ladder.
        const step = quantizeZone(
          clamp(1 - melodyHand.y, 0, 0.9999),
          MELODY_STEPS,
          melodyStepRef.current < 0 ? 0 : melodyStepRef.current,
          0.16,
        )
        melodyStepRef.current = step
        scene.melodyStep = step

        if (melodyHand.pinched && engine.ready) {
          // Re-strike when the hand slides to a new rung, so held pinches play
          // a line instead of one endless note.
          if (melodyHeldRef.current !== step) {
            melodyHeldRef.current = step
            const note = melodyNotesRef.current[step]
            engine.holdNote('melody', note, clamp(0.5 + intensityRef.current * 0.4, 0.3, 0.95))
          }
          scene.melodyActive = true
        } else if (melodyHeldRef.current !== null) {
          engine.releaseNote('melody')
          melodyHeldRef.current = null
          scene.melodyActive = false
        }
      } else if (melodyHeldRef.current !== null) {
        engine.releaseNote('melody')
        melodyHeldRef.current = null
        scene.melodyActive = false
        scene.melodyStep = -1
      }
    },
    [selectDegree, strikeChord, panic],
  )

  const { setVideo, status, error, fps } = useHandTracking({
    enabled: cameraOn,
    mirror: settings.mirror,
    onFrame: handleFrame,
  })

  // ---------------------------------------------------------------------------
  // Transport
  // ---------------------------------------------------------------------------

  const ensureSequencer = useCallback((): Sequencer => {
    if (sequencerRef.current) return sequencerRef.current
    const sequencer = new Sequencer(getEngine(), {
      getVoicing: () => voicingRef.current,
      getPattern: () => findPattern(settingsRef.current.patternId),
      getIntensity: () => intensityRef.current,
      metronome: () => settingsRef.current.metronome,
      onBeat: (beat, beatsPerBar) => {
        sceneRef.current.beatInBar = beat
        sceneRef.current.beatsPerBar = beatsPerBar
        setBeatInBar(beat)
      },
      onBar: () => {
        const guide = progressionRef.current
        if (!settingsRef.current.autoAdvance || guide.degrees.length === 0) return
        const next = (progressionStepRef.current + 1) % guide.degrees.length
        setStep(next)
        selectDegree(guide.degrees[next] - 1)
      },
    })
    sequencerRef.current = sequencer
    return sequencer
  }, [selectDegree, setStep])

  const start = useCallback(async () => {
    const engine = getEngine()
    await engine.start()
    engine.setMasterVolume(settingsRef.current.volume)
    engine.setReverb(settingsRef.current.reverb)
    engine.setVoiceLevel('pad', settingsRef.current.padLevel)

    const voicing = voicingRef.current ?? voiceChord(chordsRef.current[degreeRef.current])
    voicingRef.current = voicing
    refreshPad(voicing)

    const sequencer = ensureSequencer()
    sequencer.setBpm(settingsRef.current.bpm)
    if (settingsRef.current.autoPlay) sequencer.start()
    setRunning(true)
    // The camera only belongs to gesture mode; keyboard mode never asks for it.
    if (settingsRef.current.mode === 'gesture') setCameraOn(true)
  }, [ensureSequencer, refreshPad])

  // Leaving gesture mode must actually release the camera, not just hide it.
  useEffect(() => {
    if (settings.mode === 'keyboard') setCameraOn(false)
    else if (running) setCameraOn(true)
  }, [settings.mode, running])

  // Transport follows the auto-play switch once the engine is alive.
  useEffect(() => {
    if (!running) return
    const sequencer = ensureSequencer()
    if (settings.autoPlay) {
      sequencer.start()
    } else {
      sequencer.stop()
      const engine = getEngine()
      const now = engine.currentTime
      for (const voice of padVoicesRef.current) voice.release(now)
      padVoicesRef.current = []
    }
  }, [running, settings.autoPlay, ensureSequencer])

  useEffect(() => {
    sequencerRef.current?.setBpm(settings.bpm)
  }, [settings.bpm])

  useEffect(() => {
    const engine = engineRef.current
    if (!engine?.ready) return
    engine.setMasterVolume(settings.volume)
    engine.setReverb(settings.reverb)
    engine.setVoiceLevel('pad', settings.padLevel)
  }, [settings.volume, settings.reverb, settings.padLevel])

  // Switching to a pattern without a pad should drop the pad immediately.
  useEffect(() => {
    if (!running) return
    const voicing = voicingRef.current
    if (voicing) refreshPad(voicing)
  }, [running, settings.patternId, settings.autoPlay, refreshPad])

  // A new progression starts from its own first chord, not wherever the last
  // one happened to leave the guide.
  useEffect(() => {
    setStep(0)
    const guide = progressionRef.current
    if (guide.degrees.length > 0) selectDegree(guide.degrees[0] - 1)
  }, [settings.progressionId, setStep, selectDegree])

  useEffect(() => () => void engineRef.current?.close(), [])

  // ---------------------------------------------------------------------------
  // The computer keyboard as an instrument. Always live, camera or not.
  // ---------------------------------------------------------------------------

  const noteDown = useCallback(async (midi: number, velocity = 0.7) => {
    const engine = getEngine()
    // Playing a key is a user gesture, so it may legally wake the audio context.
    if (!engine.ready) await engine.start()
    engine.holdNote(`key-${midi}`, midi, velocity, settingsRef.current.instrument)
    heldNotesRef.current.add(midi)
    setActiveNotes(new Set(heldNotesRef.current))
  }, [])

  const noteUp = useCallback((midi: number) => {
    // With the pedal down the key lifts but the note keeps ringing.
    if (sustainRef.current) {
      pedalledRef.current.add(midi)
    } else {
      getEngine().releaseNote(`key-${midi}`)
    }
    heldNotesRef.current.delete(midi)
    setActiveNotes(new Set(heldNotesRef.current))
  }, [])

  const releasePedal = useCallback(() => {
    sustainRef.current = false
    const engine = getEngine()
    for (const midi of pedalledRef.current) {
      // Keys still physically down keep sounding; only pedalled ones damp.
      if (!heldNotesRef.current.has(midi)) engine.releaseNote(`key-${midi}`)
    }
    pedalledRef.current.clear()
    setSustainOn(false)
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      // Only text entry swallows keys. Buttons must NOT, or the keyboard would
      // go dead the moment the player clicks a control and it keeps focus.
      if (target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return
      if (event.metaKey || event.ctrlKey || event.altKey) return

      const semitone = semitoneForCode(event.code)
      if (semitone !== undefined) {
        event.preventDefault()
        if (event.repeat) return // auto-repeat would machine-gun the note
        void noteDown(baseMidiRef.current + semitone)
        return
      }

      // Number row picks a chord degree outright, no cycling.
      const chordIndex = chordIndexForCode(event.code)
      if (chordIndex >= 0) {
        event.preventDefault()
        if (event.repeat) return
        selectDegree(chordIndex)
        if (!settingsRef.current.autoPlay && getEngine().ready) strikeChord(0.7)
        return
      }

      const shiftOctave = (delta: number) =>
        setSettings((current) => ({
          ...current,
          baseMidi: clamp(current.baseMidi + delta * 12, 24, 84),
        }))

      // Space and Enter are how a focused button gets activated, so when one
      // has focus they belong to the button, not to the instrument.
      const buttonFocused = document.activeElement?.tagName === 'BUTTON'

      switch (event.code) {
        case CONTROL_KEYS.sustain:
          if (buttonFocused) return
          event.preventDefault()
          if (!sustainRef.current) {
            sustainRef.current = true
            setSustainOn(true)
          }
          break
        case CONTROL_KEYS.strikeChord:
          if (buttonFocused) return
          if (getEngine().ready) strikeChord(0.75)
          break
        case CONTROL_KEYS.octaveDown:
        case ARROW_KEYS.octaveDown:
          event.preventDefault()
          if (!event.repeat) shiftOctave(-1)
          break
        case CONTROL_KEYS.octaveUp:
        case ARROW_KEYS.octaveUp:
          event.preventDefault()
          if (!event.repeat) shiftOctave(1)
          break
        case ARROW_KEYS.chordDown:
          event.preventDefault()
          selectDegree((degreeRef.current + 6) % 7)
          break
        case ARROW_KEYS.chordUp:
          event.preventDefault()
          selectDegree((degreeRef.current + 1) % 7)
          break
        case CONTROL_KEYS.toggleAccompaniment:
          setSettings((current) => ({ ...current, autoPlay: !current.autoPlay }))
          break
        case CONTROL_KEYS.panic:
          panic()
          break
      }
    }

    const onKeyUp = (event: KeyboardEvent) => {
      const semitone = semitoneForCode(event.code)
      if (semitone !== undefined) {
        noteUp(baseMidiRef.current + semitone)
        return
      }
      if (event.code === CONTROL_KEYS.sustain) releasePedal()
    }

    // A lost focus (alt-tab mid-chord) would otherwise leave notes stuck on.
    const onBlur = () => {
      const engine = getEngine()
      for (const midi of heldNotesRef.current) engine.releaseNote(`key-${midi}`)
      heldNotesRef.current.clear()
      setActiveNotes(new Set())
      releasePedal()
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [noteDown, noteUp, releasePedal, selectDegree, strikeChord, panic])

  // ---------------------------------------------------------------------------

  const updateSetting = useCallback(<K extends keyof Settings>(name: K, value: Settings[K]) => {
    setSettings((current) => ({ ...current, [name]: value }))
  }, [])

  const guideNext =
    progression.degrees.length > 0
      ? progression.degrees[progressionStep % progression.degrees.length] - 1
      : -1

  const activeChord = chords[degreeIndex]

  return (
    <div className="mx-auto flex min-h-full max-w-7xl flex-col gap-5 px-4 py-6 sm:px-6 lg:py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-glow-500">
            Gesture Piano
          </p>
          <h1 className="mt-1 text-3xl font-black tracking-tight text-white sm:text-4xl">
            손으로 드리는 <span className="text-glow-400">찬양 반주</span>
          </h1>
          <p className="mt-1.5 max-w-xl text-sm text-white/50">
            {settings.mode === 'keyboard'
              ? '컴퓨터 키보드가 그대로 건반이 됩니다. 피아노와 신디 중에 고르고, 자동 반주를 켠 채 멜로디만 연주해 보세요.'
              : '카메라 앞에서 손을 움직여 코드와 멜로디를 연주합니다. 조성과 반주 패턴만 정해 두면 어떤 손짓도 화음에서 벗어나지 않습니다.'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {!running ? (
            <button
              type="button"
              onClick={start}
              className="rounded-2xl bg-glow-500 px-6 py-3 text-base font-bold text-sanctuary-950 shadow-lg shadow-glow-600/30 transition hover:bg-glow-400"
            >
              연주 시작
            </button>
          ) : (
            <>
              {settings.mode === 'gesture' && (
                <button
                  type="button"
                  onClick={() => setCameraOn((value) => !value)}
                  className="rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-sm font-semibold text-white/80 transition hover:border-white/35"
                >
                  {cameraOn ? '카메라 끄기' : '카메라 켜기'}
                </button>
              )}
              <button
                type="button"
                onClick={stopSession}
                className="rounded-2xl border border-red-400/40 bg-red-400/10 px-4 py-3 text-sm font-semibold text-red-200 transition hover:bg-red-400/20"
              >
                전체 정지
              </button>
            </>
          )}
        </div>
      </header>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <main className="space-y-4">
          {settings.mode === 'keyboard' ? (
            <PianoKeyboard
              baseMidi={settings.baseMidi}
              activeNotes={activeNotes}
              scalePitchClasses={scalePitchClasses}
              useFlats={key.useFlats}
              onNoteDown={(midi) => void noteDown(midi)}
              onNoteUp={noteUp}
            />
          ) : (
            <CameraStage
              setVideo={setVideo}
              sceneRef={sceneRef}
              split={settings.split}
              chordLabels={chordLabels}
              melodyLabels={melodyLabels}
              mirror={settings.mirror}
              active={cameraOn && status === 'running'}
            />
          )}

          <StatusStrip
            mode={settings.mode}
            sustainOn={sustainOn}
            baseMidi={settings.baseMidi}
            status={status}
            error={error}
            fps={fps}
            cameraOn={cameraOn}
            running={running}
          />

          <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
            <div>
              <p className="text-[0.65rem] uppercase tracking-[0.2em] text-white/40">
                지금 코드
              </p>
              <p className="text-3xl font-black text-glow-400">{activeChord?.symbol}</p>
            </div>
            <div className="h-10 w-px bg-white/10" />
            <div>
              <p className="text-[0.65rem] uppercase tracking-[0.2em] text-white/40">조성</p>
              <p className="text-lg font-bold text-white">{key.name} 장조</p>
            </div>
            <div className="h-10 w-px bg-white/10" />
            <div>
              <p className="text-[0.65rem] uppercase tracking-[0.2em] text-white/40">박</p>
              <p className="flex items-center gap-1.5 pt-1.5">
                {Array.from({ length: pattern.beatsPerBar }, (_, beat) => (
                  <span
                    key={beat}
                    className={[
                      'block rounded-full transition-all',
                      beat === beatInBar && settings.autoPlay
                        ? 'h-3 w-3 bg-glow-400'
                        : 'h-2 w-2 bg-white/20',
                    ].join(' ')}
                  />
                ))}
              </p>
            </div>
            {guideNext >= 0 && (
              <>
                <div className="h-10 w-px bg-white/10" />
                <div>
                  <p className="text-[0.65rem] uppercase tracking-[0.2em] text-white/40">
                    다음 코드
                  </p>
                  <p className="text-lg font-bold text-mint-400">{chords[guideNext]?.symbol}</p>
                </div>
              </>
            )}
          </div>

          <ChordRail
            chords={chords}
            activeIndex={degreeIndex}
            nextIndex={guideNext}
            onSelect={(index) => {
              selectDegree(index)
              if (!settings.autoPlay && engineRef.current?.ready) strikeChord(0.7)
            }}
          />
        </main>

        {/* Scrolls inside itself on wide screens so the panel never stretches
            the page far past the camera view. */}
        <aside className="space-y-3 lg:sticky lg:top-6 lg:max-h-[calc(100dvh-3rem)] lg:overflow-y-auto lg:pr-1">
          <ControlPanel settings={settings} onChange={updateSetting} />
          <HelpPanel mode={settings.mode} />
        </aside>
      </div>

      <footer className="pb-6 text-center text-xs text-white/30">
        모든 소리는 브라우저에서 직접 합성됩니다. 영상은 기기 밖으로 나가지 않습니다.
      </footer>
    </div>
  )
}

function StatusStrip({
  mode,
  sustainOn,
  baseMidi,
  status,
  error,
  fps,
  cameraOn,
  running,
}: {
  mode: PlayMode
  sustainOn: boolean
  baseMidi: number
  status: string
  error: string | null
  fps: number
  cameraOn: boolean
  running: boolean
}) {
  if (mode === 'keyboard') {
    const octave = Math.floor(baseMidi / 12) - 1
    return (
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm text-white/60">
        <span className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-mint-400" />
          건반 모드 · C{octave}부터
        </span>
        <span className="text-white/35">Z·X 옥타브 · 1~7 코드 · Space 페달</span>
        {sustainOn && (
          <span className="rounded-lg bg-glow-400/20 px-2 py-0.5 text-xs font-bold text-glow-400">
            페달 ON
          </span>
        )}
      </p>
    )
  }

  if (error) {
    return (
      <p className="rounded-2xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-200">
        {error} — 건반 모드로 바꾸면 카메라 없이 그대로 연주할 수 있습니다.
      </p>
    )
  }

  const label = !running
    ? '대기 중 · 연주 시작을 눌러 주세요'
    : !cameraOn
      ? '카메라 꺼짐 · 코드 버튼과 키보드로 연주 중'
      : status === 'loading'
        ? '손 인식 모델을 불러오는 중…'
        : status === 'running'
          ? `손 인식 중 · ${fps} fps`
          : '카메라 준비 중…'

  return (
    <p className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm text-white/60">
      <span
        className={[
          'h-2 w-2 rounded-full',
          status === 'running' && cameraOn ? 'bg-mint-400' : 'bg-white/30',
        ].join(' ')}
      />
      {label}
    </p>
  )
}
