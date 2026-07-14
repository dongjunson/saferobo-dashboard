import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  AlertTriangle,
  DoorOpen,
  LogIn,
  LogOut,
  Siren,
  Wrench,
} from 'lucide-react'
import {
  Card,
  ChartTooltip,
  LegendRow,
  SeverityBadge,
  StatTile,
} from '../components/ui'
import {
  emergencyEvents,
  hourlyFlow,
  kpiSummary,
  tradeCounts,
  vendorCounts,
  weeklyAlerts,
  zoneAlerts,
  zoneOccupancy,
} from '../data/mock'

const S1 = 'var(--series-1)'
const S2 = 'var(--series-2)'
const S3 = 'var(--series-3)'
const S6 = 'var(--series-6)'

export default function Dashboard() {
  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-4">
      {/* KPI 타일 */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <StatTile label="전체 입실자" value={kpiSummary.totalIn} unit="명" tone="info" icon={<LogIn size={22} />} delta="전일 대비 +12명" />
        <StatTile label="전체 퇴실자" value={kpiSummary.totalOut} unit="명" icon={<LogOut size={22} />} />
        <StatTile label="잔류 작업자" value={kpiSummary.remaining} unit="명" tone="success" icon={<DoorOpen size={22} />} delta="정원 대비 63%" />
        <StatTile label="위급 상황" value={kpiSummary.emergencies} unit="건" tone="critical" icon={<Siren size={22} />} delta="2건 조치 중" />
        <StatTile label="입조 작업자" value={kpiSummary.confinedWorkers} unit="명" icon={<AlertTriangle size={22} />} delta="밀폐구역 작업" />
        <StatTile label="위험 작업" value={kpiSummary.riskWorks} unit="건" tone="warning" icon={<Wrench size={22} />} delta="화기 4 · 고소 3" />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {/* 시간대별 입·퇴실 추이 */}
        <Card
          title="시간대별 입·퇴실 추이"
          className="xl:col-span-2"
          action={
            <LegendRow
              items={[
                { label: '입실', color: S1 },
                { label: '퇴실', color: S2 },
              ]}
            />
          }
        >
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={hourlyFlow} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="gIn" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={S1} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={S1} stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="gOut" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={S2} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={S2} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="var(--grid-line)" strokeDasharray="0" vertical={false} />
              <XAxis dataKey="hour" axisLine={{ stroke: 'var(--axis-line)' }} tickLine={false} />
              <YAxis axisLine={false} tickLine={false} width={46} />
              <Tooltip content={<ChartTooltip />} cursor={{ stroke: 'var(--axis-line)', strokeWidth: 1 }} />
              <Area type="monotone" dataKey="in" name="입실" stroke={S1} strokeWidth={2} fill="url(#gIn)" dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--surface-1)' }} />
              <Area type="monotone" dataKey="out" name="퇴실" stroke={S2} strokeWidth={2} fill="url(#gOut)" dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--surface-1)' }} />
            </AreaChart>
          </ResponsiveContainer>
        </Card>

        {/* 위급 상황 현황 */}
        <Card title="위급 상황 현황" action={<span className="text-[11px] text-muted">오늘 {emergencyEvents.length}건</span>}>
          <ul className="flex flex-col divide-y divide-hairline">
            {emergencyEvents.map((e) => (
              <li key={e.id} className="flex items-center gap-3 py-2.5">
                <span className="w-10 shrink-0 text-[11px] tabular-nums text-muted">{e.time}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-medium">{e.type}</div>
                  <div className="truncate text-[11px] text-muted">
                    {e.zone} · {e.worker} · {e.status}
                  </div>
                </div>
                <SeverityBadge severity={e.severity} />
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {/* 구역별 알림 현황 */}
        <Card
          title="구역별 알림 현황"
          action={
            <LegendRow
              items={[
                { label: '유해가스', color: S3 },
                { label: '심박 이상', color: S6 },
                { label: 'SOS', color: 'var(--series-5)' },
              ]}
            />
          }
        >
          <ResponsiveContainer width="100%" height={230}>
            <BarChart data={zoneAlerts} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="35%">
              <CartesianGrid stroke="var(--grid-line)" vertical={false} />
              <XAxis dataKey="zone" tickFormatter={(z: string) => z.slice(0, 3)} axisLine={{ stroke: 'var(--axis-line)' }} tickLine={false} />
              <YAxis axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--hairline)' }} />
              <Bar dataKey="gas" name="유해가스" stackId="a" fill={S3} stroke="var(--surface-1)" strokeWidth={2} />
              <Bar dataKey="heart" name="심박 이상" stackId="a" fill={S6} stroke="var(--surface-1)" strokeWidth={2} />
              <Bar dataKey="sos" name="SOS" stackId="a" fill="var(--series-5)" stroke="var(--surface-1)" strokeWidth={2} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        {/* 직종별 근로자 — 단일 측정값이므로 단일 색상(시퀀셜 훅) */}
        <Card title="직종별 근로자">
          <ResponsiveContainer width="100%" height={230}>
            <BarChart data={tradeCounts} layout="vertical" margin={{ top: 4, right: 36, left: 0, bottom: 0 }} barCategoryGap="30%">
              <CartesianGrid stroke="var(--grid-line)" horizontal={false} />
              <XAxis type="number" axisLine={false} tickLine={false} hide />
              <YAxis type="category" dataKey="trade" axisLine={false} tickLine={false} width={64} tick={{ fill: 'var(--text-secondary)' }} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--hairline)' }} />
              <Bar dataKey="count" name="인원" fill={S1} radius={[0, 4, 4, 0]} barSize={14} label={{ position: 'right', fill: 'var(--text-secondary)', fontSize: 11 }} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        {/* 협력사별 근로자 */}
        <Card title="협력사별 근로자">
          <ResponsiveContainer width="100%" height={230}>
            <BarChart data={vendorCounts} layout="vertical" margin={{ top: 4, right: 36, left: 0, bottom: 0 }} barCategoryGap="30%">
              <CartesianGrid stroke="var(--grid-line)" horizontal={false} />
              <XAxis type="number" axisLine={false} tickLine={false} hide />
              <YAxis type="category" dataKey="trade" axisLine={false} tickLine={false} width={78} tick={{ fill: 'var(--text-secondary)' }} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--hairline)' }} />
              <Bar dataKey="count" name="인원" fill={S2} radius={[0, 4, 4, 0]} barSize={14} label={{ position: 'right', fill: 'var(--text-secondary)', fontSize: 11 }} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {/* 구역별 투입 현황 */}
        <Card title="구역(영역)별 투입 현황">
          <ul className="flex flex-col gap-4">
            {zoneOccupancy.map((z) => {
              const pct = Math.round((z.workers / z.capacity) * 100)
              const barColor = z.risk ? 'var(--status-serious)' : 'var(--series-1)'
              return (
                <li key={z.zone}>
                  <div className="mb-1.5 flex items-baseline justify-between text-[13px]">
                    <span className="flex items-center gap-2 font-medium">
                      {z.zone}
                      {z.risk && (
                        <span className="rounded-full border border-hairline px-2 py-px text-[10px] text-serious">
                          ⚠ 정원 임박
                        </span>
                      )}
                    </span>
                    <span className="tabular-nums text-ink-2">
                      {z.workers}
                      <span className="text-muted"> / {z.capacity}명 ({pct}%)</span>
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${pct}%`, background: barColor }}
                    />
                  </div>
                </li>
              )
            })}
          </ul>
        </Card>

        {/* 주간 위험 알림 추이 */}
        <Card
          title="주간 위험 알림 추이"
          className="xl:col-span-2"
          action={
            <LegendRow
              items={[
                { label: '유해가스', color: S3 },
                { label: '심박 이상', color: S6 },
                { label: 'SOS', color: 'var(--series-5)' },
              ]}
            />
          }
        >
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={weeklyAlerts} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="var(--grid-line)" vertical={false} />
              <XAxis dataKey="day" axisLine={{ stroke: 'var(--axis-line)' }} tickLine={false} />
              <YAxis axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip content={<ChartTooltip />} cursor={{ stroke: 'var(--axis-line)', strokeWidth: 1 }} />
              <Line type="monotone" dataKey="gas" name="유해가스" stroke={S3} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--surface-1)' }} />
              <Line type="monotone" dataKey="heart" name="심박 이상" stroke={S6} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--surface-1)' }} />
              <Line type="monotone" dataKey="sos" name="SOS" stroke="var(--series-5)" strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--surface-1)' }} />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      </div>
    </div>
  )
}
