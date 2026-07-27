import type { ReactNode } from 'react'
import { KEYS, PROGRESSIONS, noteName, type ChordColor } from '../lib/theory'
import { PATTERNS } from '../lib/patterns'
import type { Instrument } from '../lib/audio'

/** How the player drives the app: camera gestures, or the computer keyboard. */
export type PlayMode = 'gesture' | 'keyboard'

export interface Settings {
  mode: PlayMode
  instrument: Instrument
  /** MIDI note of the leftmost computer-keyboard key. */
  baseMidi: number
  keyIndex: number
  color: ChordColor
  patternId: string
  bpm: number
  autoPlay: boolean
  metronome: boolean
  progressionId: string
  autoAdvance: boolean
  volume: number
  reverb: number
  padLevel: number
  mirror: boolean
  split: number
}

interface Props {
  settings: Settings
  onChange: <K extends keyof Settings>(key: K, value: Settings[K]) => void
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-white/40">
        {title}
      </h3>
      {children}
    </section>
  )
}

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <label className="block space-y-1.5">
      <span className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-white/80">{label}</span>
        {hint && <span className="text-xs tabular-nums text-white/40">{hint}</span>}
      </span>
      {children}
    </label>
  )
}

/**
 * Same look as `Field`, but a group rather than a `<label>`. A label wrapping a
 * row of buttons folds its text into every button's accessible name and makes
 * clicking the caption press the first button, so button grids use this.
 */
function Group({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <div role="group" aria-label={label} className="space-y-1.5">
      <span className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-white/80">{label}</span>
        {hint && <span className="text-xs tabular-nums text-white/40">{hint}</span>}
      </span>
      {children}
    </div>
  )
}

/**
 * Returns focus to the page after a mouse click so the computer keyboard goes
 * back to playing notes instead of re-triggering the button on Space/Enter.
 * Keyboard users never fire pointer events, so their focus ring is untouched.
 */
function blurOnPointerUp(event: React.PointerEvent<HTMLButtonElement>) {
  event.currentTarget.blur()
}

const selectClass =
  'w-full rounded-xl border border-white/12 bg-sanctuary-900 px-3 py-2 text-sm text-white outline-none transition focus:border-glow-400/70'

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string
  description?: string
  checked: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      onPointerUp={blurOnPointerUp}
      className="flex w-full items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-left transition hover:border-white/25"
    >
      <span>
        <span className="block text-sm font-medium text-white/85">{label}</span>
        {description && <span className="block text-xs text-white/40">{description}</span>}
      </span>
      <span
        className={[
          'relative h-6 w-11 shrink-0 rounded-full transition',
          checked ? 'bg-glow-500' : 'bg-white/15',
        ].join(' ')}
      >
        <span
          className={[
            'absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all',
            checked ? 'left-[1.4rem]' : 'left-0.5',
          ].join(' ')}
        />
      </span>
    </button>
  )
}

const MODE_OPTIONS: Array<{ value: PlayMode; label: string; hint: string }> = [
  { value: 'gesture', label: '제스처', hint: '카메라 · 손동작' },
  { value: 'keyboard', label: '건반', hint: '컴퓨터 키보드' },
]

const INSTRUMENT_OPTIONS: Array<{ value: Instrument; label: string; hint: string }> = [
  { value: 'piano', label: '피아노', hint: '치면 사라지는 소리' },
  { value: 'synth', label: '신디', hint: '누른 만큼 지속' },
]

const COLOR_OPTIONS: Array<{ value: ChordColor; label: string; hint: string }> = [
  { value: 'triad', label: '3화음', hint: '기본' },
  { value: 'add9', label: 'add9', hint: '넓게' },
  { value: 'sus4', label: 'sus4', hint: '떠있게' },
  { value: 'seventh', label: '7화음', hint: '재즈풍' },
]

export function ControlPanel({ settings, onChange }: Props) {
  const meter = PATTERNS.find((pattern) => pattern.id === settings.patternId)?.beatsPerBar ?? 4

  return (
    <div className="space-y-3">
      <Section title="연주 방식">
        <Group label="입력">
          <div className="grid grid-cols-2 gap-1.5">
            {MODE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => onChange('mode', option.value)}
                onPointerUp={blurOnPointerUp}
                className={[
                  'rounded-xl border px-2 py-2.5 text-center transition',
                  settings.mode === option.value
                    ? 'border-glow-400 bg-glow-400/15 text-glow-400'
                    : 'border-white/10 bg-white/5 text-white/70 hover:border-white/25',
                ].join(' ')}
              >
                <span className="block text-sm font-semibold">{option.label}</span>
                <span className="block text-[0.6rem] text-white/35">{option.hint}</span>
              </button>
            ))}
          </div>
        </Group>

        <Group label="악기 (내가 치는 소리)">
          <div className="grid grid-cols-2 gap-1.5">
            {INSTRUMENT_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => onChange('instrument', option.value)}
                onPointerUp={blurOnPointerUp}
                className={[
                  'rounded-xl border px-2 py-2.5 text-center transition',
                  settings.instrument === option.value
                    ? 'border-mint-400 bg-mint-400/15 text-mint-400'
                    : 'border-white/10 bg-white/5 text-white/70 hover:border-white/25',
                ].join(' ')}
              >
                <span className="block text-sm font-semibold">{option.label}</span>
                <span className="block text-[0.6rem] text-white/35">{option.hint}</span>
              </button>
            ))}
          </div>
        </Group>

        {settings.mode === 'keyboard' && (
          <Field
            label="건반 옥타브"
            hint={`${noteName(settings.baseMidi % 12, false)}${Math.floor(settings.baseMidi / 12) - 1} 부터`}
          >
            <input
              type="range"
              min={24}
              max={72}
              step={12}
              value={settings.baseMidi}
              onChange={(event) => onChange('baseMidi', Number(event.target.value))}
            />
          </Field>
        )}
      </Section>

      <Section title="조성 · 화성">
        <Field label="키 (조)" hint={`${KEYS[settings.keyIndex].name} 장조`}>
          <select
            className={selectClass}
            value={settings.keyIndex}
            onChange={(event) => onChange('keyIndex', Number(event.target.value))}
          >
            {KEYS.map((key, index) => (
              <option key={key.name} value={index}>
                {key.name} 장조 · 나란한단조 {KEYS[(index + 9) % 12].name}m
              </option>
            ))}
          </select>
        </Field>

        <Group label="화음 색깔">
          <div className="grid grid-cols-4 gap-1.5">
            {COLOR_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => onChange('color', option.value)}
                onPointerUp={blurOnPointerUp}
                className={[
                  'rounded-xl border px-1 py-2 text-center transition',
                  settings.color === option.value
                    ? 'border-glow-400 bg-glow-400/15 text-glow-400'
                    : 'border-white/10 bg-white/5 text-white/70 hover:border-white/25',
                ].join(' ')}
              >
                <span className="block text-xs font-semibold">{option.label}</span>
                <span className="block text-[0.6rem] text-white/35">{option.hint}</span>
              </button>
            ))}
          </div>
        </Group>
      </Section>

      <Section title="반주">
        <Field label="반주 패턴">
          <select
            className={selectClass}
            value={settings.patternId}
            onChange={(event) => onChange('patternId', event.target.value)}
          >
            {PATTERNS.map((pattern) => (
              <option key={pattern.id} value={pattern.id}>
                {pattern.name}
              </option>
            ))}
          </select>
        </Field>
        <p className="-mt-1 text-xs text-white/40">
          {PATTERNS.find((pattern) => pattern.id === settings.patternId)?.description}
        </p>

        <Field
          label="템포"
          hint={`${settings.bpm} BPM · ${meter === 6 ? '6/8' : `${meter}/4`}`}
        >
          <input
            type="range"
            min={40}
            max={160}
            value={settings.bpm}
            onChange={(event) => onChange('bpm', Number(event.target.value))}
          />
        </Field>

        <Toggle
          label="자동 반주"
          description="손은 코드만 고르고, 패턴은 알아서 흐릅니다"
          checked={settings.autoPlay}
          onChange={(value) => onChange('autoPlay', value)}
        />
        <Toggle
          label="메트로놈"
          checked={settings.metronome}
          onChange={(value) => onChange('metronome', value)}
        />

        <Field label="코드 진행 가이드">
          <select
            className={selectClass}
            value={settings.progressionId}
            onChange={(event) => onChange('progressionId', event.target.value)}
          >
            {PROGRESSIONS.map((progression) => (
              <option key={progression.id} value={progression.id}>
                {progression.name}
              </option>
            ))}
          </select>
        </Field>
        <Toggle
          label="진행 자동 넘김"
          description="마디마다 다음 코드로 스스로 넘어갑니다"
          checked={settings.autoAdvance}
          onChange={(value) => onChange('autoAdvance', value)}
        />
      </Section>

      <Section title="사운드">
        <Field label="전체 음량" hint={`${Math.round(settings.volume * 100)}%`}>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(settings.volume * 100)}
            onChange={(event) => onChange('volume', Number(event.target.value) / 100)}
          />
        </Field>
        <Field label="잔향 (예배당 울림)" hint={`${Math.round(settings.reverb * 100)}%`}>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(settings.reverb * 100)}
            onChange={(event) => onChange('reverb', Number(event.target.value) / 100)}
          />
        </Field>
        <Field label="패드 (스트링) 음량" hint={`${Math.round(settings.padLevel * 100)}%`}>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(settings.padLevel * 100)}
            onChange={(event) => onChange('padLevel', Number(event.target.value) / 100)}
          />
        </Field>
      </Section>

      <Section title="화면 · 인식">
        <Toggle
          label="좌우 반전 (거울 모드)"
          description="켜두면 손을 움직인 방향 그대로 화면이 움직입니다"
          checked={settings.mirror}
          onChange={(value) => onChange('mirror', value)}
        />
        <Field label="코드 영역 넓이" hint={`${Math.round(settings.split * 100)}%`}>
          <input
            type="range"
            min={35}
            max={85}
            value={Math.round(settings.split * 100)}
            onChange={(event) => onChange('split', Number(event.target.value) / 100)}
          />
        </Field>
      </Section>
    </div>
  )
}
