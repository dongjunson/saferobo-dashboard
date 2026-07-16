import type { ReactNode } from 'react'
import type { Severity } from '../data/mock'

/* SafeRobo DS: 카드 = rounded-[14px] + ring-1 ring-white/5(다크) — 그림자 없음 */
export function Card({
  title,
  action,
  children,
  className = '',
}: {
  title?: string
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section
      className={`rounded-[14px] border border-hairline bg-surface-1 p-5 ${className}`}
    >
      {title && (
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-medium text-ink">{title}</h2>
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

/* SafeRobo DS 대시보드 스탯 카드: 라벨 + 볼드 수치(tabular-nums) + 컬러 아이콘 스퀘어 */
export function StatTile({
  label,
  value,
  unit,
  delta,
  tone = 'default',
  icon,
}: {
  label: string
  value: number | string
  unit?: string
  delta?: string
  tone?: 'default' | 'critical' | 'warning' | 'info' | 'success'
  icon?: ReactNode
}) {
  const tones = {
    default: { value: 'text-ink', iconBg: 'bg-surface-2', iconFg: 'text-ink-2' },
    critical: { value: 'text-critical', iconBg: 'bg-critical/15', iconFg: 'text-critical' },
    warning: { value: 'text-serious', iconBg: 'bg-serious/15', iconFg: 'text-serious' },
    info: { value: 'text-s1', iconBg: 'bg-s1/15', iconFg: 'text-s1' },
    success: { value: 'text-good', iconBg: 'bg-good/15', iconFg: 'text-good' },
  }[tone]
  return (
    <div className="flex items-center justify-between rounded-[14px] border border-hairline bg-surface-1 p-5">
      <div>
        <p className="mb-1 text-sm text-muted">{label}</p>
        <h3
          className={`text-3xl font-bold ${tones.value}`}
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {typeof value === 'number' ? value.toLocaleString() : value}
          {unit && <span className="ml-1 text-sm font-normal text-muted">{unit}</span>}
        </h3>
        {delta && <p className="mt-2 text-sm text-muted">{delta}</p>}
      </div>
      {icon && (
        <div
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] ${tones.iconBg} ${tones.iconFg}`}
        >
          {icon}
        </div>
      )}
    </div>
  )
}

/* SafeRobo AppBadge: rounded-full + intent/10 bg + intent/35 border + 도트 */
const SEVERITY_META: Record<
  Severity,
  { label: string; cls: string; dot: string; pulse: boolean }
> = {
  critical: {
    label: '위급',
    cls: 'bg-critical/10 text-critical border-critical/35',
    dot: 'bg-critical',
    pulse: true,
  },
  serious: {
    label: '경고',
    cls: 'bg-serious/10 text-serious border-serious/35',
    dot: 'bg-serious',
    pulse: false,
  },
  warning: {
    label: '주의',
    cls: 'bg-warning/10 text-warning border-warning/35',
    dot: 'bg-warning',
    pulse: false,
  },
  good: {
    label: '정상',
    cls: 'bg-good/10 text-good border-good/35',
    dot: 'bg-good',
    pulse: false,
  },
}

export function SeverityBadge({ severity }: { severity: Severity }) {
  const meta = SEVERITY_META[severity]
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold tracking-tight ${meta.cls}`}
    >
      <span
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${meta.dot} ${meta.pulse ? 'animate-pulse' : ''}`}
      />
      {meta.label}
    </span>
  )
}

/* 입·퇴실 그룹 배지 — [입실시간 | 퇴실시간 or 재실] 공용 디자인 */
export function InOutBadge({ inTime, outTime }: { inTime: string; outTime: string | null }) {
  return (
    <span className="inline-flex overflow-hidden rounded-full border border-hairline text-[10px] leading-none">
      <span className="bg-surface-2 px-1.5 py-1 font-mono text-ink-2" title="입실">
        {inTime}
      </span>
      {outTime ? (
        <span className="px-1.5 py-1 font-mono text-muted" title="퇴실">
          {outTime}
        </span>
      ) : (
        <span className="bg-good/10 px-1.5 py-1 font-semibold text-good" title="재실 중">
          재실
        </span>
      )}
    </span>
  )
}

/** Recharts용 커스텀 툴팁 — 서페이스 위 헤어라인 카드, 시리즈 점 + 텍스트 잉크 */
export function ChartTooltip({
  active,
  label,
  payload,
}: {
  active?: boolean
  label?: string | number
  payload?: Array<{ name?: string; value?: number | string; color?: string }>
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-[10px] border border-hairline bg-surface-1 px-3 py-2 text-xs shadow-lg">
      {label !== undefined && (
        <div className="mb-1 font-semibold text-ink">{label}</div>
      )}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2 py-0.5 text-ink-2">
          <span
            className="size-2 rounded-full"
            style={{ background: p.color }}
          />
          <span>{p.name}</span>
          <span
            className="ml-auto pl-3 font-semibold text-ink"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {typeof p.value === 'number' ? p.value.toLocaleString() : p.value}
          </span>
        </div>
      ))}
    </div>
  )
}

export function LegendRow({
  items,
}: {
  items: Array<{ label: string; color: string }>
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
      {items.map((it) => (
        <span
          key={it.label}
          className="flex items-center gap-1.5 text-xs text-ink-2"
        >
          <span
            className="size-2 rounded-full"
            style={{ background: it.color }}
          />
          {it.label}
        </span>
      ))}
    </div>
  )
}

/* SafeRobo 필터 칩: h-11 · active = 프라이머리 솔리드 */
export function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`h-11 cursor-pointer rounded-lg px-4 text-sm font-medium transition-colors ${
        active
          ? 'bg-primary text-white'
          : 'text-ink-2 hover:bg-surface-2 hover:text-ink'
      }`}
    >
      {children}
    </button>
  )
}
