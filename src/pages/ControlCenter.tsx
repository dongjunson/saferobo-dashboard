import { memo, useEffect, useState } from 'react'
import SiteMap from '../components/SiteMap'
import Sparkline from '../components/Sparkline'
import { Card } from '../components/ui'
import {
  beaconRows,
  controlKpi,
  emergencyRows,
  gasDetectors,
  genGasHistory,
  liveWorkers,
  trackerRows,
  workItems,
  zoneAlarmStats,
} from '../data/site'
import { sensors } from '../data/mock'

const O2_COLOR = '#22d3ee' // 레거시: O₂ 시안
const H2S_COLOR = '#a78bfa' // 레거시: H₂S 보라

const th = 'px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-muted whitespace-nowrap'
const td = 'px-3 py-2 whitespace-nowrap text-[13px]'

/* ═══ KPI 상태 보드 — 정적(30초 주기 재조회 지점), memo로 격리 ═══ */
const StatusGroup = memo(function StatusGroup({
  title,
  boxes,
}: {
  title: string
  boxes: Array<{ name: string; value: number; color: string }>
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col rounded-[14px] border border-hairline bg-surface-1 px-4 py-3">
      <p className="mb-2 text-xs font-semibold text-muted">{title}</p>
      <div className="flex flex-1 items-center gap-2">
        {boxes.map((b) => (
          <div key={b.name} className="flex min-w-0 flex-1 flex-col items-center rounded-[10px] bg-page/60 px-1 py-2">
            <span className="truncate text-[11px] text-ink-2">{b.name}</span>
            <span className={`text-2xl font-bold leading-tight ${b.color}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
              {b.value.toLocaleString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
})

const KpiBoard = memo(function KpiBoard() {
  return (
    <div className="flex gap-3">
      <StatusGroup
        title="위급 상황"
        boxes={[
          { name: '심박 위험', value: controlKpi.heartAlarm, color: 'text-critical' },
          { name: '유해가스 위험', value: controlKpi.gasAlarm, color: 'text-critical' },
          { name: 'SOS 신호', value: controlKpi.sosAlarm, color: 'text-critical' },
        ]}
      />
      <StatusGroup
        title="위험 작업"
        boxes={[
          { name: '위험 작업', value: controlKpi.riskWork, color: 'text-serious' },
          { name: '입조 작업자', value: controlKpi.confined, color: 'text-ink' },
        ]}
      />
      <StatusGroup
        title="전체 작업자 현황"
        boxes={[
          { name: '잔류 작업자', value: controlKpi.remain, color: 'text-ink' },
          { name: '전체 입실자', value: controlKpi.totalIn, color: 'text-ink' },
          { name: '전체 퇴실자', value: controlKpi.totalOut, color: 'text-muted' },
        ]}
      />
    </div>
  )
})

/* ═══ 고정가스검침기 패널 — 자체 1초 타이머 (부분 갱신) ═══ */
function GasCard({
  name,
  o2,
  h2s,
  o2Hist,
  h2sHist,
  time,
}: {
  name: string
  o2: number
  h2s: number
  o2Hist: number[]
  h2sHist: number[]
  time: string
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2 rounded-[14px] border border-hairline bg-surface-1 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-xs font-semibold text-ink">{name}</span>
        <span className="shrink-0 font-mono text-[10px] text-muted">{time}</span>
      </div>
      <div className="flex items-center gap-2 rounded-[10px] bg-page/60 px-2.5 py-1.5">
        <div className="w-20 shrink-0">
          <span className="text-[10px] text-muted">O₂</span>
          <div className="text-xl font-bold leading-tight" style={{ color: O2_COLOR, fontVariantNumeric: 'tabular-nums' }}>
            {o2.toFixed(1)}
            <span className="ml-0.5 text-[10px] font-normal text-muted">%</span>
          </div>
        </div>
        <Sparkline data={o2Hist} color={O2_COLOR} height={34} min={18} max={23} />
      </div>
      <div className="flex items-center gap-2 rounded-[10px] bg-page/60 px-2.5 py-1.5">
        <div className="w-20 shrink-0">
          <span className="text-[10px] text-muted">H₂S</span>
          <div className="text-xl font-bold leading-tight" style={{ color: H2S_COLOR, fontVariantNumeric: 'tabular-nums' }}>
            {h2s.toFixed(1)}
            <span className="ml-0.5 text-[10px] font-normal text-muted">PPM</span>
          </div>
        </div>
        <Sparkline data={h2sHist} color={H2S_COLOR} height={34} min={0} max={4} />
      </div>
    </div>
  )
}

function GasPanel() {
  const [hists, setHists] = useState(() =>
    gasDetectors.map((g) => ({ o2: genGasHistory(g.o2, 0.5), h2s: genGasHistory(g.h2s, 0.6) })),
  )
  const [time, setTime] = useState('')

  useEffect(() => {
    const t = setInterval(() => {
      setHists((prev) =>
        prev.map((h, i) => ({
          o2: [...h.o2.slice(1), Math.max(0, gasDetectors[i].o2 + (Math.random() - 0.5) * 0.5)],
          h2s: [...h.h2s.slice(1), Math.max(0, gasDetectors[i].h2s + (Math.random() - 0.5) * 0.6)],
        })),
      )
      setTime(new Date().toTimeString().slice(0, 8))
    }, 1000)
    return () => clearInterval(t)
  }, [])

  return (
    <div className="flex gap-3">
      {gasDetectors.map((g, i) => (
        <GasCard
          key={g.id}
          name={g.name}
          o2={hists[i].o2[hists[i].o2.length - 1]}
          h2s={hists[i].h2s[hists[i].h2s.length - 1]}
          o2Hist={hists[i].o2}
          h2sHist={hists[i].h2s}
          time={time}
        />
      ))}
    </div>
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
const TABS = ['작업자', '작업 목록', '고정형 비콘', '트래커'] as const
type Tab = (typeof TABS)[number]

const TAB_COUNTS: Record<Tab, number> = {
  작업자: liveWorkers.length,
  '작업 목록': workItems.length,
  '고정형 비콘': beaconRows.length,
  트래커: trackerRows.length,
}

function TabGrid() {
  const [tab, setTab] = useState<Tab>('작업자')
  return (
    <Card className="flex min-h-0 flex-1 flex-col !p-0">
      <div className="flex items-center gap-1 border-b border-hairline px-3 py-2">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`h-9 cursor-pointer rounded-lg px-3.5 text-[13px] font-medium transition-colors ${
              tab === t ? 'bg-primary text-white' : 'text-ink-2 hover:bg-surface-2'
            }`}
          >
            {t}
          </button>
        ))}
        <span className="ml-auto text-[11px] text-muted">Results : {TAB_COUNTS[tab]}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {tab === '작업자' && <WorkerTable />}
        {tab === '작업 목록' && <WorkListTable />}
        {tab === '고정형 비콘' && <BeaconTable />}
        {tab === '트래커' && <TrackerTable />}
      </div>
    </Card>
  )
}

/* ═══ 하단 패널 — 정적, memo 격리 ═══ */
const BottomPanels = memo(function BottomPanels() {
  const lowSensors = sensors.filter((s) => s.state !== '정상')
  const total = zoneAlarmStats.reduce((a, b) => a + b.count, 0)
  const colors = ['var(--series-1)', 'var(--series-3)', 'var(--series-4)', 'var(--series-5)']
  const R = 40
  const C = 2 * Math.PI * R
  let acc = 0

  return (
    <div className="grid h-[230px] shrink-0 grid-cols-1 gap-3 xl:grid-cols-3">
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
