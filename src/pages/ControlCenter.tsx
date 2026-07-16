import { memo, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight, Maximize2, Minimize2, RotateCw } from 'lucide-react'
import SiteMap from '../components/SiteMap'
import Sparkline from '../components/Sparkline'
import { Card, SeverityBadge } from '../components/ui'
import {
  assessZoneRisks,
  beaconRows,
  controlKpi,
  emergencyRows,
  gasDetectors,
  gasMetrics,
  gasSeverity,
  genGasHistory,
  liveWorkers,
  portableGasDetectors,
  trackerRows,
  workItems,
  zoneAlarmStats,
} from '../data/site'
import type { GasLevel, GasMetricKey } from '../data/site'
import { sensors } from '../data/mock'

/** 검침기별 5종 가스 히스토리 (스파크라인용 최근 60초) */
type GasHists = Record<GasMetricKey, number[]>

const th = 'px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-muted whitespace-nowrap'
const td = 'px-3 py-2 whitespace-nowrap text-[13px]'

/* ═══ 접기/펼치기 그룹 섹션 ═══
 * 관리자가 필요 없는 그룹을 접어 원하는 데이터(지도·테이블)를 부각할 수 있다.
 * 접힘 상태는 localStorage에 보존. right 슬롯은 접힌 상태에서도 노출된다. */
function Section({
  id,
  title,
  right,
  card = true,
  children,
}: {
  id: string
  title: string
  right?: ReactNode
  card?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(() => localStorage.getItem(`cc-sec-${id}`) !== '0')
  const toggle = () =>
    setOpen((v) => {
      localStorage.setItem(`cc-sec-${id}`, v ? '0' : '1')
      return !v
    })
  return (
    <div
      className={`flex shrink-0 flex-col ${
        card ? 'rounded-[14px] border border-hairline bg-surface-1' : ''
      }`}
    >
      <div className={`flex items-center gap-2 py-2 ${card ? 'px-4' : 'px-1'}`}>
        <button
          onClick={toggle}
          aria-expanded={open}
          title={open ? '접기' : '펼치기'}
          className="flex min-w-0 cursor-pointer items-center gap-1.5 text-xs font-semibold text-muted transition-colors hover:text-ink"
        >
          <ChevronDown
            size={13}
            className={`shrink-0 transition-transform ${open ? '' : '-rotate-90'}`}
          />
          <span className="truncate">{title}</span>
        </button>
        <div className="ml-auto flex items-center gap-2">{right}</div>
      </div>
      {open && children}
    </div>
  )
}

/* ═══ KPI 상태 보드 — 정적(30초 주기 재조회 지점), memo로 격리 ═══
 * 단일 카드 + 헤어라인 구분선으로 평탄화 (박스 중첩 제거).
 * 위험 계열 색상은 값이 0보다 클 때만 적용해 실제 경보만 눈에 띄게 한다. */
const KPI_REFRESH = 30

const KPI_GROUPS: Array<{
  title: string
  boxes: Array<{ name: string; value: number; alert?: 'critical' | 'serious' }>
}> = [
  {
    title: '위급 상황',
    boxes: [
      { name: '심박 위험', value: controlKpi.heartAlarm, alert: 'critical' },
      { name: '유해가스 위험', value: controlKpi.gasAlarm, alert: 'critical' },
      { name: 'SOS 신호', value: controlKpi.sosAlarm, alert: 'critical' },
    ],
  },
  {
    title: '위험 작업',
    boxes: [
      { name: '위험 작업', value: controlKpi.riskWork, alert: 'serious' },
      { name: '입조 작업자', value: controlKpi.confined },
    ],
  },
  {
    title: '전체 작업자 현황',
    boxes: [
      { name: '잔류 작업자', value: controlKpi.remain },
      { name: '전체 입실자', value: controlKpi.totalIn },
      { name: '전체 퇴실자', value: controlKpi.totalOut },
    ],
  },
]

/* 30초 재조회 카운트다운 — KPI 스트립 우상단에 공통 표기, 자체 타이머로 격리 */
function RefreshCountdown() {
  const left = () => KPI_REFRESH - (Math.floor(Date.now() / 1000) % KPI_REFRESH)
  const [sec, setSec] = useState(left)
  useEffect(() => {
    const t = setInterval(() => setSec(left()), 1000)
    return () => clearInterval(t)
  }, [])
  return (
    <span
      className="flex shrink-0 items-center gap-1 text-[10px] text-muted"
      title={`${KPI_REFRESH}초 주기 자동 갱신`}
    >
      <RotateCw size={10} />
      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{sec}초 후 갱신</span>
    </span>
  )
}

const KpiBoard = memo(function KpiBoard() {
  return (
    <Section id="kpi" title="안전 KPI" right={<RefreshCountdown />}>
      <div className="@container flex divide-x divide-hairline pb-4 pt-1">
        {KPI_GROUPS.map((g) => (
          <div
            key={g.title}
            className="flex min-w-0 flex-col px-4"
            style={{ flexGrow: g.boxes.length, flexBasis: 0 }}
          >
            <p className="truncate text-xs font-semibold text-muted">{g.title}</p>
            <div className="mt-3 flex flex-1 items-center">
              {g.boxes.map((b) => (
                <div key={b.name} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                  <span className="max-w-full truncate text-xs text-ink-2">{b.name}</span>
                  <span
                    className={`text-xl font-bold leading-tight @[540px]:text-2xl @[720px]:text-3xl ${
                      b.alert && b.value > 0
                        ? b.alert === 'critical'
                          ? 'text-critical'
                          : 'text-serious'
                        : 'text-ink'
                    }`}
                    style={{ fontVariantNumeric: 'tabular-nums' }}
                  >
                    {b.value.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Section>
  )
})

/* ═══ 고정가스검침기 패널 — 자체 1초 타이머 (부분 갱신), 페이지네이션 ═══ */
const GAS_PER_PAGE = 3

function GasCard({ name, hist }: { name: string; hist: GasHists }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1.5 px-3">
      <span className="truncate text-xs font-semibold text-ink">{name}</span>
      {gasMetrics.map((m) => {
        const data = hist[m.key]
        const v = data[data.length - 1]
        return (
          <div key={m.key} className="flex items-center gap-2 rounded-[8px] bg-page/60 px-2 py-1">
            <span className="w-8 shrink-0 text-[10px] text-muted">{m.label}</span>
            <Sparkline data={data} color={m.color} height={18} min={m.min} max={m.max} />
            <span
              className="w-14 shrink-0 text-right text-sm font-bold leading-none"
              style={{ color: m.color, fontVariantNumeric: 'tabular-nums' }}
            >
              {v.toFixed(1)}
              <span className="ml-0.5 text-[9px] font-normal text-muted">{m.unit}</span>
            </span>
          </div>
        )
      })}
    </div>
  )
}

/* 전체보기 대시보드 — 모든 검침기를 페이지네이션 없이 큰 카드로 노출 */
function GasFullscreen({
  hists,
  time,
  onClose,
}: {
  hists: GasHists[]
  time: string
  onClose: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex flex-col gap-3 bg-page p-5">
      <div className="flex shrink-0 items-center justify-between">
        <div className="flex items-baseline gap-2">
          <h2 className="text-lg font-semibold text-ink">고정형 가스검침기 전체 현황</h2>
          <span className="text-xs text-muted">{gasDetectors.length}대 · 1초 갱신</span>
        </div>
        <div className="flex items-center gap-3">
          {time && <span className="font-mono text-xs text-muted">{time}</span>}
          <button
            onClick={onClose}
            className="flex size-8 cursor-pointer items-center justify-center rounded-lg border border-hairline text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
            aria-label="전체 화면 종료"
            title="전체 화면 종료 (ESC)"
          >
            <Minimize2 size={15} />
          </button>
        </div>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-1 content-start gap-3 overflow-y-auto md:grid-cols-2 xl:grid-cols-3">
        {gasDetectors.map((g, i) => {
          const cur = Object.fromEntries(
            gasMetrics.map((m) => [m.key, hists[i][m.key][hists[i][m.key].length - 1]]),
          ) as Record<GasMetricKey, number>
          return (
            <div key={g.id} className="flex flex-col gap-2 rounded-[14px] border border-hairline bg-surface-1 p-4">
              <div className="mb-1 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink">{g.name}</p>
                  <p className="mt-0.5 font-mono text-[10px] text-muted">{g.id}</p>
                </div>
                <SeverityBadge severity={gasSeverity(cur)} />
              </div>
              {gasMetrics.map((m) => (
                <div key={m.key} className="flex items-center gap-3 rounded-[10px] bg-page/60 px-3 py-1.5">
                  <span className="w-10 shrink-0 text-[11px] text-muted">{m.label}</span>
                  <Sparkline data={hists[i][m.key]} color={m.color} height={30} min={m.min} max={m.max} />
                  <span
                    className="w-20 shrink-0 text-right text-xl font-bold leading-none"
                    style={{ color: m.color, fontVariantNumeric: 'tabular-nums' }}
                  >
                    {cur[m.key].toFixed(1)}
                    <span className="ml-0.5 text-[10px] font-normal text-muted">{m.unit}</span>
                  </span>
                </div>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}

const GAS_ROTATE_SEC = 5

function GasPanel() {
  const [hists, setHists] = useState<GasHists[]>(() =>
    gasDetectors.map(
      (g) =>
        Object.fromEntries(gasMetrics.map((m) => [m.key, genGasHistory(g[m.key], m.jitter)])) as GasHists,
    ),
  )
  const [time, setTime] = useState('')
  const [page, setPage] = useState(0)
  const [full, setFull] = useState(false)
  const [paused, setPaused] = useState(false)
  const pages = Math.ceil(gasDetectors.length / GAS_PER_PAGE)
  const start = page * GAS_PER_PAGE
  const visible = gasDetectors.slice(start, start + GAS_PER_PAGE)

  useEffect(() => {
    const t = setInterval(() => {
      setHists((prev) =>
        prev.map(
          (h, i) =>
            Object.fromEntries(
              gasMetrics.map((m) => [
                m.key,
                [...h[m.key].slice(1), Math.max(0, gasDetectors[i][m.key] + (Math.random() - 0.5) * m.jitter)],
              ]),
            ) as GasHists,
        ),
      )
      setTime(new Date().toTimeString().slice(0, 8))
    }, 1000)
    return () => clearInterval(t)
  }, [])

  /* 슬라이드 자동 순환 — 마우스를 올려 읽는 동안·전체보기 중에는 정지,
   * 수동 이동 시에도 page가 deps에 있어 타이머가 5초부터 다시 시작된다 */
  useEffect(() => {
    if (pages <= 1 || paused || full) return
    const t = setInterval(() => setPage((p) => (p + 1) % pages), GAS_ROTATE_SEC * 1000)
    return () => clearInterval(t)
  }, [pages, paused, full, page])

  const pagerBtn =
    'flex size-6 cursor-pointer items-center justify-center rounded-md text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink disabled:cursor-default disabled:opacity-30'

  return (
    <>
      <Section
        id="gas"
        title={`고정형 가스검침기 (${gasDetectors.length})`}
        right={
          <>
            {time && <span className="font-mono text-[10px] text-muted">{time}</span>}
            <button
              onClick={() => setFull(true)}
              className="flex h-6 cursor-pointer items-center gap-1 rounded-md px-1.5 text-[11px] font-medium text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
              title="전체 화면 대시보드"
            >
              <Maximize2 size={11} />
              전체보기
            </button>
          </>
        }
      >
        <div onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
          <div className="flex divide-x divide-hairline pb-3 pt-1">
            {visible.map((g, vi) => (
              <GasCard key={g.id} name={g.name} hist={hists[start + vi]} />
            ))}
            {/* 마지막 페이지에서 칸 수가 모자라도 카드 폭이 흔들리지 않게 자리 유지 */}
            {Array.from({ length: GAS_PER_PAGE - visible.length }).map((_, i) => (
              <div key={`ph-${i}`} className="min-w-0 flex-1 px-3" aria-hidden />
            ))}
          </div>
          {/* 하단 페이지네이션 — 자동 순환(5초) + 수동 이동, 검침기가 페이지당 수(3)를 넘을 때만 노출 */}
          {pages > 1 && (
            <div className="flex items-center justify-center gap-1 border-t border-hairline py-1.5">
              <button
                onClick={() => setPage((p) => (p - 1 + pages) % pages)}
                className={pagerBtn}
                aria-label="이전 페이지"
              >
                <ChevronLeft size={13} />
              </button>
              <span className="flex items-center gap-1.5 px-1">
                {Array.from({ length: pages }).map((_, p) => (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    aria-label={`${p + 1}페이지`}
                    className={`size-1.5 cursor-pointer rounded-full transition-colors ${
                      p === page ? 'bg-primary' : 'bg-hairline hover:bg-muted'
                    }`}
                  />
                ))}
              </span>
              <button
                onClick={() => setPage((p) => (p + 1) % pages)}
                className={pagerBtn}
                aria-label="다음 페이지"
              >
                <ChevronRight size={13} />
              </button>
            </div>
          )}
        </div>
      </Section>
      {full && <GasFullscreen hists={hists} time={time} onClose={() => setFull(false)} />}
    </>
  )
}

/* ═══ 작업자 탭 — 바이탈(심박)만 자체 2초 타이머로 갱신 ═══ */
function WorkerTable() {
  const [heartbeats, setHeartbeats] = useState<Record<number, number>>({})

  useEffect(() => {
    const t = setInterval(() => {
      setHeartbeats(
        Object.fromEntries(
          liveWorkers.map((w) => [w.id, Math.max(60, Math.round(w.heartRate + (Math.random() - 0.5) * 6))]),
        ),
      )
    }, 2000)
    return () => clearInterval(t)
  }, [])

  return (
    <table className="w-full min-w-[860px]">
      <thead className="sticky top-0 bg-surface-1">
        <tr className="border-b border-hairline">
          {['작업자', '소속', '작업 공간', '작업 구역', '입실시간', '퇴실시간', '입/퇴', '심박수 (bpm)', '피부온도 (℃)', '수신시간'].map((h) => (
            <th key={h} className={th}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-hairline">
        {liveWorkers.map((w) => (
          <tr key={w.id} className={`hover:bg-surface-2/40 ${w.danger ? 'text-critical' : 'text-ink-2'}`}>
            <td className={`${td} font-medium ${w.danger ? '' : 'text-ink'}`}>
              {w.danger && '● '}
              {w.name}
            </td>
            <td className={td}>{w.vendor}</td>
            <td className={td}>{w.space}</td>
            <td className={td}>{w.zone}</td>
            <td className={`${td} font-mono`}>{w.inTime}</td>
            <td className={`${td} font-mono`}>{w.outTime ?? '-'}</td>
            <td className={td}>{w.outTime ? '퇴장' : '입장'}</td>
            <td className={`${td} font-mono`}>{w.outTime ? '-' : heartbeats[w.id] ?? w.heartRate}</td>
            <td className={`${td} font-mono`}>{w.outTime ? '-' : w.skinTemp.toFixed(1)}</td>
            <td className={`${td} font-mono text-muted`}>2026.07.14 (13:45)</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/* ═══ 정적 탭 테이블 ═══ */
const WorkListTable = memo(function WorkListTable() {
  const riskColor = { 상: 'text-critical', 중: 'text-serious', 하: 'text-good' }
  return (
    <table className="w-full min-w-[860px]">
      <thead className="sticky top-0 bg-surface-1">
        <tr className="border-b border-hairline">
          {['작업명', '위험도', '작업 종류', '작업 공간', '작업 구역', '작업자', '작업예정일시', '작업시작일시', '작업 상태'].map((h) => (
            <th key={h} className={th}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-hairline text-ink-2">
        {workItems.map((w) => (
          <tr key={w.name} className="hover:bg-surface-2/40">
            <td className={`${td} font-medium text-ink`}>{w.name}</td>
            <td className={`${td} font-semibold ${riskColor[w.risk]}`}>{w.risk}</td>
            <td className={td}>{w.type}</td>
            <td className={td}>{w.space}</td>
            <td className={td}>{w.zone}</td>
            <td className={td}>{w.workers}</td>
            <td className={`${td} font-mono`}>{w.planDt}</td>
            <td className={`${td} font-mono`}>{w.startDt}</td>
            <td className={`${td} ${w.status === '작업중' ? 'text-good' : w.status === '완료' ? 'text-muted' : ''}`}>{w.status}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
})

const BeaconTable = memo(function BeaconTable() {
  return (
    <table className="w-full min-w-[760px]">
      <thead className="sticky top-0 bg-surface-1">
        <tr className="border-b border-hairline">
          {['이름', 'Major', 'Minor', '작업 공간', '작업 구역', '사용여부', '수신 시간'].map((h) => (
            <th key={h} className={th}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-hairline text-ink-2">
        {beaconRows.map((b) => (
          <tr key={b.name} className="hover:bg-surface-2/40">
            <td className={`${td} font-mono text-ink`}>{b.name}</td>
            <td className={`${td} font-mono`}>{b.major}</td>
            <td className={`${td} font-mono`}>{b.minor}</td>
            <td className={td}>{b.space}</td>
            <td className={td}>{b.zone}</td>
            <td className={`${td} text-good`}>{b.use ? '사용' : '미사용'}</td>
            <td className={`${td} font-mono text-muted`}>{b.scanDt}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
})

/* ═══ 이동형 가스검침기 — 작업자가 휴대, 이동하며 구역 환경 데이터 취합 ═══ */
const PortableGasTable = memo(function PortableGasTable() {
  return (
    <table className="w-full min-w-[860px]">
      <thead className="sticky top-0 bg-surface-1">
        <tr className="border-b border-hairline">
          {['이름', '휴대 작업자', '작업 구역', 'O₂ (%)', 'H₂S (PPM)', 'CO (PPM)', 'NH₃ (PPM)', 'CH₄ (%LEL)', '판정', '수신 시간'].map((h) => (
            <th key={h} className={th}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-hairline text-ink-2">
        {portableGasDetectors.map((p) => {
          const w = liveWorkers.find((lw) => lw.id === p.workerId)
          return (
            <tr key={p.id} className="hover:bg-surface-2/40">
              <td className={`${td} font-mono text-ink`}>{p.id}</td>
              <td className={td}>{w?.name ?? '-'}</td>
              <td className={td}>{w?.zone ?? '-'}</td>
              <td className={`${td} font-mono`}>{p.o2.toFixed(1)}</td>
              <td className={`${td} font-mono`}>{p.h2s.toFixed(1)}</td>
              <td className={`${td} font-mono`}>{p.co.toFixed(1)}</td>
              <td className={`${td} font-mono`}>{p.nh3.toFixed(1)}</td>
              <td className={`${td} font-mono`}>{p.ch4.toFixed(1)}</td>
              <td className={td}><SeverityBadge severity={gasSeverity(p)} /></td>
              <td className={`${td} font-mono text-muted`}>2026.07.14 (13:45)</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
})

const TrackerTable = memo(function TrackerTable() {
  return (
    <table className="w-full min-w-[720px]">
      <thead className="sticky top-0 bg-surface-1">
        <tr className="border-b border-hairline">
          {['이름', '작업자명', 'SOS ON', '배터리 (%)', '사용여부', '수신 시간'].map((h) => (
            <th key={h} className={th}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-hairline text-ink-2">
        {trackerRows.map((t) => (
          <tr key={t.name} className="hover:bg-surface-2/40">
            <td className={`${td} font-mono text-ink`}>{t.name}</td>
            <td className={td}>{t.worker}</td>
            <td className={`${td} ${t.sos ? 'font-semibold text-critical' : ''}`}>{t.sos ? 'ON' : 'OFF'}</td>
            <td className={`${td} font-mono ${t.battery <= 20 ? 'text-serious' : ''}`}>{t.battery}</td>
            <td className={`${td} text-good`}>{t.use ? '사용' : '미사용'}</td>
            <td className={`${td} font-mono text-muted`}>{t.lastDt}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
})

/* ═══ 탭 그리드 (탭 전환만 이 컴포넌트 안에서 처리) ═══ */
const TABS = ['작업자', '이동형 검침기', '작업 목록', '고정형 비콘', '트래커'] as const
type Tab = (typeof TABS)[number]

const TAB_COUNTS: Record<Tab, number> = {
  작업자: liveWorkers.length,
  '이동형 검침기': portableGasDetectors.length,
  '작업 목록': workItems.length,
  '고정형 비콘': beaconRows.length,
  트래커: trackerRows.length,
}

function TabGrid() {
  const [tab, setTab] = useState<Tab>('작업자')
  return (
    <Card className="flex min-h-0 flex-1 flex-col !p-0">
      <div className="flex items-center gap-1 overflow-x-auto border-b border-hairline px-3 py-2">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`h-9 shrink-0 cursor-pointer whitespace-nowrap rounded-lg px-3.5 text-[13px] font-medium transition-colors ${
              tab === t ? 'bg-primary text-white' : 'text-ink-2 hover:bg-surface-2'
            }`}
          >
            {t}
          </button>
        ))}
        <span className="ml-auto shrink-0 whitespace-nowrap pl-2 text-[11px] text-muted">
          Results : {TAB_COUNTS[tab]}
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {tab === '작업자' && <WorkerTable />}
        {tab === '이동형 검침기' && <PortableGasTable />}
        {tab === '작업 목록' && <WorkListTable />}
        {tab === '고정형 비콘' && <BeaconTable />}
        {tab === '트래커' && <TrackerTable />}
      </div>
    </Card>
  )
}

/* 구역 위험도 등급 칩 — 환경(가스) 데이터 판정 결과 */
const RISK_META: Record<GasLevel, { label: string; cls: string }> = {
  critical: { label: '위험', cls: 'bg-critical/10 text-critical border-critical/35' },
  warning: { label: '주의', cls: 'bg-warning/10 text-warning border-warning/35' },
  good: { label: '정상', cls: 'bg-good/10 text-good border-good/35' },
}

/* ═══ 하단 패널 — 정적, memo 격리 ═══ */
const BottomPanels = memo(function BottomPanels() {
  const lowSensors = sensors.filter((s) => s.state !== '정상')
  const zoneRisks = assessZoneRisks()
  const total = zoneAlarmStats.reduce((a, b) => a + b.count, 0)
  const colors = ['var(--series-1)', 'var(--series-3)', 'var(--series-4)', 'var(--series-5)']
  const R = 40
  const C = 2 * Math.PI * R
  let acc = 0

  return (
    <Section id="bottom" title="상세 현황 패널" card={false}>
      <div className="grid h-[230px] grid-cols-1 gap-3 xl:grid-cols-4">
      <Card
        title="구역별 위험도"
        action={
          <span className="whitespace-nowrap text-[10px] text-muted">고정형·이동형 검침 기반</span>
        }
        className="flex flex-col overflow-hidden !pb-2"
      >
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full">
            <thead className="sticky top-0 bg-surface-1">
              <tr className="border-b border-hairline">
                {['작업 구역', '판정', '판정 근거'].map((h) => (
                  <th key={h} className={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline text-ink-2">
              {zoneRisks.map((r) => (
                <tr key={r.zone} className="hover:bg-surface-2/40">
                  <td className={`${td} font-medium text-ink`}>{r.zone}</td>
                  <td className={td}>
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${RISK_META[r.level].cls}`}
                    >
                      {RISK_META[r.level].label}
                    </span>
                  </td>
                  <td
                    className={`${td} max-w-44 truncate ${r.level === 'good' ? 'text-muted' : ''}`}
                    title={r.cause ?? undefined}
                  >
                    {r.cause ?? `고정 ${r.fixedCount} · 이동 ${r.portableCount} · 작업자 ${r.workerCount}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="배터리 및 상태 이상 IoT 센서 현황" className="flex flex-col overflow-hidden !pb-2">
        <div className="min-h-0 flex-1 overflow-auto">
          {lowSensors.length ? (
            <table className="w-full">
              <thead className="sticky top-0 bg-surface-1">
                <tr className="border-b border-hairline">
                  {['장비', '장비명', '영역', '배터리 (%)'].map((h) => (
                    <th key={h} className={th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline text-ink-2">
                {lowSensors.map((s) => (
                  <tr key={s.id}>
                    <td className={td}>{s.type}</td>
                    <td className={`${td} font-mono text-ink`}>{s.id}</td>
                    <td className={td}>{s.zone}</td>
                    <td className={`${td} font-mono ${s.battery <= 20 ? 'text-critical' : 'text-serious'}`}>{s.battery}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="py-10 text-center text-sm text-muted">조회된 데이터가 없습니다.</p>
          )}
        </div>
      </Card>

      <Card title="위급 상황 현황" className="flex flex-col overflow-hidden !pb-2">
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full">
            <thead className="sticky top-0 bg-surface-1">
              <tr className="border-b border-hairline">
                {['대상', '영역', '위급 상황', '발생 시간', '조치'].map((h) => (
                  <th key={h} className={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline text-ink-2">
              {emergencyRows.map((e, i) => (
                <tr key={i}>
                  <td className={`${td} max-w-40 truncate text-ink`}>{e.worker}</td>
                  <td className={`${td} max-w-36 truncate`}>{e.area}</td>
                  <td className={`${td} ${e.type === '심박 위험' ? 'text-critical' : 'text-serious'}`}>{e.type}</td>
                  <td className={`${td} font-mono`}>{e.time}</td>
                  <td className={`${td} ${e.action === '완료' ? 'text-muted' : 'text-serious'}`}>{e.action}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="구역별 알림 현황" className="overflow-hidden">
        <div className="flex h-full items-center justify-center gap-5">
          <svg viewBox="0 0 110 110" className="h-32 w-32 shrink-0">
            {zoneAlarmStats.map((z, i) => {
              const frac = z.count / total
              const dash = `${frac * C} ${C}`
              const offset = -acc * C
              acc += frac
              return (
                <circle
                  key={z.zone}
                  cx="55"
                  cy="55"
                  r={R}
                  fill="none"
                  stroke={colors[i % colors.length]}
                  strokeWidth="14"
                  strokeDasharray={dash}
                  strokeDashoffset={offset}
                  transform="rotate(-90 55 55)"
                />
              )
            })}
            <text x="55" y="52" textAnchor="middle" fontSize="18" fontWeight="700" fill="var(--text-primary)">
              {total}
            </text>
            <text x="55" y="68" textAnchor="middle" fontSize="9" fill="var(--text-muted)">
              오늘 알림
            </text>
          </svg>
          <ul className="flex flex-col gap-1.5">
            {zoneAlarmStats.map((z, i) => (
              <li key={z.zone} className="flex items-center gap-2 text-xs text-ink-2">
                <span className="size-2 rounded-full" style={{ background: colors[i % colors.length] }} />
                {z.zone}
                <span className="ml-1 font-semibold text-ink" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {z.count}건
                </span>
              </li>
            ))}
          </ul>
        </div>
      </Card>
      </div>
    </Section>
  )
})

/* ═══ 통합 관제 상황판 ═══
 * 페이지 자체는 상태를 갖지 않는다 — 각 위젯(지도 1s, 가스 1s, 바이탈 2s)이
 * 자체 타이머로 부분 갱신되며, 나머지는 memo로 격리되어 리렌더링되지 않는다. */
export default function ControlCenter() {
  return (
    <div className="flex min-h-full flex-col gap-3">
      <div className="flex min-h-[600px] flex-1 gap-3">
        <Card className="flex w-[55%] min-w-[520px] flex-col !p-3">
          <SiteMap />
        </Card>
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <KpiBoard />
          <GasPanel />
          <TabGrid />
        </div>
      </div>
      <BottomPanels />
    </div>
  )
}
