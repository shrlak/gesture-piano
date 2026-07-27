import type { ReactNode } from 'react'
import { KEYS, PROGRESSIONS, type ChordColor } from '../lib/theory'
import { PATTERNS } from '../lib/patterns'

export interface Settings {
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

        <Field label="화음 색깔">
          <div className="grid grid-cols-4 gap-1.5">
            {COLOR_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => onChange('color', option.value)}
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
        </Field>
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
