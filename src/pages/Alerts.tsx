import { useMemo, useState } from 'react'
import { Card, FilterChip, SeverityBadge } from '../components/ui'
import { alertLogs } from '../data/mock'

const CATEGORIES = ['전체', '가스', '심박', 'SOS', '센서', '출입'] as const

export default function Alerts() {
  const [category, setCategory] =
    useState<(typeof CATEGORIES)[number]>('전체')

  const rows = useMemo(
    () =>
      alertLogs.filter((a) => category === '전체' || a.category === category),
    [category],
  )

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-4">
      <Card
        title="알림 이력"
        action={
          <div className="flex gap-1">
            {CATEGORIES.map((c) => (
              <FilterChip key={c} active={category === c} onClick={() => setCategory(c)}>
                {c}
              </FilterChip>
            ))}
          </div>
        }
      >
        <ul className="flex flex-col divide-y divide-hairline">
          {rows.map((a) => (
            <li key={a.id} className="flex items-center gap-4 py-3">
              <span className="w-18 shrink-0 font-mono text-[11px] tabular-nums text-muted">
                {a.time}
              </span>
              <span className="w-12 shrink-0 rounded-md bg-surface-2 px-2 py-1 text-center text-[11px] text-ink-2">
                {a.category}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px]">{a.message}</div>
                <div className="text-[11px] text-muted">{a.zone}</div>
              </div>
              <SeverityBadge severity={a.severity} />
            </li>
          ))}
          {rows.length === 0 && (
            <li className="py-10 text-center text-sm text-muted">
              해당 분류의 알림이 없습니다.
            </li>
          )}
        </ul>
      </Card>
    </div>
  )
}
