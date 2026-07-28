import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AudioEngine, type ActiveVoice } from './lib/audio'
import { Sequencer, findPattern } from './lib/patterns'
import {
  KEYS,
  PROGRESSIONS,
  degreeToMidi,
  diatonicChords,
  noteName,
  scaleNotes,
  voiceChord,
  type Voicing,
} from './lib/theory'
import {
  ARROW_KEYS,
  CONTROL_KEYS,
  chordIndexForCode,
  degreeForCode,
  semitoneForCode,
} from './lib/keymap'
import { PianoKeyboard } from './components/PianoKeyboard'
import { ScaleKeyboard } from './components/ScaleKeyboard'
import { ChordRail } from './components/ChordRail'
import { ControlPanel, type Settings } from './components/ControlPanel'
import { HelpPanel } from './components/HelpPanel'

const DEFAULT_SETTINGS: Settings = {
  layout: 'chromatic', // the real white/black piano keyboard
  instrument: 'piano',
  baseMidi: 60, // C4 — middle C, with the melody range sitting above it
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
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export default function App() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [running, setRunning] = useState(false)
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
  const activeChord = chords[degreeIndex]

  /** Pitch classes of the current key, marked on the chromatic keyboard. */
  const scalePitchClasses = useMemo(
    () => new Set(scaleNotes(key, 0, 7).map((note) => note % 12)),
    [key],
  )

  /**
   * Pitch classes of the chord playing right now. These are highlighted on the
   * keyboard: anything lit up is guaranteed to sound right over the
   * accompaniment, which is most of what a beginner needs to know.
   */
  const chordPitchClasses = useMemo(
    () =>
      new Set(
        (activeChord?.intervals ?? []).map(
          (interval) => (((activeChord.rootPc + interval) % 12) + 12) % 12,
        ),
      ),
    [activeChord],
  )

  // ---------------------------------------------------------------------------
  // Realtime state lives in refs; React state is only for what a human reads.
  // ---------------------------------------------------------------------------
  const engineRef = useRef<AudioEngine | null>(null)
  const sequencerRef = useRef<Sequencer | null>(null)
  const voicingRef = useRef<Voicing | null>(null)
  const padVoicesRef = useRef<ActiveVoice[]>([])
  const degreeRef = useRef(0)
  const progressionStepRef = useRef(0)
  /** Keys physically held down right now. */
  const heldNotesRef = useRef(new Set<number>())
  /** Notes released but still ringing because the pedal is down. */
  const pedalledRef = useRef(new Set<number>())
  const sustainRef = useRef(false)

  const settingsRef = useRef(settings)
  settingsRef.current = settings
  const chordsRef = useRef(chords)
  chordsRef.current = chords
  const progressionRef = useRef(progression)
  progressionRef.current = progression
  const keyRef = useRef(key)
  keyRef.current = key

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

  /** Strike the current chord, on top of whatever the pattern is doing. */
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
    heldNotesRef.current.clear()
    pedalledRef.current.clear()
    setActiveNotes(new Set())
    sequencerRef.current?.stop()
    setSettings((current) => ({ ...current, autoPlay: false }))
  }, [])

  const stopSession = useCallback(() => {
    panic()
    setRunning(false)
  }, [panic])

  // ---------------------------------------------------------------------------
  // The computer keyboard as an instrument
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

  /** MIDI note a physical key plays under the current layout, or undefined. */
  const midiForCode = useCallback((code: string): number | undefined => {
    const { layout, baseMidi } = settingsRef.current
    if (layout === 'easy') {
      const degree = degreeForCode(code)
      return degree === undefined ? undefined : degreeToMidi(keyRef.current, baseMidi, degree)
    }
    const semitone = semitoneForCode(code)
    return semitone === undefined ? undefined : baseMidi + semitone
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      // Only text entry swallows keys. Buttons must NOT, or the keyboard would
      // go dead the moment the player clicks a control and it keeps focus.
      if (target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return
      if (event.metaKey || event.ctrlKey || event.altKey) return

      const midi = midiForCode(event.code)
      if (midi !== undefined) {
        event.preventDefault()
        if (event.repeat) return // auto-repeat would machine-gun the note
        void noteDown(midi)
        return
      }

      // Number row picks a chord degree outright, no cycling.
      const chordIndex = chordIndexForCode(event.code)
      if (chordIndex >= 0) {
        event.preventDefault()
        if (event.repeat) return
        selectDegree(chordIndex)
        // Always sound it, so the number row is an instrument too, not just a
        // setting. Softer while the pattern is running so it doesn't clutter.
        if (getEngine().ready) strikeChord(settingsRef.current.autoPlay ? 0.5 : 0.72)
        return
      }

      const shiftOctave = (delta: number) =>
        setSettings((current) => ({
          ...current,
          baseMidi: clamp(current.baseMidi + delta * 12, 36, 84),
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
      const midi = midiForCode(event.code)
      if (midi !== undefined) {
        noteUp(midi)
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
  }, [midiForCode, noteDown, noteUp, releasePedal, selectDegree, strikeChord, panic])

  // Switching layout or key remaps every physical key, so anything still held
  // would never receive its note-off. Release them all at the swap.
  useEffect(() => {
    const engine = engineRef.current
    if (engine?.ready) {
      for (const midi of heldNotesRef.current) engine.releaseNote(`key-${midi}`)
    }
    heldNotesRef.current.clear()
    setActiveNotes(new Set())
  }, [settings.layout, settings.keyIndex, settings.baseMidi])

  // ---------------------------------------------------------------------------
  // Transport
  // ---------------------------------------------------------------------------

  const ensureSequencer = useCallback((): Sequencer => {
    if (sequencerRef.current) return sequencerRef.current
    const sequencer = new Sequencer(getEngine(), {
      getVoicing: () => voicingRef.current,
      getPattern: () => findPattern(settingsRef.current.patternId),
      getIntensity: () => 0.6,
      metronome: () => settingsRef.current.metronome,
      onBeat: (beat) => setBeatInBar(beat),
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
  }, [ensureSequencer, refreshPad])

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

  // A new progression starts from its own first chord.
  useEffect(() => {
    setStep(0)
    const guide = progressionRef.current
    if (guide.degrees.length > 0) selectDegree(guide.degrees[0] - 1)
  }, [settings.progressionId, setStep, selectDegree])

  useEffect(() => () => void engineRef.current?.close(), [])

  // ---------------------------------------------------------------------------

  const updateSetting = useCallback(<K extends keyof Settings>(name: K, value: Settings[K]) => {
    setSettings((current) => ({ ...current, [name]: value }))
  }, [])

  const guideNext =
    progression.degrees.length > 0
      ? progression.degrees[progressionStep % progression.degrees.length] - 1
      : -1

  // In the easy layout the leftmost key is the tonic, not the raw base note,
  // so report what actually sounds rather than the internal reference pitch.
  const lowestMidi =
    settings.layout === 'easy' ? degreeToMidi(key, settings.baseMidi, 0) : settings.baseMidi
  const octaveLabel = `${noteName(lowestMidi % 12, key.useFlats)}${Math.floor(lowestMidi / 12) - 1}`

  return (
    <div className="mx-auto flex min-h-full max-w-7xl flex-col gap-5 px-4 py-6 sm:px-6 lg:py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-glow-500">
            Worship Piano
          </p>
          <h1 className="mt-1 text-3xl font-black tracking-tight text-white sm:text-4xl">
            키보드로 치는 <span className="text-glow-400">찬양 반주</span>
          </h1>
          <p className="mt-1.5 max-w-xl text-sm text-white/50">
            {settings.layout === 'chromatic'
              ? '컴퓨터 키보드가 그대로 피아노 건반이 됩니다. 지금 코드에 어울리는 음은 초록색으로 켜지고, 반주는 박자에 맞춰 알아서 흐릅니다.'
              : '모든 건반이 지금 조의 음이라 틀린 음이 나오지 않습니다. 초록색 건반은 지금 코드에 어울리는 음이고, 반주는 박자에 맞춰 알아서 흐릅니다.'}
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
            <button
              type="button"
              onClick={stopSession}
              className="rounded-2xl border border-red-400/40 bg-red-400/10 px-4 py-3 text-sm font-semibold text-red-200 transition hover:bg-red-400/20"
            >
              전체 정지
            </button>
          )}
        </div>
      </header>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <main className="space-y-4">
          {settings.layout === 'easy' ? (
            <ScaleKeyboard
              musicalKey={key}
              baseMidi={settings.baseMidi}
              activeNotes={activeNotes}
              chordPitchClasses={chordPitchClasses}
              onNoteDown={(midi) => void noteDown(midi)}
              onNoteUp={noteUp}
            />
          ) : (
            <PianoKeyboard
              musicalKey={key}
              baseMidi={settings.baseMidi}
              activeNotes={activeNotes}
              scalePitchClasses={scalePitchClasses}
              chordPitchClasses={chordPitchClasses}
              onNoteDown={(midi) => void noteDown(midi)}
              onNoteUp={noteUp}
            />
          )}

          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm text-white/60">
            <span className="flex items-center gap-2">
              <span
                className={[
                  'h-2 w-2 rounded-full',
                  running ? 'bg-mint-400' : 'bg-white/30',
                ].join(' ')}
              />
              {running ? `연주 중 · ${octaveLabel}부터` : '연주 시작을 눌러 주세요'}
            </span>
            <span className="text-white/35">Z·X 옥타브 · 1~7 코드 · Space 페달</span>
            {sustainOn && (
              <span className="rounded-lg bg-glow-400/20 px-2 py-0.5 text-xs font-bold text-glow-400">
                페달 ON
              </span>
            )}
            <span className="flex items-center gap-1.5 text-xs text-white/35">
              <span className="h-2.5 w-2.5 rounded-sm bg-mint-400/85" />이 색이 지금 코드에
              어울리는 음
            </span>
          </p>

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
              if (engineRef.current?.ready) strikeChord(settings.autoPlay ? 0.5 : 0.72)
            }}
          />
        </main>

        {/* Scrolls inside itself on wide screens so the panel never stretches
            the page far past the keyboard. */}
        <aside className="space-y-3 lg:sticky lg:top-6 lg:max-h-[calc(100dvh-3rem)] lg:overflow-y-auto lg:pr-1">
          <ControlPanel settings={settings} onChange={updateSetting} />
          <HelpPanel layout={settings.layout} />
        </aside>
      </div>

      <footer className="pb-6 text-center text-xs text-white/30">
        모든 소리는 브라우저에서 직접 합성됩니다. 설치도, 로그인도 필요 없습니다.
      </footer>
    </div>
  )
}
