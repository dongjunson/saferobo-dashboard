import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { Card, FilterChip } from '../components/ui'
import { workers, type Worker } from '../data/mock'

const STATUS_STYLE: Record<Worker['status'], string> = {
  작업중: 'text-good',
  휴식: 'text-ink-2',
  퇴실: 'text-muted',
  위험: 'text-critical',
}

const FILTERS = ['전체', '작업중', '휴식', '퇴실', '위험'] as const

export default function Workers() {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('전체')

  const rows = useMemo(
    () =>
      workers.filter(
        (w) =>
          (filter === '전체' || w.status === filter) &&
          (query === '' ||
            [w.name, w.vendor, w.trade, w.zone].some((f) =>
              f.includes(query),
            )),
      ),
    [query, filter],
  )

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-4">
      <Card>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <label className="relative">
            <Search
              size={18}
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="이름·협력사·직종·구역 검색"
              className="h-11 w-72 rounded-[14px] border border-hairline bg-surface-2/60 pl-11 pr-4 text-sm outline-none transition-colors placeholder:text-muted focus:border-primary focus:ring-[3px] focus:ring-primary/25"
            />
          </label>
          <div className="flex gap-1">
            {FILTERS.map((f) => (
              <FilterChip key={f} active={filter === f} onClick={() => setFilter(f)}>
                {f}
              </FilterChip>
            ))}
          </div>
          <span className="ml-auto text-xs text-muted">{rows.length}명</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-hairline text-[11px] text-muted">
                <th className="py-2.5 pr-4 font-medium">이름</th>
                <th className="py-2.5 pr-4 font-medium">협력사</th>
                <th className="py-2.5 pr-4 font-medium">직종</th>
                <th className="py-2.5 pr-4 font-medium">현재 구역</th>
                <th className="py-2.5 pr-4 font-medium">입실 시각</th>
                <th className="py-2.5 pr-4 font-medium">심박수</th>
                <th className="py-2.5 font-medium">상태</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {rows.map((w) => (
                <tr key={w.id} className="hover:bg-surface-2">
                  <td className="py-3 pr-4 font-medium">{w.name}</td>
                  <td className="py-3 pr-4 text-ink-2">{w.vendor}</td>
                  <td className="py-3 pr-4 text-ink-2">{w.trade}</td>
                  <td className="py-3 pr-4 text-ink-2">{w.zone}</td>
                  <td className="py-3 pr-4 font-mono text-[13px] tabular-nums text-ink-2">{w.inTime}</td>
                  <td className="py-3 pr-4 tabular-nums">
                    {w.heartRate !== null ? (
                      <span className={w.heartRate >= 120 ? 'font-semibold text-critical' : ''}>
                        {w.heartRate} bpm
                      </span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className={`py-3 font-medium ${STATUS_STYLE[w.status]}`}>
                    {w.status === '위험' && '● '}
                    {w.status}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-muted">
                    조건에 맞는 작업자가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
