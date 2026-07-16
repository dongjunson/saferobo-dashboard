import { memo, useEffect, useMemo, useRef, useState } from 'react'
import {
  LocateFixed,
  Maximize2,
  Minimize2,
  Minus,
  Plus,
  Wifi,
  X,
} from 'lucide-react'
import {
  assessZoneRisks,
  gasDetectors,
  gasSeverity,
  gateways,
  liveWorkers,
  mapBeacons,
  portableGasDetectors,
  siteBoundary,
  tunnelEntrances,
  utilityTunnels,
  workerPosition,
  zones,
  type GasLevel,
  type LiveWorker,
} from '../data/site'

type ViewMode = '2d' | '2.5d'

/* ── 구역 위험도(환경 데이터 기반) — 정적 목업 데이터라 모듈 단위 1회 평가 ── */
const ZONE_RISK = new Map(assessZoneRisks().map((r) => [r.zone, r]))
const RISK_COLOR: Record<GasLevel, string> = {
  good: 'var(--series-4)',
  warning: 'var(--status-warning)',
  critical: 'var(--status-critical)',
}
const GAS_COLOR: Record<GasLevel, string> = {
  good: 'var(--series-3)',
  warning: 'var(--status-warning)',
  critical: 'var(--status-critical)',
}
const RISK_LABEL: Record<GasLevel, string> = { good: '', warning: '▲ 주의', critical: '▲ 위험' }
const PORTABLE_BY_WORKER = new Map(portableGasDetectors.map((p) => [p.workerId, p]))

interface ViewBox {
  x: number
  y: number
  w: number
  h: number
}

/* ── 2.5D 아이소메트릭 투영 ───────────────────────────────────────── */
const CX = 505
const CY = 340
const COS30 = 0.866
const SIN30 = 0.5
const FLAT = 0.62
const SCALE = 0.72
const EXTRUDE = 26
const PIN = 16

function proj(x: number, y: number, mode: ViewMode): [number, number] {
  if (mode === '2d') return [x, y]
  const dx = x - CX
  const dy = y - CY
  return [500 + (dx - dy) * COS30 * SCALE, 310 + (dx + dy) * SIN30 * FLAT * SCALE]
}

function parsePoints(points: string): Array<[number, number]> {
  return points
    .trim()
    .split(/\s+/)
    .map((p) => p.split(',').map(Number) as [number, number])
}

const toStr = (pts: Array<[number, number]>) =>
  pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')

/* ── 실제 지도 타일 배경 (2D 전용) ────────────────────────────────────
 * 로컬 좌표(1unit ≈ 1.25m)를 현장 앵커(경기 군포) 기준 Web Mercator로
 * 변환해 타일을 SVG <image>로 깐다. viewBox 줌/팬과 자동 정합. */
type BgKind = 'none' | 'map' | 'sat'

const WORLD = 40075016.686
const R_MERC = 6378137
const M_PER_UNIT = 1.25
const ANCHOR = { lat: 37.3503, lng: 126.9401 } // 군포 하수도 사업소(당정동) 인근
const AX = (R_MERC * ANCHOR.lng * Math.PI) / 180
const AY = R_MERC * Math.log(Math.tan(Math.PI / 4 + (ANCHOR.lat * Math.PI) / 360))

function tileUrl(kind: BgKind, z: number, x: number, y: number, light: boolean) {
  if (kind === 'sat')
    return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`
  const style = light ? 'light_all' : 'dark_all'
  return `https://${'abcd'[(x + y) % 4]}.basemaps.cartocdn.com/${style}/${z}/${x}/${y}.png`
}

function TileLayer({ vb, kind, screenW }: { vb: ViewBox; kind: BgKind; screenW: number }) {
  const light = document.documentElement.dataset.theme === 'light'
  const res = (vb.w * M_PER_UNIT) / screenW // 화면 px당 미터
  const z = Math.max(3, Math.min(19, Math.round(Math.log2(WORLD / (256 * res)))))
  const n = 2 ** z
  const ts = WORLD / n // 타일 한 변(m)
  const mx0 = AX + (vb.x - 500) * M_PER_UNIT
  const mx1 = AX + (vb.x + vb.w - 500) * M_PER_UNIT
  const myTop = AY - (vb.y - 320) * M_PER_UNIT
  const myBot = AY - (vb.y + vb.h - 320) * M_PER_UNIT
  const tx0 = Math.floor((mx0 + WORLD / 2) / ts)
  const tx1 = Math.floor((mx1 + WORLD / 2) / ts)
  const ty0 = Math.floor((WORLD / 2 - myTop) / ts)
  const ty1 = Math.floor((WORLD / 2 - myBot) / ts)
  const tiles: Array<{ key: string; href: string; x: number; y: number; s: number }> = []
  for (let tx = tx0; tx <= tx1; tx++) {
    for (let ty = ty0; ty <= ty1; ty++) {
      if (tx < 0 || ty < 0 || tx >= n || ty >= n) continue
      const mercX = -WORLD / 2 + tx * ts
      const mercYtop = WORLD / 2 - ty * ts
      tiles.push({
        key: `${z}/${tx}/${ty}`,
        href: tileUrl(kind, z, tx, ty, light),
        x: 500 + (mercX - AX) / M_PER_UNIT,
        y: 320 + (AY - mercYtop) / M_PER_UNIT,
        s: ts / M_PER_UNIT,
      })
    }
  }
  if (tiles.length > 120) return null // 과도한 타일 요청 방지
  return (
    <g pointerEvents="none">
      {tiles.map((t) => (
        <image
          key={t.key}
          href={t.href}
          x={t.x}
          y={t.y}
          width={t.s * 1.002}
          height={t.s * 1.002}
          preserveAspectRatio="none"
          opacity={kind === 'sat' ? 0.88 : 0.92}
        />
      ))}
    </g>
  )
}

/* ── 동적 축척 바 ─────────────────────────────────────────────────────
 * 현재 viewBox·컨테이너 크기에서 화면 px당 실거리(m)를 구해
 * 1-2-5 스텝의 보기 좋은 거리로 스냅한다. 줌인/줌아웃과 항상 정합. */
function niceDistance(maxMeters: number): number {
  const pow = 10 ** Math.floor(Math.log10(maxMeters))
  const d = maxMeters / pow
  return (d >= 5 ? 5 : d >= 2 ? 2 : 1) * pow
}

function ScaleBar({ vb, wrap }: { vb: ViewBox; wrap: HTMLDivElement | null }) {
  const rw = wrap?.clientWidth ?? 900
  const rh = wrap?.clientHeight ?? 576
  const s = Math.min(rw / vb.w, rh / vb.h) // 화면 px / 로컬 unit (meet 보정)
  const mPerPx = M_PER_UNIT / s
  const meters = niceDistance(mPerPx * 100) // 바 최대 폭 100px
  const label = meters >= 1000 ? `${meters / 1000} km` : `${meters} m`
  return (
    <span className="flex items-end gap-1.5">
      <span
        className="inline-block h-[5px]"
        style={{
          width: meters / mPerPx,
          borderLeft: '1px solid var(--axis-line)',
          borderRight: '1px solid var(--axis-line)',
          borderBottom: '1px solid var(--axis-line)',
        }}
      />
      <span className="tabular-nums">{label}</span>
    </span>
  )
}

/* ── 줌/팬 viewBox 연산 ───────────────────────────────────────────── */
const BASE: ViewBox = { x: 0, y: 0, w: 1000, h: 640 }
const MIN_W = 140
const MAX_W = 8000 // 광역(주변 지역)까지 줌아웃 허용 (~12.5%)

function zoomVb(vb: ViewBox, factor: number, px: number, py: number): ViewBox {
  const w = Math.min(MAX_W, Math.max(MIN_W, vb.w * factor))
  const h = (w * BASE.h) / BASE.w
  const kx = (px - vb.x) / vb.w
  const ky = (py - vb.y) / vb.h
  return { x: px - kx * w, y: py - ky * h, w, h }
}

/** 컨테이너 픽셀 좌표 → viewBox 좌표 (preserveAspectRatio: meet 보정) */
function clientToVb(
  clientX: number,
  clientY: number,
  rect: DOMRect,
  vb: ViewBox,
): [number, number] {
  const s = Math.min(rect.width / vb.w, rect.height / vb.h)
  const ox = (rect.width - vb.w * s) / 2
  const oy = (rect.height - vb.h * s) / 2
  return [vb.x + (clientX - rect.left - ox) / s, vb.y + (clientY - rect.top - oy) / s]
}

/* ── 정적 레이어 (뷰 모드·줌 배율에만 반응) ───────────────────────── */
const StaticLayers = memo(function StaticLayers({
  mode,
  k,
  showGrid = true,
}: {
  mode: ViewMode
  k: number
  showGrid?: boolean
}) {
  const layers = useMemo(() => {
    const boundary = toStr(parsePoints(siteBoundary).map(([x, y]) => proj(x, y, mode)))
    const gridLines: string[] = []
    for (let gx = 0; gx <= 1000; gx += 80) gridLines.push(toStr([proj(gx, 0, mode), proj(gx, 640, mode)]))
    for (let gy = 0; gy <= 640; gy += 80) gridLines.push(toStr([proj(0, gy, mode), proj(1000, gy, mode)]))
    const zs = zones
      .map((z) => {
        const ground = parsePoints(z.points).map(([x, y]) => proj(x, y, mode))
        const top = ground.map(([x, y]) => [x, y - (mode === '2.5d' ? EXTRUDE : 0)] as [number, number])
        const [lx, ly] = proj(z.labelX, z.labelY, mode)
        const risk: GasLevel = ZONE_RISK.get(z.name)?.level ?? 'good'
        return { ...z, ground, top, lx, ly: mode === '2.5d' ? ly - EXTRUDE - 8 : ly, maxY: Math.max(...ground.map((p) => p[1])), risk }
      })
      .sort((a, b) => a.maxY - b.maxY)
    const bs = mapBeacons.map((b) => ({ ...b, p: proj(b.x, b.y, mode) }))
    const gs = gateways.map((g) => ({ ...g, p: proj(g.x, g.y, mode) }))
    const gds = gasDetectors.map((g) => ({ ...g, p: proj(g.x, g.y, mode), lvl: gasSeverity(g) }))
    /* 지하 공동구 — 2.5D에서도 작업 구역과 동일한 지표면(z)에 그린다 */
    const tns = utilityTunnels.map((t) => ({
      ...t,
      pts: toStr(t.path.map(([x, y]) => proj(x, y, mode))),
    }))
    const ents = tunnelEntrances.map((e) => ({ ...e, p: proj(e.x, e.y, mode) }))
    const tl = proj(745, 340, mode)
    tl[1] -= 8
    return { boundary, gridLines, zs, bs, gs, gds, tns, ents, tl }
  }, [mode])

  const iso = mode === '2.5d'
  const fontSize = Math.max(6, Math.min(14, 12 * k))
  const km = Math.min(k, 2.5) // 장비 마커는 광역 줌아웃에서 과대해지지 않도록 별도 상한
  const showDevices = k <= 4 // 광역 뷰에서는 장비 마커 숨김 (현장 식별 위주)
  return (
    <>
      {showGrid &&
        layers.gridLines.map((pts, i) => (
          <polyline key={i} points={pts} fill="none" stroke="var(--grid-line)" strokeWidth="0.6" vectorEffect="non-scaling-stroke" />
        ))}
      <polygon
        points={layers.boundary}
        fill="var(--status-serious)"
        fillOpacity="0.06"
        stroke="var(--status-serious)"
        strokeOpacity="0.55"
        strokeWidth="2"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      {/* 지하 공동구(유틸리티 터널) — 건물 하부 레이어: 코리도 몸체 + 점선 중심선 */}
      {layers.tns.map((t) => (
        <g key={t.id} opacity={iso ? 0.7 : 1}>
          <polyline
            points={t.pts}
            fill="none"
            stroke="var(--series-1)"
            strokeOpacity="0.16"
            strokeWidth="20"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <title>{`${t.name} · 지하 공동구`}</title>
          </polyline>
          <polyline
            points={t.pts}
            fill="none"
            stroke="var(--series-1)"
            strokeOpacity="0.6"
            strokeWidth="1.4"
            strokeDasharray="7 5"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
          />
        </g>
      ))}
      <text
        x={layers.tl[0]}
        y={layers.tl[1]}
        textAnchor="middle"
        fontSize={fontSize * 0.85}
        fill="var(--series-1)"
        opacity="0.85"
        fontWeight="600"
      >
        지하 공동구
      </text>
      {layers.zs.map((z) => {
        const zc = RISK_COLOR[z.risk]
        return (
        <g key={z.id}>
          {iso && (
            <>
              <polygon points={toStr(z.ground)} fill="var(--page)" opacity="0.5" />
              {z.ground.map((p, i) => {
                const q = z.ground[(i + 1) % z.ground.length]
                return (
                  <polygon
                    key={i}
                    points={toStr([p, q, z.top[(i + 1) % z.top.length], z.top[i]])}
                    fill={zc}
                    fillOpacity="0.14"
                    stroke={zc}
                    strokeOpacity="0.3"
                    strokeWidth="0.8"
                  />
                )
              })}
            </>
          )}
          <polygon
            points={toStr(z.top)}
            fill={zc}
            fillOpacity={iso ? 0.22 : z.risk === 'good' ? 0.1 : 0.16}
            stroke={zc}
            strokeOpacity={z.risk === 'good' ? 0.5 : 0.75}
            strokeWidth={z.risk === 'good' ? 1.2 : 1.8}
            vectorEffect="non-scaling-stroke"
          >
            {z.risk !== 'good' && (
              <animate attributeName="fill-opacity" values="0.16;0.3;0.16" dur="2s" repeatCount="indefinite" />
            )}
          </polygon>
          <text x={z.lx} y={z.ly} textAnchor="middle" fontSize={fontSize} fill="var(--text-muted)" fontWeight="500">
            {z.name}
          </text>
          {z.risk !== 'good' && (
            <text
              x={z.lx}
              y={z.ly + fontSize + 2}
              textAnchor="middle"
              fontSize={fontSize * 0.85}
              fill={zc}
              fontWeight="700"
              paintOrder="stroke"
              stroke="var(--page)"
              strokeWidth="2.5"
            >
              {RISK_LABEL[z.risk]}
            </text>
          )}
        </g>
        )
      })}
      {showDevices && layers.bs.map((b) => (
        <g key={b.id} transform={`translate(${b.p[0]}, ${b.p[1]}) scale(${km})`}>
          {iso && <line y2={-PIN} stroke="var(--series-4)" strokeOpacity="0.5" strokeWidth="1" />}
          <g transform={iso ? `translate(0, ${-PIN})` : undefined}>
            <rect x="-4.5" y="-4.5" width="9" height="9" rx="2" fill="var(--series-4)" opacity="0.9">
              <title>{`${b.id} · ${b.zone}`}</title>
            </rect>
            <rect x="-1.8" y="-1.8" width="3.6" height="3.6" rx="1" fill="var(--surface-1)" />
          </g>
        </g>
      ))}
      {showDevices && layers.gs.map((g) => (
        <g key={g.id} transform={`translate(${g.p[0]}, ${g.p[1]}) scale(${km})`}>
          {iso && <line y2={-PIN} stroke="var(--series-1)" strokeOpacity="0.5" strokeWidth="1" />}
          <g transform={iso ? `translate(0, ${-PIN})` : undefined}>
            <circle r="10" fill="var(--series-1)" opacity="0.95">
              <title>{`${g.id} · ${g.zone}`}</title>
            </circle>
            <path d="M-4.5,-0.5 a6.3,6.3 0 0 1 9,0 M-2.4,1.8 a3.2,3.2 0 0 1 4.8,0" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" />
            <circle cy="4.2" r="1.3" fill="white" />
          </g>
        </g>
      ))}
      {/* 고정형 가스검침기 — 마름모 마커, 판정 등급 색상 */}
      {showDevices && layers.gds.map((g) => (
        <g key={g.id} transform={`translate(${g.p[0]}, ${g.p[1]}) scale(${km})`}>
          {iso && <line y2={-PIN} stroke={GAS_COLOR[g.lvl]} strokeOpacity="0.5" strokeWidth="1" />}
          <g transform={iso ? `translate(0, ${-PIN})` : undefined}>
            {g.lvl === 'critical' && (
              <circle r="12" fill="none" stroke={GAS_COLOR[g.lvl]} strokeWidth="2" opacity="0.7">
                <animate attributeName="r" values="7;16" dur="1.2s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.7;0" dur="1.2s" repeatCount="indefinite" />
              </circle>
            )}
            <rect
              x="-5.2"
              y="-5.2"
              width="10.4"
              height="10.4"
              rx="2"
              transform="rotate(45)"
              fill={GAS_COLOR[g.lvl]}
              stroke="var(--surface-1)"
              strokeWidth="1.2"
            >
              <title>{`${g.id} · ${g.zone} · 고정형 가스검침기 (O₂ ${g.o2}% · H₂S ${g.h2s} · CO ${g.co} · NH₃ ${g.nh3} · CH₄ ${g.ch4})`}</title>
            </rect>
            <path
              d="M0,-3 C1.8,-1 2.6,0.1 2.6,1.1 A2.6,2.6 0 1 1 -2.6,1.1 C-2.6,0.1 -1.8,-1 0,-3 Z"
              fill="var(--surface-1)"
              pointerEvents="none"
            />
          </g>
        </g>
      ))}
      {/* 공동구 출입구(수직구·계단실) — 하강 셰브런 */}
      {showDevices && layers.ents.map((e) => (
        <g key={e.id} transform={`translate(${e.p[0]}, ${e.p[1]}) scale(${km})`}>
          <rect x="-4" y="-4" width="8" height="8" rx="1.5" fill="var(--surface-1)" stroke="var(--series-1)" strokeWidth="1.4">
            <title>{`${e.id} · ${e.zone} 공동구 출입구`}</title>
          </rect>
          <path
            d="M-2,-1 L0,1.6 L2,-1"
            fill="none"
            stroke="var(--series-1)"
            strokeWidth="1.3"
            strokeLinecap="round"
            strokeLinejoin="round"
            pointerEvents="none"
          />
        </g>
      ))}
    </>
  )
})

/* ── 선택 작업자 이동 궤적 (최근 60초) ────────────────────────────── */
function Trail({ worker, tick, mode }: { worker: LiveWorker; tick: number; mode: ViewMode }) {
  const pts: Array<[number, number]> = []
  for (let k = 60; k >= 0; k -= 3) {
    const t = tick - k
    if (t < 0) continue
    const [x, y] = workerPosition(worker, t)
    pts.push(proj(x, y, mode))
  }
  if (pts.length < 2) return null
  const color = worker.danger ? 'var(--status-critical)' : 'var(--series-1)'
  return (
    <g pointerEvents="none">
      <polyline
        points={toStr(pts)}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeOpacity="0.55"
        strokeDasharray="5 4"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      {pts.filter((_, i) => i % 5 === 0).map((p, i) => (
        <circle key={i} cx={p[0]} cy={p[1]} r="2.2" fill={color} opacity="0.5" />
      ))}
    </g>
  )
}

/* ── 작업자 레이어 (1초 tick) ─────────────────────────────────────── */
function WorkerLayer({
  tick,
  mode,
  k,
  selectedId,
  onSelect,
}: {
  tick: number
  mode: ViewMode
  k: number
  selectedId: number | null
  onSelect: (id: number) => void
}) {
  const iso = mode === '2.5d'
  return (
    <>
      {liveWorkers
        .filter((w) => w.outTime === null)
        .map((w) => {
          const [rx, ry] = workerPosition(w, tick)
          const [x, y] = proj(rx, ry, mode)
          const color = w.danger ? 'var(--status-critical)' : 'var(--status-good)'
          const selected = w.id === selectedId
          const pgas = PORTABLE_BY_WORKER.get(w.id)
          return (
            <g
              key={w.id}
              style={{ transform: `translate(${x}px, ${y}px)`, transition: 'transform 1s linear', cursor: 'pointer' }}
              onClick={(e) => {
                e.stopPropagation()
                onSelect(w.id)
              }}
            >
              <g transform={`scale(${k})`}>
                {iso && <line y2={-PIN} stroke={color} strokeOpacity="0.5" strokeWidth="1" />}
                <g transform={iso ? `translate(0, ${-PIN})` : undefined}>
                  {/* 클릭 히트 영역 */}
                  <circle r="14" fill="transparent" />
                  {selected && (
                    <circle r="11" fill="none" stroke="var(--primary)" strokeWidth="2" opacity="0.9" />
                  )}
                  {w.danger && (
                    <circle r="14" fill="none" stroke={color} strokeWidth="2" opacity="0.7">
                      <animate attributeName="r" values="8;18" dur="1.2s" repeatCount="indefinite" />
                      <animate attributeName="opacity" values="0.7;0" dur="1.2s" repeatCount="indefinite" />
                    </circle>
                  )}
                  <circle r="6.5" fill={color} stroke="var(--surface-1)" strokeWidth="2">
                    <title>{`${w.name} · ${w.zone} · ${w.heartRate}bpm`}</title>
                  </circle>
                  {/* 이동형 가스검침기 배지 — 작업자 휴대, 함께 이동 */}
                  {pgas && (
                    <g transform="translate(8.5, -8.5)">
                      <rect
                        x="-3.8"
                        y="-3.8"
                        width="7.6"
                        height="7.6"
                        rx="1.5"
                        transform="rotate(45)"
                        fill={GAS_COLOR[gasSeverity(pgas)]}
                        stroke="var(--surface-1)"
                        strokeWidth="1.2"
                      >
                        <title>{`${pgas.id} · 이동형 가스검침기 (${w.name} 휴대) · O₂ ${pgas.o2}% · H₂S ${pgas.h2s} · CO ${pgas.co} · NH₃ ${pgas.nh3} · CH₄ ${pgas.ch4}`}</title>
                      </rect>
                    </g>
                  )}
                  {k <= 2.2 && (
                    <text
                      y="19"
                      textAnchor="middle"
                      fontSize="11"
                      fontWeight="600"
                      fill="var(--text-secondary)"
                      paintOrder="stroke"
                      stroke="var(--page)"
                      strokeWidth="3"
                    >
                      {w.name}
                    </text>
                  )}
                </g>
              </g>
            </g>
          )
        })}
    </>
  )
}

/* ── 위치 이력 패널 ───────────────────────────────────────────────── */
function HistoryPanel({
  worker,
  tick,
  onClose,
}: {
  worker: LiveWorker
  tick: number
  onClose: () => void
}) {
  const entries = []
  for (const back of [0, 10, 20, 30, 40, 50]) {
    const t = tick - back
    if (t < 0) break
    const [x, y] = workerPosition(worker, t)
    entries.push({
      time: new Date(Date.now() - back * 1000).toTimeString().slice(0, 8),
      x: Math.round(x),
      y: Math.round(y),
    })
  }
  return (
    <div className="absolute right-3 top-3 z-10 w-64 rounded-[10px] border border-hairline bg-surface-1/92 p-3 backdrop-blur-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink">
            {worker.name}
            <span className="ml-1.5 text-xs font-normal text-muted">{worker.vendor}</span>
          </p>
          <p className="mt-0.5 text-[11px] text-ink-2">
            {worker.space} · {worker.zone} · 심박{' '}
            <span className={worker.danger ? 'font-semibold text-critical' : ''}>{worker.heartRate}bpm</span>
          </p>
        </div>
        <button
          onClick={onClose}
          className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-ink"
          aria-label="닫기"
        >
          <X size={13} />
        </button>
      </div>
      <p className="mt-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted">
        위치 이력 · 최근 60초
      </p>
      <ul className="mt-1 flex flex-col divide-y divide-hairline font-mono text-[11px] text-ink-2">
        {entries.map((e, i) => (
          <li key={i} className="flex items-center justify-between py-1">
            <span className={i === 0 ? 'font-semibold text-ink' : ''}>{e.time}</span>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>
              X {e.x} · Y {e.y}
            </span>
            {i === 0 && <span className="rounded-full bg-good/15 px-1.5 text-[9px] font-sans font-semibold text-good">현재</span>}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[10px] leading-relaxed text-muted">
        점선 궤적은 최근 60초 이동 경로입니다.
      </p>
    </div>
  )
}

/**
 * GIS 관제 지도 — 자체 1초 tick 부분 갱신, 2D/2.5D, 전체 화면,
 * 휠/버튼 줌·드래그 팬, 작업자 선택 시 이동 궤적 + 위치 이력.
 */
export default function SiteMap() {
  const [tick, setTick] = useState(0)
  const [mode, setMode] = useState<ViewMode>('2d')
  const [bg, setBg] = useState<BgKind>('none')
  const [full, setFull] = useState(false)
  const [vb, setVb] = useState<ViewBox>(BASE)
  const [selectedId, setSelectedId] = useState<number | null>(null)

  const wrapRef = useRef<HTMLDivElement>(null)
  const vbRef = useRef(vb)
  vbRef.current = vb
  const panRef = useRef<{ x0: number; y0: number; vb0: ViewBox; active: boolean; moved: boolean }>({
    x0: 0,
    y0: 0,
    vb0: BASE,
    active: false,
    moved: false,
  })

  useEffect(() => {
    const t = setInterval(() => setTick((v) => v + 1), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    if (!full) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setFull(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [full])

  /* 휠 줌 — passive 리스너 회피를 위해 네이티브로 등록 */
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const [px, py] = clientToVb(e.clientX, e.clientY, rect, vbRef.current)
      setVb((prev) => zoomVb(prev, e.deltaY > 0 ? 1.18 : 0.85, px, py))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const zoomCenter = (factor: number) =>
    setVb((prev) => zoomVb(prev, factor, prev.x + prev.w / 2, prev.y + prev.h / 2))

  const onPointerDown = (e: React.PointerEvent) => {
    panRef.current = { x0: e.clientX, y0: e.clientY, vb0: vbRef.current, active: true, moved: false }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const p = panRef.current
    if (!p.active || !wrapRef.current) return
    const dx = e.clientX - p.x0
    const dy = e.clientY - p.y0
    if (Math.abs(dx) + Math.abs(dy) > 4) p.moved = true
    if (!p.moved) return
    const rect = wrapRef.current.getBoundingClientRect()
    const s = Math.min(rect.width / p.vb0.w, rect.height / p.vb0.h)
    setVb({ ...p.vb0, x: p.vb0.x - dx / s, y: p.vb0.y - dy / s })
  }
  const onPointerUp = () => {
    panRef.current.active = false
  }

  const tracking = liveWorkers.filter((w) => !w.outTime).length
  const selected = liveWorkers.find((w) => w.id === selectedId) ?? null
  const k = Math.max(0.35, Math.min(6, vb.w / BASE.w)) // 마커 화면 크기 유지용 역배율
  const zoomPct = Math.round((BASE.w / vb.w) * 100)

  return (
    <div
      className={
        full ? 'fixed inset-0 z-50 flex flex-col gap-2 bg-page p-4' : 'flex h-full min-h-0 flex-col gap-2'
      }
    >
      <div className="flex shrink-0 items-center justify-between px-1">
        <div className="flex items-baseline gap-2">
          <h2 className="text-base font-medium text-ink">실시간 위치 관제</h2>
          <span className="text-[11px] text-muted">비콘 {tracking}명 추적 중 · 1초 갱신</span>
        </div>
        <div className="flex items-center gap-1.5">
          {/* 배경 지도 (2D 전용 — 레거시 지도/스카이뷰 대응) */}
          <div
            className={`flex rounded-lg border border-hairline p-0.5 transition-opacity ${
              mode === '2.5d' ? 'pointer-events-none opacity-40' : ''
            }`}
          >
            {(
              [
                ['none', '기본'],
                ['map', '지도'],
                ['sat', '위성'],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                onClick={() => setBg(v)}
                className={`h-7 cursor-pointer rounded-md px-2.5 text-xs font-semibold transition-colors ${
                  bg === v ? 'bg-primary text-white' : 'text-ink-2 hover:bg-surface-2'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex rounded-lg border border-hairline p-0.5">
            {(['2d', '2.5d'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`h-7 cursor-pointer rounded-md px-2.5 text-xs font-semibold transition-colors ${
                  mode === m ? 'bg-primary text-white' : 'text-ink-2 hover:bg-surface-2'
                }`}
              >
                {m.toUpperCase()}
              </button>
            ))}
          </div>
          <button
            onClick={() => setFull((v) => !v)}
            className="flex size-8 cursor-pointer items-center justify-center rounded-lg border border-hairline text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
            aria-label={full ? '전체 화면 종료' : '전체 화면'}
            title={full ? '전체 화면 종료 (ESC)' : '전체 화면'}
          >
            {full ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </button>
        </div>
      </div>

      <div
        ref={wrapRef}
        className="relative min-h-0 flex-1 touch-none select-none overflow-hidden rounded-[10px] bg-page ring-1 ring-hairline"
        style={{ cursor: panRef.current.active ? 'grabbing' : 'grab' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClick={() => {
          if (!panRef.current.moved) setSelectedId(null)
        }}
      >
        <svg
          viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
          className="h-full w-full"
          role="img"
          aria-label="현장 실시간 위치 지도"
        >
          {mode === '2d' && bg !== 'none' && (
            <TileLayer vb={vb} kind={bg} screenW={wrapRef.current?.clientWidth ?? 900} />
          )}
          <StaticLayers mode={mode} k={k} showGrid={!(mode === '2d' && bg !== 'none')} />
          {selected && !selected.outTime && <Trail worker={selected} tick={tick} mode={mode} />}
          <WorkerLayer tick={tick} mode={mode} k={k} selectedId={selectedId} onSelect={setSelectedId} />
        </svg>

        {/* 줌 컨트롤 */}
        <div className="absolute left-3 top-3 z-10 flex flex-col items-center gap-1">
          {[
            { icon: <Plus size={15} />, label: '줌인', fn: () => zoomCenter(0.75) },
            { icon: <Minus size={15} />, label: '줌아웃', fn: () => zoomCenter(1.33) },
            { icon: <LocateFixed size={14} />, label: '초기화', fn: () => setVb(BASE) },
          ].map((b) => (
            <button
              key={b.label}
              onClick={(e) => {
                e.stopPropagation()
                b.fn()
              }}
              onPointerDown={(e) => e.stopPropagation()}
              className="flex size-8 cursor-pointer items-center justify-center rounded-lg border border-hairline bg-surface-1/85 text-ink-2 backdrop-blur-sm transition-colors hover:bg-surface-2 hover:text-ink"
              aria-label={b.label}
              title={b.label}
            >
              {b.icon}
            </button>
          ))}
          <span className="mt-0.5 rounded-md bg-surface-1/85 px-1.5 py-0.5 text-[10px] tabular-nums text-muted backdrop-blur-sm">
            {zoomPct}%
          </span>
        </div>

        {/* 선택 작업자 위치 이력 */}
        {selected && (
          <HistoryPanel worker={selected} tick={tick} onClose={() => setSelectedId(null)} />
        )}

        {/* 범례 */}
        <div className="absolute bottom-3 left-3 flex max-w-[calc(100%-150px)] flex-wrap items-center gap-x-3.5 gap-y-1 rounded-[10px] border border-hairline bg-surface-1/85 px-3 py-2 text-[11px] text-ink-2 backdrop-blur-sm">
          <span className="flex items-center gap-1.5">
            <span className="inline-block size-2.5 rounded-full bg-good" /> 작업자
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block size-2.5 animate-pulse rounded-full bg-critical" /> 위험
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block size-2.5 rounded-[3px] bg-s4" /> 고정형 비콘
          </span>
          <span className="flex items-center gap-1.5 text-s1">
            <Wifi size={12} /> <span className="text-ink-2">게이트웨이</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block size-2.5 rotate-45 rounded-[2px] bg-s3" /> 고정형 검침기
          </span>
          <span className="flex items-center gap-2">
            <span className="relative inline-flex">
              <span className="inline-block size-2.5 rounded-full bg-good" />
              <span className="absolute -right-1 -top-1 inline-block size-2 rotate-45 rounded-[1px] bg-s3" />
            </span>
            이동형 검침기(휴대)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-4 border-t-2 border-dashed border-s1" /> 지하 공동구
          </span>
        </div>

        <div className="absolute bottom-3 right-3 flex items-center gap-2 text-[10px] text-muted">
          {mode === '2d' && bg === 'map' && <span className="opacity-80">© OpenStreetMap · CARTO</span>}
          {mode === '2d' && bg === 'sat' && <span className="opacity-80">© Esri World Imagery</span>}
          {mode === '2d' && <ScaleBar vb={vb} wrap={wrapRef.current} />}
        </div>
      </div>
    </div>
  )
}
