import type { PlayMode } from './ControlPanel'

interface Row {
  icon: string
  title: string
  body: string
}

const CHORD_HAND: Row[] = [
  {
    icon: '👋',
    title: '왼쪽 영역에서 좌우로',
    body: '화면 왼쪽 7칸이 그 조의 1도~7도 코드입니다. 손을 얹은 칸이 현재 코드가 됩니다.',
  },
  {
    icon: '↕️',
    title: '위아래로',
    body: '손을 높이 들수록 세게, 낮출수록 여리게. 찬양이 고조될 때 손을 들어 올리세요.',
  },
  {
    icon: '🤏',
    title: '엄지+검지 붙이기',
    body: '그 자리에서 코드를 한 번 딱 쳐 줍니다. 자동 반주 중에도 강세를 넣을 수 있어요.',
  },
  {
    icon: '✊',
    title: '주먹',
    body: '모든 소리를 즉시 멈춥니다. 기도나 멘트 시간에 쓰세요.',
  },
]

const MELODY_HAND: Row[] = [
  {
    icon: '🎵',
    title: '오른쪽 영역에서 위아래로',
    body: '사다리 한 칸이 한 음입니다. 조의 5음 음계로 맞춰 두어 어떤 코드 위에서도 안 틀립니다.',
  },
  {
    icon: '🤏',
    title: '엄지+검지 붙이기',
    body: '붙이고 있는 동안 소리가 납니다. 떼면 멈춰요. 붙인 채 위아래로 움직이면 이어서 연주됩니다.',
  },
]

const KEYBOARD: Array<[string, string]> = [
  ['A S D F G H J K L ;', '흰건반 (도 레 미 파 솔 라 시 도 레 미)'],
  ['W E · T Y U · O P', '검은건반 (흰건반 사이 그 자리 그대로)'],
  ['X', '옥타브 ↑'],
  ['Z', '옥타브 ↓'],
  ['Space', '서스테인 페달 (누르고 있는 동안)'],
  ['1 ~ 7', '반주 코드 1도~7도 바로 선택'],
  ['Enter', '현재 코드 한 번 치기'],
  ['\\', '자동 반주 시작 / 정지'],
  ['Esc', '모든 소리 정지'],
]

function List({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-white/40">
        {title}
      </h3>
      <ul className="space-y-2">
        {rows.map((row) => (
          <li key={row.title} className="flex gap-3 rounded-xl bg-white/[0.04] p-3">
            <span className="text-xl leading-none">{row.icon}</span>
            <span>
              <span className="block text-sm font-semibold text-white/85">{row.title}</span>
              <span className="block text-xs leading-relaxed text-white/50">{row.body}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function HelpPanel({ mode }: { mode: PlayMode }) {
  const keyboardMode = mode === 'keyboard'
  return (
    <details
      open
      className="group space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4 [&[open]>summary>span:last-child]:rotate-180"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
        <span className="text-lg font-bold text-white">연주 방법</span>
        <span className="text-xs text-white/40 transition-transform">▾</span>
      </summary>

      <p className="mt-2 mb-4 text-xs leading-relaxed text-white/50">
        {keyboardMode ? (
          <>
            손을 <span className="text-glow-400">기본 자리(A S D F …)</span>에 그대로 얹으면
            흰건반, 그 윗줄 <span className="text-glow-400">W E T Y U O P</span>가
            검은건반입니다. 실제 피아노처럼 검은건반이 흰건반 사이 위쪽에 놓여 있어요. 손이 자판
            위를 돌아다닐 일이 없습니다. 화면의 건반을 마우스로 눌러도 소리가 납니다.
          </>
        ) : (
          <>
            화면은 왼쪽 <span className="text-glow-400">코드 영역</span>과 오른쪽{' '}
            <span className="text-mint-400">멜로디 영역</span>으로 나뉩니다. 어느 손이든 영역에
            들어간 손이 그 역할을 맡습니다. 한 손만으로도 연주할 수 있어요.
          </>
        )}
      </p>

      <div className="space-y-4">
        {!keyboardMode && (
          <>
            <List title="코드 영역 · 왼쪽" rows={CHORD_HAND} />
            <List title="멜로디 영역 · 오른쪽" rows={MELODY_HAND} />
          </>
        )}

        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-white/40">
            {keyboardMode ? '키보드 배치' : '키보드 (카메라 없이)'}
          </h3>
          <dl className="space-y-1.5">
            {KEYBOARD.map(([keys, meaning]) => (
              <div key={keys} className="flex items-center gap-3 text-xs">
                <dt className="w-40 shrink-0 rounded-lg bg-white/8 px-2 py-1 font-mono text-white/75">
                  {keys}
                </dt>
                <dd className="text-white/50">{meaning}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="rounded-xl border border-mint-400/25 bg-mint-400/8 p-3">
          <p className="text-xs font-semibold text-mint-400">반주 팁</p>
          <p className="mt-1 text-xs leading-relaxed text-white/55">
            {keyboardMode ? (
              <>
                <b className="text-white/80">자동 반주</b>를 켜고 왼손으로{' '}
                <b className="text-white/80">1~7</b>만 눌러 코드를 바꾸면, 오른손은 멜로디에만
                집중할 수 있습니다. 흰건반에 찍힌 점이 지금 조성의 음이라 그 점만 밟아도 곡이
                됩니다. 지속되는 소리가 필요하면 <b className="text-white/80">신디</b>로 바꿔
                보세요.
              </>
            ) : (
              <>
                찬양 인도자를 따라갈 때는 <b className="text-white/80">자동 반주</b>를 켜고
                코드만 짚어 주세요. 간주에서는 <b className="text-white/80">진행 자동 넘김</b>을
                켜면 손이 자유로워져 멜로디에 집중할 수 있습니다.
              </>
            )}
          </p>
        </div>
      </div>
    </details>
  )
}
