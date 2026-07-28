import type { Layout } from '../lib/keymap'

const EASY_KEYS: Array<[string, string]> = [
  ['A S D F G H J K L ;', '도 레 미 파 솔 라 시 도 레 미'],
  ['Q W E R T Y U I O P', '같은 자리, 한 옥타브 위'],
]

const PIANO_KEYS: Array<[string, string]> = [
  ['A S D F G H J K L ;', '흰건반'],
  ['W E · T Y U · O P', '검은건반 (흰건반 사이 그 자리)'],
]

const CONTROLS: Array<[string, string]> = [
  ['X / Z', '옥타브 올리기 / 내리기'],
  ['1 ~ 7', '코드 바꾸기 (누르면 코드도 울립니다)'],
  ['Space', '서스테인 페달 (누르고 있는 동안)'],
  ['Enter', '현재 코드 한 번 치기'],
  ['\\', '자동 반주 시작 / 정지'],
  ['Esc', '모든 소리 정지'],
]

function KeyTable({ rows }: { rows: Array<[string, string]> }) {
  return (
    <dl className="space-y-1.5">
      {rows.map(([keys, meaning]) => (
        <div key={keys} className="flex items-center gap-3 text-xs">
          <dt className="w-40 shrink-0 rounded-lg bg-white/8 px-2 py-1 font-mono text-white/75">
            {keys}
          </dt>
          <dd className="text-white/50">{meaning}</dd>
        </div>
      ))}
    </dl>
  )
}

function Heading({ children }: { children: string }) {
  return (
    <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-white/40">
      {children}
    </h3>
  )
}

export function HelpPanel({ layout }: { layout: Layout }) {
  const easy = layout === 'easy'
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
        {easy ? (
          <>
            손을 <span className="text-glow-400">기본 자리(A S D F …)</span>에 얹으면 바로 도 레
            미입니다. 어떤 조를 골라도 <b className="text-white/80">A는 항상 도</b>라서, 같은
            손가락 순서로 12개 조를 다 연주할 수 있어요. 조에 없는 음은 아예 건반에 없으니{' '}
            <b className="text-white/80">틀린 음이 나오지 않습니다.</b>
          </>
        ) : (
          <>
            실제 피아노와 같은 배치입니다. 기본 자리{' '}
            <span className="text-glow-400">A S D F …</span>가 흰건반, 그 윗줄{' '}
            <span className="text-glow-400">W E T Y U O P</span>가 검은건반이며, 검은건반이
            흰건반 사이 위쪽에 놓입니다.
          </>
        )}
      </p>

      <div className="space-y-4">
        <div className="space-y-2">
          <Heading>건반</Heading>
          <KeyTable rows={easy ? EASY_KEYS : PIANO_KEYS} />
        </div>

        <div className="space-y-2">
          <Heading>그 밖의 키</Heading>
          <KeyTable rows={CONTROLS} />
        </div>

        <div className="rounded-xl border border-mint-400/25 bg-mint-400/8 p-3">
          <p className="text-xs font-semibold text-mint-400">가장 쉬운 시작</p>
          <ol className="mt-1.5 space-y-1 text-xs leading-relaxed text-white/55">
            <li>
              <b className="text-white/80">1.</b> 연주 시작을 누릅니다. 반주가 저절로 흐릅니다.
            </li>
            <li>
              <b className="text-white/80">2.</b> 왼손으로{' '}
              <b className="text-white/80">1 → 5 → 6 → 4</b> 를 한 마디씩 눌러 코드를 바꿉니다.
            </li>
            <li>
              <b className="text-white/80">3.</b> 오른손은{' '}
              <span className="rounded-sm bg-mint-400/80 px-1 text-sanctuary-950">초록색</span>{' '}
              건반만 눌러 보세요. 지금 코드에 어울리는 음이라 무엇을 눌러도 맞습니다.
            </li>
          </ol>
        </div>

        <p className="text-xs leading-relaxed text-white/40">
          코드를 짚는 것도 버거우면 <b className="text-white/60">코드 진행 가이드</b>에서 곡의
          진행을 고르고 <b className="text-white/60">진행 자동 넘김</b>을 켜세요. 코드가
          마디마다 알아서 넘어가고, 멜로디만 치면 됩니다.
          {!easy && (
            <>
              {' '}
              검은건반까지 신경 쓰기 어렵다면 <b className="text-white/60">쉬운 건반</b>으로
              바꾸면 조에 맞는 음만 남습니다.
            </>
          )}
        </p>
      </div>
    </details>
  )
}
