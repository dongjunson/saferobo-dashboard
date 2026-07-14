import { BatteryLow, Cpu, Signal, Wrench } from 'lucide-react'
import { Card, StatTile } from '../components/ui'
import { sensors, type SensorStatus } from '../data/mock'

const STATE_STYLE: Record<SensorStatus['state'], string> = {
  정상: 'text-good',
  배터리부족: 'text-serious',
  통신불량: 'text-critical',
  점검필요: 'text-warning',
}

function batteryColor(pct: number) {
  if (pct <= 20) return 'var(--status-critical)'
  if (pct <= 40) return 'var(--status-serious)'
  return 'var(--series-2)'
}

export default function Sensors() {
  const total = sensors.length
  const lowBattery = sensors.filter((s) => s.battery <= 20).length
  const offline = sensors.filter((s) => s.state === '통신불량').length
  const needCheck = sensors.filter((s) => s.state === '점검필요').length

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-4">
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatTile label="등록 장비" value={total} unit="대" icon={<Cpu size={15} />} delta="게이트웨이·비콘·센서" />
        <StatTile label="배터리 부족" value={lowBattery} unit="대" tone="warning" icon={<BatteryLow size={15} />} delta="20% 이하" />
        <StatTile label="통신 불량" value={offline} unit="대" tone="critical" icon={<Signal size={15} />} delta="30분 이상 미수신" />
        <StatTile label="점검 필요" value={needCheck} unit="대" icon={<Wrench size={15} />} />
      </div>

      <Card title="배터리 및 상태 이상 IoT 센서 현황">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-hairline text-[11px] text-muted">
                <th className="py-2.5 pr-4 font-medium">장비 ID</th>
                <th className="py-2.5 pr-4 font-medium">종류</th>
                <th className="py-2.5 pr-4 font-medium">설치 구역</th>
                <th className="w-56 py-2.5 pr-4 font-medium">배터리</th>
                <th className="py-2.5 pr-4 font-medium">상태</th>
                <th className="py-2.5 font-medium">최근 수신</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {sensors.map((s) => (
                <tr key={s.id} className="hover:bg-surface-2">
                  <td className="py-3 pr-4 font-mono text-[13px] font-medium tabular-nums">{s.id}</td>
                  <td className="py-3 pr-4 text-ink-2">{s.type}</td>
                  <td className="py-3 pr-4 text-ink-2">{s.zone}</td>
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-32 overflow-hidden rounded-full bg-surface-2">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${s.battery}%`, background: batteryColor(s.battery) }}
                        />
                      </div>
                      <span className="w-9 text-right text-[11px] tabular-nums text-ink-2">
                        {s.battery}%
                      </span>
                    </div>
                  </td>
                  <td className={`py-3 pr-4 font-medium ${STATE_STYLE[s.state]}`}>{s.state}</td>
                  <td className="py-3 text-ink-2">{s.lastSeen}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
