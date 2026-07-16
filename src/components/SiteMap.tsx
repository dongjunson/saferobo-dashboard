import { lazy, memo, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronDown,
  ChevronUp,
  Layers,
  LocateFixed,
  Maximize2,
  Minimize2,
  Minus,
  Plus,
  Wifi,
  X,
} from 'lucide-react'
import type { LayerKey } from './Site3D'
import {
  assessZoneRisks,
  floorDefs,
  gasDetectors,
  gasMetrics,
  gasSeverity,
  gateways,
  liveWorkers,
  mapBeacons,
  portableGasDetectors,
  stairwells,
  tunnelEntrances,
  utilityTunnels,
  workerFloor,
  workerPosition,
  zones,
  type FloorId,
  type GasLevel,
  type LiveWorker,
  type Zone,
} from '../data/site'
/* three.js 번들은 3D 모드 진입 시에만 로드 */
const Site3D = lazy(() => import('./Site3D'))

/** 지도 모드 — SVG 2D 평면도 + three.js 3D */
type MapMode = '2d' | '3d'

const LV_ORDER: Record<FloorId, number> = { B2: 0, B1: 1, F1: 2 }
const FLOOR_SHORT = Object.fromEntries(floorDefs.map((f) => [f.id, f.short])) as Record<FloorId, string>
const floorStepBtn =
  'flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink disabled:cursor-default disabled:opacity-30'

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
const RISK_CHIP: Record<GasLevel, { label: string; cls: string }> = {
  critical: { label: '위험', cls: 'bg-critical/10 text-critical border-critical/35' },
  warning: { label: '주의', cls: 'bg-warning/10 text-warning border-warning/35' },
  good: { label: '정상', cls: 'bg-good/10 text-good border-good/35' },
}
const PORTABLE_BY_WORKER = new Map(portableGasDetectors.map((p) => [p.workerId, p]))

/* ── 레이어 범례 — 모드별 실제 마커 모양과 일치하는 아이콘 ─────────── */
const ALL_LAYERS_ON: Record<LayerKey, boolean> = {
  workers: true,
  beacons: true,
  gateways: true,
  gas: true,
  tunnels: true,
  stairs: true,
}

function LayerIcon({ k, is3d }: { k: LayerKey; is3d: boolean }) {
  switch (k) {
    case 'workers':
      return (
        <span className="relative inline-flex">
          <span className="inline-block size-2.5 rounded-full bg-good" />
          <span className="absolute -right-1 -top-1 inline-block size-2 rotate-45 rounded-[1px] bg-s3" />
        </span>
      )
    case 'beacons':
      return is3d ? (
        /* 3D: 원형 퍽 + 돔 */
        <svg width="15" height="15" viewBox="0 0 16 16">
          <ellipse cx="8" cy="11.2" rx="5.4" ry="2.4" fill="var(--series-4)" />
          <path d="M3.6 10.6 A4.4 3.8 0 0 1 12.4 10.6 Z" fill="#c4b5fd" />
        </svg>
      ) : (
        <span className="relative inline-flex size-3 items-center justify-center rounded-[3px] bg-s4">
          <span className="size-1 rounded-[1px] bg-surface-1" />
        </span>
      )
    case 'gateways':
      return is3d ? (
        /* 3D: 함체 + 안테나 2본 */
        <svg width="15" height="15" viewBox="0 0 16 16">
          <rect x="5" y="7" width="6" height="7.5" rx="1" fill="var(--series-1)" />
          <line x1="6.4" y1="7" x2="6.4" y2="2.6" stroke="#cbd5e1" strokeWidth="0.9" />
          <line x1="9.6" y1="7" x2="9.6" y2="2.6" stroke="#cbd5e1" strokeWidth="0.9" />
          <circle cx="6.4" cy="2.2" r="0.9" fill="#cbd5e1" />
          <circle cx="9.6" cy="2.2" r="0.9" fill="#cbd5e1" />
        </svg>
      ) : (
        <span className="text-s1">
          <Wifi size={13} />
        </span>
      )
    case 'gas':
      return is3d ? (
        /* 3D: 함체 + 하부 센서 헤드 */
        <svg width="15" height="15" viewBox="0 0 16 16">
          <rect x="4.5" y="2.5" width="7" height="8" rx="1" fill="var(--series-3)" />
          <rect x="6.2" y="10.5" width="3.6" height="3" rx="1.2" fill="#64748b" />
        </svg>
      ) : (
        <span className="inline-block size-2.5 rotate-45 rounded-[2px] bg-s3" />
      )
    case 'tunnels':
      return is3d ? (
        /* 3D: U자 통로 채널 */
        <svg width="15" height="15" viewBox="0 0 16 16">
          <path d="M3 5 L3 11 L13 11 L13 5" fill="none" stroke="var(--series-1)" strokeWidth="1.6" strokeLinejoin="round" />
          <rect x="3" y="10" width="10" height="1.6" fill="var(--series-1)" opacity="0.7" />
        </svg>
      ) : (
        <span className="inline-block w-4 border-t-2 border-dashed border-s1" />
      )
    case 'stairs':
      return is3d ? (
        /* 3D: 계단 플라이트 */
        <svg width="15" height="15" viewBox="0 0 16 16">
          <path d="M2.5 13 H6 V9.8 H9.5 V6.6 H13 V3.4" fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
      ) : (
        <svg width="15" height="15" viewBox="0 0 16 16">
          <rect x="1.5" y="4" width="13" height="8" rx="1" fill="none" stroke="var(--axis-line)" strokeWidth="1" />
          {[4.5, 7, 9.5].map((x) => (
            <line key={x} x1={x} y1="4" x2={x} y2="12" stroke="var(--axis-line)" strokeWidth="1" />
          ))}
          <line x1="12.2" y1="5.6" x2="12.2" y2="10.4" stroke="var(--text-muted)" strokeWidth="1" />
          <path d="M11.2 6.6 L12.2 5.4 L13.2 6.6 M11.2 9.4 L12.2 10.6 L13.2 9.4" fill="none" stroke="var(--text-muted)" strokeWidth="1" />
        </svg>
      )
  }
}

const LAYER_ROWS: Array<{ key: LayerKey; label: string }> = [
  { key: 'workers', label: '작업자 · 이동형 검침기' },
  { key: 'beacons', label: '고정형 비콘' },
  { key: 'gateways', label: '게이트웨이' },
  { key: 'gas', label: '고정형 가스검침기' },
  { key: 'tunnels', label: '지하 공동구 · 출입구' },
  { key: 'stairs', label: '계단실' },
]

interface ViewBox {
  x: number
  y: number
  w: number
  h: number
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

/* ── 정적 레이어 (선택 층·줌 배율에만 반응) — 2D 평면도 ───────────── */
const StaticLayers = memo(function StaticLayers({
  floor,
  k,
  showGrid = true,
  show,
  onZoneOpen,
}: {
  floor: FloorId
  k: number
  showGrid?: boolean
  show: Record<LayerKey, boolean>
  onZoneOpen: (name: string) => void
}) {
  const layers = useMemo(() => {
    const gridLines: string[] = []
    for (let gx = 0; gx <= 1000; gx += 80) gridLines.push(toStr([[gx, 0], [gx, 640]]))
    for (let gy = 0; gy <= 640; gy += 80) gridLines.push(toStr([[0, gy], [1000, gy]]))

    /* 선택 층의 평면도만 표시 */
    const zs = zones
      .filter((z) => z.floors.includes(floor))
      .map((z) => ({ ...z, risk: (ZONE_RISK.get(z.name)?.level ?? 'good') as GasLevel }))
    const bs = mapBeacons.filter((b) => (b.level ?? 'F1') === floor)
    const gs = floor === 'F1' ? gateways : []
    const gds = (floor === 'F1' ? gasDetectors : []).map((g) => ({ ...g, lvl: gasSeverity(g) }))
    const tns = utilityTunnels
      .filter((t) => t.level === floor)
      .map((t) => ({ ...t, pts: toStr(t.path) }))
    const tl = floor === 'B1' ? { x: 620, y: 330 } : floor === 'B2' ? { x: 745, y: 330 } : null

    /* 계단실 — 설치된 건물에만(복수 개소 가능). 건물이 현재 층에
     * 표시될 때만, 그리고 계단이 지나는 층 범위에서만 보인다. */
    const stairs = stairwells.filter((s) => {
      const z = zones.find((zz) => zz.name === s.zone)
      return z?.floors.includes(floor) && LV_ORDER[floor] >= LV_ORDER[s.toLevel]
    })
    return { gridLines, zs, bs, gs, gds, tns, tl, stairs }
  }, [floor])

  const fontSize = Math.max(6, Math.min(14, 12 * k))
  const km = Math.min(k, 2.5) // 장비 마커는 광역 줌아웃에서 과대해지지 않도록 별도 상한
  const showDevices = k <= 4 // 광역 뷰에서는 장비 마커 숨김 (현장 식별 위주)
  const dash = floor !== 'F1' ? '5 4' : undefined // 지하 평면도는 점선 톤
  return (
    <>
      {showGrid &&
        layers.gridLines.map((pts, i) => (
          <polyline key={i} points={pts} fill="none" stroke="var(--grid-line)" strokeWidth="0.6" vectorEffect="non-scaling-stroke" />
        ))}
      {/* 지하 공동구 — 몸체는 불투명 스트로크를 그룹에 모아 그룹 opacity로 합성:
       * 분기·코너에서 라인이 겹쳐도 색이 진해지지 않는다. */}
      {show.tunnels && layers.tns.length > 0 && (
        <g>
          <g opacity={floor === 'B2' ? 0.12 : 0.16}>
            {layers.tns.map((t) => (
              <polyline
                key={t.id}
                points={t.pts}
                fill="none"
                stroke="var(--series-1)"
                strokeWidth="20"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <title>{`${t.name} · 지하 공동구 (${FLOOR_SHORT[t.level]})`}</title>
              </polyline>
            ))}
          </g>
          <g opacity="0.6" pointerEvents="none">
            {layers.tns.map((t) => (
              <polyline
                key={t.id}
                points={t.pts}
                fill="none"
                stroke="var(--series-1)"
                strokeWidth="1.4"
                strokeDasharray={floor === 'B2' ? '3 4' : '7 5'}
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </g>
        </g>
      )}
      {show.tunnels && layers.tl && (
        <text
          x={layers.tl.x}
          y={layers.tl.y}
          textAnchor="middle"
          fontSize={fontSize * 0.85}
          fill="var(--series-1)"
          opacity="0.85"
          fontWeight="600"
        >
          지하 공동구
        </text>
      )}
      {layers.zs.map((z) => {
        const zc = RISK_COLOR[z.risk]
        return (
          <g
            key={z.id}
            style={{ cursor: 'pointer' }}
            onClick={(e) => {
              e.stopPropagation()
              onZoneOpen(z.name)
            }}
          >
            <title>{`${z.name} · 클릭하면 건물 상세 보기`}</title>
            <polygon
              points={z.points}
              fill={zc}
              fillOpacity={z.risk === 'good' ? 0.1 : 0.16}
              stroke={zc}
              strokeOpacity={z.risk === 'good' ? 0.5 : 0.75}
              strokeWidth={z.risk === 'good' ? 1.2 : 1.8}
              strokeDasharray={dash}
              vectorEffect="non-scaling-stroke"
            >
              {z.risk !== 'good' && (
                <animate attributeName="fill-opacity" values="0.16;0.3;0.16" dur="2s" repeatCount="indefinite" />
              )}
            </polygon>
            <text x={z.labelX} y={z.labelY} textAnchor="middle" fontSize={fontSize} fill="var(--text-muted)" fontWeight="500">
              {z.name}
            </text>
            {z.risk !== 'good' && (
              <text
                x={z.labelX}
                y={z.labelY + fontSize + 2}
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
      {show.beacons && showDevices && layers.bs.map((b) => (
        <g key={b.id} transform={`translate(${b.x}, ${b.y}) scale(${km})`}>
          <rect x="-4.5" y="-4.5" width="9" height="9" rx="2" fill="var(--series-4)" opacity="0.9">
            <title>{`${b.id} · ${b.zone}`}</title>
          </rect>
          <rect x="-1.8" y="-1.8" width="3.6" height="3.6" rx="1" fill="var(--surface-1)" />
        </g>
      ))}
      {show.gateways && showDevices && layers.gs.map((g) => (
        <g key={g.id} transform={`translate(${g.x}, ${g.y}) scale(${km})`}>
          <circle r="10" fill="var(--series-1)" opacity="0.95">
            <title>{`${g.id} · ${g.zone}`}</title>
          </circle>
          <path d="M-4.5,-0.5 a6.3,6.3 0 0 1 9,0 M-2.4,1.8 a3.2,3.2 0 0 1 4.8,0" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" />
          <circle cy="4.2" r="1.3" fill="white" />
        </g>
      ))}
      {/* 고정형 가스검침기 — 마름모 마커, 판정 등급 색상 */}
      {show.gas && showDevices && layers.gds.map((g) => (
        <g key={g.id} transform={`translate(${g.x}, ${g.y}) scale(${km})`}>
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
      ))}
      {/* 공동구 출입구(수직구·계단실) */}
      {show.tunnels && showDevices && tunnelEntrances.map((e) => (
        <g key={e.id} transform={`translate(${e.x}, ${e.y}) scale(${km})`}>
          <rect x="-4" y="-4" width="8" height="8" rx="1.5" fill="var(--surface-1)" stroke="var(--series-1)" strokeWidth="1.4">
            <title>{`${e.id} · ${e.zone} 공동구 출입구 (${FLOOR_SHORT[e.level ?? 'B1']} 연결)`}</title>
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
      {/* 건물 계단실 — 상하층 이동 (건축 도면식 심볼 + ↕) */}
      {show.stairs && layers.stairs.map((s) => (
        <StairSymbol
          key={s.id}
          x={s.x}
          y={s.y}
          title={`${s.id} 계단실 · ${s.zone} (${FLOOR_SHORT[s.toLevel]}~지상 연결)`}
        />
      ))}
    </>
  )
})

/* ── 계단실 심볼 — 러그(디딤판) + 상하 화살표 ─────────────────────── */
function StairSymbol({ x, y, title }: { x: number; y: number; title: string }) {
  return (
    <g transform={`translate(${x}, ${y})`} opacity="0.95">
      <title>{title}</title>
      <rect
        x="-14"
        y="-9"
        width="28"
        height="18"
        rx="2"
        fill="var(--surface-1)"
        fillOpacity="0.75"
        stroke="var(--axis-line)"
        strokeWidth="1"
        vectorEffect="non-scaling-stroke"
      />
      {[-10, -6, -2, 2].map((rx) => (
        <line
          key={rx}
          x1={rx}
          y1={-9}
          x2={rx}
          y2={9}
          stroke="var(--axis-line)"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {/* ↕ 상하 이동 화살표 */}
      <line x1="8.5" y1="-5.5" x2="8.5" y2="5.5" stroke="var(--text-muted)" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
      <path d="M6.6,-3.6 L8.5,-6 L10.4,-3.6" fill="none" stroke="var(--text-muted)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <path d="M6.6,3.6 L8.5,6 L10.4,3.6" fill="none" stroke="var(--text-muted)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </g>
  )
}

/* ── 선택 작업자 이동 궤적 (최근 60초) ────────────────────────────── */
function Trail({ worker, tick }: { worker: LiveWorker; tick: number }) {
  const pts: Array<[number, number]> = []
  for (let k = 60; k >= 0; k -= 3) {
    const t = tick - k
    if (t < 0) continue
    pts.push(workerPosition(worker, t))
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

/* ── 작업자 레이어 (1초 tick) — 선택 층의 작업자만 표시 ─────────────── */
function WorkerLayer({
  tick,
  floor,
  k,
  selectedId,
  onSelect,
}: {
  tick: number
  floor: FloorId
  k: number
  selectedId: number | null
  onSelect: (id: number) => void
}) {
  return (
    <>
      {liveWorkers
        .filter((w) => w.outTime === null && workerFloor(w) === floor)
        .map((w) => {
          const [x, y] = workerPosition(w, tick)
          const color = w.danger ? 'var(--status-critical)' : 'var(--status-good)'
          const selected = w.id === selectedId
          const pgas = PORTABLE_BY_WORKER.get(w.id)
          return (
            <g
              key={w.id}
              style={{
                transform: `translate(${x}px, ${y}px)`,
                transition: 'transform 1s linear',
                cursor: 'pointer',
              }}
              onClick={(e) => {
                e.stopPropagation()
                onSelect(w.id)
              }}
            >
              <g transform={`scale(${k})`}>
                <g>
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
                    <title>{`${w.name} · ${w.space} ${w.zone} · ${w.heartRate}bpm`}</title>
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

/* ── 건물 상세 모달 — 구역 클릭 시 3D 단일 건물 뷰(기본) + 2D 층별 평면도 ──
 * 좌: three.js 3D(회전·줌·팬, 전체 층) 또는 층 탭 + 확대 평면도(실시간 위치)
 * 우: 위험도 판정 근거 · 재실 작업자 · 고정형 검침기 · 설비 요약 */
function ZoneDetailModal({
  zone,
  tick,
  onClose,
}: {
  zone: Zone
  tick: number
  onClose: () => void
}) {
  const floorsSorted = [...zone.floors].sort((a, b) => LV_ORDER[b] - LV_ORDER[a]) // 지상 → 지하
  const [vmode, setVmode] = useState<'3d' | '2d'>('3d') // 건물 상세는 3D가 기본
  const [fl, setFl] = useState<FloorId>(floorsSorted[0])
  const flat = vmode === '2d'

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const risk = ZONE_RISK.get(zone.name)
  const level: GasLevel = risk?.level ?? 'good'
  const zc = RISK_COLOR[level]

  /* 2D 평면도 — 구역 bbox + 여백 → 확대 viewBox */
  const basePts = parsePoints(zone.points)
  const pad = 55
  const x0 = Math.min(...basePts.map((p) => p[0])) - pad
  const y0 = Math.min(...basePts.map((p) => p[1])) - pad
  const bw = Math.max(...basePts.map((p) => p[0])) + pad - x0
  const bh = Math.max(...basePts.map((p) => p[1])) + pad - y0
  const msc = Math.max(0.5, bw / 460) // 마커 확대 배율 — 크게 보되 과대 방지

  /* 표시 오브젝트(2D) — 선택 층 필터. viewBox 클리핑으로 구역 주변만 보인다 */
  const beacons = mapBeacons.filter((b) => (b.level ?? 'F1') === fl)
  const dets = fl === 'F1' ? gasDetectors : []
  const gws = fl === 'F1' ? gateways : []
  const tuns = utilityTunnels.filter((t) => t.level === fl)
  const zoneWorkers = liveWorkers.filter((w) => w.outTime === null && w.zone === zone.name)
  const floorWorkers = zoneWorkers.filter((w) => workerFloor(w) === fl)
  const zoneDets = gasDetectors.filter((d) => d.zone === zone.name)
  const zoneBeaconCnt = mapBeacons.filter((b) => b.zone === zone.name).length
  const zoneGwCnt = gateways.filter((g) => g.zone === zone.name).length
  const zoneEnts = tunnelEntrances.filter((e) => e.zone === zone.name)
  const fontPx = 10 * msc

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex h-[min(82vh,780px)] w-full max-w-5xl flex-col overflow-hidden rounded-[14px] border border-hairline bg-surface-1"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center gap-3 border-b border-hairline px-5 py-3.5">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-lg font-semibold text-ink">{zone.name}</h2>
              <span
                className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${RISK_CHIP[level].cls}`}
              >
                {RISK_CHIP[level].label}
              </span>
            </div>
            <p className="mt-0.5 truncate text-xs text-muted">
              {zone.floors.map((f) => floorDefs.find((d) => d.id === f)!.name).join(' · ')}
              {risk?.cause && <span className="ml-2 text-serious">{risk.cause}</span>}
            </p>
          </div>
          <button
            onClick={onClose}
            className="ml-auto flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-hairline text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
            aria-label="닫기"
            title="닫기 (ESC)"
          >
            <X size={15} />
          </button>
        </div>

        <div className="flex min-h-0 flex-1">
          {/* 좌: 층 탭 + 확대 평면도 */}
          <div className="flex min-w-0 flex-1 flex-col gap-2 p-4">
            <div className="flex shrink-0 flex-wrap items-center gap-1.5">
              <div className="flex rounded-lg border border-hairline p-0.5">
                {(['3d', '2d'] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setVmode(m)}
                    className={`h-7 cursor-pointer whitespace-nowrap rounded-md px-2.5 text-xs font-semibold transition-colors ${
                      vmode === m ? 'bg-primary text-white' : 'text-ink-2 hover:bg-surface-2'
                    }`}
                  >
                    {m === '3d' ? '3D · 전체 층' : '2D · 층별'}
                  </button>
                ))}
              </div>
              <div
                className={`flex rounded-lg border border-hairline p-0.5 transition-opacity ${
                  !flat ? 'pointer-events-none opacity-40' : ''
                }`}
              >
                {floorsSorted.map((f) => {
                  const def = floorDefs.find((d) => d.id === f)!
                  const cnt = zoneWorkers.filter((w) => workerFloor(w) === f).length
                  return (
                    <button
                      key={f}
                      onClick={() => setFl(f)}
                      className={`h-7 cursor-pointer whitespace-nowrap rounded-md px-2.5 text-xs font-semibold transition-colors ${
                        flat && fl === f ? 'bg-primary text-white' : 'text-ink-2 hover:bg-surface-2'
                      }`}
                    >
                      {def.short}
                      {cnt > 0 && <span className="ml-1 opacity-80">({cnt})</span>}
                    </button>
                  )
                })}
              </div>
              <span className="ml-auto text-[11px] text-muted">
                {flat ? '1초 갱신 · 실시간 위치' : '드래그 회전 · 휠 줌 · 실시간 위치'}
              </span>
            </div>
            <div className="relative min-h-0 flex-1 overflow-hidden rounded-[10px] bg-page ring-1 ring-hairline">
              {!flat ? (
                /* 3D 단일 건물 뷰 — 전체 층 볼륨 + 주변 공동구·장비, 회전·줌 */
                <Suspense
                  fallback={
                    <div className="flex h-full items-center justify-center text-sm text-muted">
                      3D 뷰 로딩 중…
                    </div>
                  }
                >
                  <Site3D focusZone={zone.name} />
                </Suspense>
              ) : (
              <svg viewBox={`${x0} ${y0} ${bw} ${bh}`} className="h-full w-full" role="img" aria-label={`${zone.name} 상세 평면도`}>
                {/* 공동구 (선택 층) — 몸체는 그룹 opacity 합성으로 교차부 색 진해짐 방지 */}
                {tuns.length > 0 && (
                  <g>
                    <g opacity={fl === 'B2' ? 0.12 : 0.16}>
                      {tuns.map((t) => (
                        <polyline key={t.id} points={toStr(t.path)} fill="none" stroke="var(--series-1)" strokeWidth="20" strokeLinecap="round" strokeLinejoin="round">
                          <title>{`${t.name} (${FLOOR_SHORT[t.level]})`}</title>
                        </polyline>
                      ))}
                    </g>
                    <g opacity="0.55" pointerEvents="none">
                      {tuns.map((t) => (
                        <polyline key={t.id} points={toStr(t.path)} fill="none" stroke="var(--series-1)" strokeWidth="1.2" strokeDasharray={fl === 'B2' ? '3 4' : '6 4'} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                      ))}
                    </g>
                  </g>
                )}
                {/* 구역 평면 폴리곤 — 위험도 색 */}
                <polygon
                  points={zone.points}
                  fill={zc}
                  fillOpacity={level === 'good' ? 0.08 : 0.13}
                  stroke={zc}
                  strokeOpacity="0.7"
                  strokeWidth="1.6"
                  vectorEffect="non-scaling-stroke"
                >
                  {level !== 'good' && (
                    <animate attributeName="fill-opacity" values="0.13;0.24;0.13" dur="2s" repeatCount="indefinite" />
                  )}
                </polygon>
                {/* 공동구 출입구 */}
                {tunnelEntrances.map((e) => (
                  <g key={e.id} transform={`translate(${e.x}, ${e.y}) scale(${msc})`}>
                    <rect x="-4" y="-4" width="8" height="8" rx="1.5" fill="var(--surface-1)" stroke="var(--series-1)" strokeWidth="1.4">
                      <title>{`${e.id} · 공동구 출입구 (${FLOOR_SHORT[e.level ?? 'B1']} 연결)`}</title>
                    </rect>
                    <path d="M-2,-1 L0,1.6 L2,-1" fill="none" stroke="var(--series-1)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" pointerEvents="none" />
                  </g>
                ))}
                {/* 계단실 — 상하층 이동 (설치된 건물만, 복수 개소 가능) */}
                {stairwells
                  .filter((s) => s.zone === zone.name)
                  .map((s) => (
                    <StairSymbol
                      key={s.id}
                      x={s.x}
                      y={s.y}
                      title={`${s.id} 계단실 · ${s.zone} (${FLOOR_SHORT[s.toLevel]}~지상 연결)`}
                    />
                  ))}
                {/* 비콘 */}
                {beacons.map((b) => (
                  <g key={b.id} transform={`translate(${b.x}, ${b.y}) scale(${msc})`}>
                    <rect x="-4.5" y="-4.5" width="9" height="9" rx="2" fill="var(--series-4)" opacity="0.9">
                      <title>{`${b.id} · ${b.zone} (${FLOOR_SHORT[b.level ?? 'F1']})`}</title>
                    </rect>
                    <rect x="-1.8" y="-1.8" width="3.6" height="3.6" rx="1" fill="var(--surface-1)" />
                  </g>
                ))}
                {/* 게이트웨이 */}
                {gws.map((g) => (
                  <g key={g.id} transform={`translate(${g.x}, ${g.y}) scale(${msc})`}>
                    <circle r="10" fill="var(--series-1)" opacity="0.95">
                      <title>{`${g.id} · ${g.zone}`}</title>
                    </circle>
                    <path d="M-4.5,-0.5 a6.3,6.3 0 0 1 9,0 M-2.4,1.8 a3.2,3.2 0 0 1 4.8,0" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" />
                    <circle cy="4.2" r="1.3" fill="white" />
                  </g>
                ))}
                {/* 고정형 가스검침기 */}
                {dets.map((g) => {
                  const lvl = gasSeverity(g)
                  return (
                    <g key={g.id} transform={`translate(${g.x}, ${g.y}) scale(${msc})`}>
                      {lvl === 'critical' && (
                        <circle r="12" fill="none" stroke={GAS_COLOR[lvl]} strokeWidth="2" opacity="0.7">
                          <animate attributeName="r" values="7;16" dur="1.2s" repeatCount="indefinite" />
                          <animate attributeName="opacity" values="0.7;0" dur="1.2s" repeatCount="indefinite" />
                        </circle>
                      )}
                      <rect x="-5.2" y="-5.2" width="10.4" height="10.4" rx="2" transform="rotate(45)" fill={GAS_COLOR[lvl]} stroke="var(--surface-1)" strokeWidth="1.2">
                        <title>{`${g.id} · ${g.zone} (O₂ ${g.o2}% · H₂S ${g.h2s} · CO ${g.co} · NH₃ ${g.nh3} · CH₄ ${g.ch4})`}</title>
                      </rect>
                      <path d="M0,-3 C1.8,-1 2.6,0.1 2.6,1.1 A2.6,2.6 0 1 1 -2.6,1.1 C-2.6,0.1 -1.8,-1 0,-3 Z" fill="var(--surface-1)" pointerEvents="none" />
                    </g>
                  )
                })}
                {/* 작업자 — 실시간 이동 (선택 층) */}
                {floorWorkers.map((w) => {
                  const [x, y] = workerPosition(w, tick)
                  const color = w.danger ? 'var(--status-critical)' : 'var(--status-good)'
                  const pgas = PORTABLE_BY_WORKER.get(w.id)
                  return (
                    <g key={w.id} style={{ transform: `translate(${x}px, ${y}px)`, transition: 'transform 1s linear' }}>
                      <g transform={`scale(${msc})`}>
                        {w.danger && (
                          <circle r="14" fill="none" stroke={color} strokeWidth="2" opacity="0.7">
                            <animate attributeName="r" values="8;18" dur="1.2s" repeatCount="indefinite" />
                            <animate attributeName="opacity" values="0.7;0" dur="1.2s" repeatCount="indefinite" />
                          </circle>
                        )}
                        <circle r="6.5" fill={color} stroke="var(--surface-1)" strokeWidth="2">
                          <title>{`${w.name} · ${w.space} · ${w.heartRate}bpm`}</title>
                        </circle>
                        {pgas && (
                          <g transform="translate(8.5, -8.5)">
                            <rect x="-3.8" y="-3.8" width="7.6" height="7.6" rx="1.5" transform="rotate(45)" fill={GAS_COLOR[gasSeverity(pgas)]} stroke="var(--surface-1)" strokeWidth="1.2">
                              <title>{`${pgas.id} · 이동형 (${w.name} 휴대)`}</title>
                            </rect>
                          </g>
                        )}
                        <text y="20" textAnchor="middle" fontSize="11" fontWeight="600" fill="var(--text-secondary)" paintOrder="stroke" stroke="var(--page)" strokeWidth="3">
                          {w.name}
                        </text>
                      </g>
                    </g>
                  )
                })}
                {floorWorkers.length === 0 && (
                  <text x={x0 + bw / 2} y={y0 + bh / 2} textAnchor="middle" fontSize={fontPx * 1.1} fill="var(--text-muted)">
                    이 층에 재실 작업자가 없습니다
                  </text>
                )}
              </svg>
              )}
            </div>
          </div>

          {/* 우: 현황 정보 */}
          <div className="w-80 shrink-0 overflow-y-auto border-l border-hairline p-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">위험도 판정</p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">
              {risk?.cause ? (
                <>
                  <span className={level === 'critical' ? 'font-semibold text-critical' : 'font-semibold text-serious'}>
                    {RISK_CHIP[level].label}
                  </span>{' '}
                  — {risk.cause}
                </>
              ) : (
                '모든 검침 값이 기준 이내입니다.'
              )}
            </p>

            <p className="mt-4 text-[10px] font-semibold uppercase tracking-wider text-muted">
              재실 작업자 ({zoneWorkers.length})
            </p>
            <ul className="mt-1.5 flex flex-col divide-y divide-hairline">
              {zoneWorkers.map((w) => {
                const pgas = PORTABLE_BY_WORKER.get(w.id)
                return (
                  <li key={w.id} className="flex items-center gap-2 py-1.5 text-[13px]">
                    <span className={`size-2 shrink-0 rounded-full ${w.danger ? 'animate-pulse bg-critical' : 'bg-good'}`} />
                    <span className="font-medium text-ink">{w.name}</span>
                    <span className="text-[11px] text-muted">{w.space}</span>
                    <span className={`ml-auto font-mono text-xs ${w.danger ? 'font-semibold text-critical' : 'text-ink-2'}`}>
                      {w.heartRate}bpm
                    </span>
                    {pgas && (
                      <span className="rounded-md bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-ink-2" title="이동형 가스검침기 휴대">
                        {pgas.id}
                      </span>
                    )}
                  </li>
                )
              })}
              {zoneWorkers.length === 0 && <li className="py-1.5 text-xs text-muted">재실 작업자가 없습니다.</li>}
            </ul>

            <p className="mt-4 text-[10px] font-semibold uppercase tracking-wider text-muted">
              고정형 가스검침기 ({zoneDets.length})
            </p>
            {zoneDets.map((d) => (
              <div key={d.id} className="mt-1.5 rounded-[10px] bg-page/60 p-2.5">
                <p className="font-mono text-[11px] text-ink">{d.id}</p>
                <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
                  {gasMetrics.map((m) => (
                    <span key={m.key} className="text-[11px] text-muted">
                      {m.label}{' '}
                      <span className="font-mono font-semibold" style={{ color: m.color }}>
                        {d[m.key]}
                      </span>
                      <span className="ml-0.5 text-[9px]">{m.unit}</span>
                    </span>
                  ))}
                </div>
              </div>
            ))}
            {zoneDets.length === 0 && <p className="mt-1.5 text-xs text-muted">설치된 고정형 검침기가 없습니다.</p>}

            <p className="mt-4 text-[10px] font-semibold uppercase tracking-wider text-muted">설비</p>
            <div className="mt-1.5 grid grid-cols-3 gap-2">
              {(
                [
                  ['비콘', zoneBeaconCnt],
                  ['게이트웨이', zoneGwCnt],
                  ['공동구 출입구', zoneEnts.length],
                ] as const
              ).map(([label, cnt]) => (
                <div key={label} className="rounded-[10px] bg-page/60 px-2 py-2 text-center">
                  <p className="text-lg font-bold text-ink" style={{ fontVariantNumeric: 'tabular-nums' }}>{cnt}</p>
                  <p className="mt-0.5 text-[10px] text-muted">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
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
  const [mode, setMode] = useState<MapMode>('2d')
  const [floor, setFloor] = useState<FloorId>('F1')
  const [bg, setBg] = useState<BgKind>('none')
  const [full, setFull] = useState(false)
  const [vb, setVb] = useState<ViewBox>(BASE)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [detailZone, setDetailZone] = useState<string | null>(null)
  const [legendOpen, setLegendOpen] = useState(false)
  const [layersOn, setLayersOn] = useState<Record<LayerKey, boolean>>(ALL_LAYERS_ON)

  const wrapRef = useRef<HTMLDivElement>(null)
  const vbRef = useRef(vb)
  vbRef.current = vb
  const modeRef = useRef(mode)
  modeRef.current = mode
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
      if (modeRef.current === '3d') return // 3D는 OrbitControls가 줌 처리
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

  /* 층 위아래 이동 — 2D는 표시 층, 2.5D는 포커스 층 변경 */
  const stepFloor = (dir: 1 | -1) =>
    setFloor((f) => {
      const order: FloorId[] = ['F1', 'B1', 'B2']
      return order[Math.min(order.length - 1, Math.max(0, order.indexOf(f) + dir))]
    })

  const onPointerDown = (e: React.PointerEvent) => {
    panRef.current = { x0: e.clientX, y0: e.clientY, vb0: vbRef.current, active: true, moved: false }
    /* 주의: 여기서 setPointerCapture를 걸면 click이 래퍼로 리타게팅되어
     * 구역(건물)·작업자 클릭이 무시된다 — 캡처는 드래그 확정 시점에 건다 */
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const p = panRef.current
    if (!p.active || !wrapRef.current) return
    const dx = e.clientX - p.x0
    const dy = e.clientY - p.y0
    if (!p.moved && Math.abs(dx) + Math.abs(dy) > 4) {
      p.moved = true
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId) // 화면 밖까지 팬 유지
    }
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
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-y-1.5 px-1">
        <div className="flex min-w-0 items-baseline gap-2">
          <h2 className="whitespace-nowrap text-base font-medium text-ink">실시간 위치 관제</h2>
          <span className="truncate text-[11px] text-muted">비콘 {tracking}명 추적 중 · 1초 갱신</span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {/* 배경 지도 (2D 전용 — 레거시 지도/스카이뷰 대응) */}
          <div
            className={`flex rounded-lg border border-hairline p-0.5 transition-opacity ${
              mode !== '2d' ? 'pointer-events-none opacity-40' : ''
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
                className={`h-7 cursor-pointer whitespace-nowrap rounded-md px-2.5 text-xs font-semibold transition-colors ${
                  bg === v ? 'bg-primary text-white' : 'text-ink-2 hover:bg-surface-2'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {/* 층 선택 (2D 전용 — 3D는 전 층 표시) · ▲▼로 위아래 층 이동 */}
          <div
            className={`flex rounded-lg border border-hairline p-0.5 transition-opacity ${
              mode === '3d' ? 'pointer-events-none opacity-40' : ''
            }`}
          >
            {floorDefs.map((f) => (
              <button
                key={f.id}
                onClick={() => setFloor(f.id)}
                className={`h-7 cursor-pointer whitespace-nowrap rounded-md px-2.5 text-xs font-semibold transition-colors ${
                  floor === f.id ? 'bg-primary text-white' : 'text-ink-2 hover:bg-surface-2'
                }`}
                title={f.name}
              >
                {f.short}
              </button>
            ))}
            <div className="mx-0.5 w-px self-stretch bg-hairline" />
            <button
              onClick={() => stepFloor(-1)}
              disabled={floor === 'F1'}
              className={floorStepBtn}
              aria-label="위층으로"
              title="위층으로"
            >
              <ChevronUp size={14} />
            </button>
            <button
              onClick={() => stepFloor(1)}
              disabled={floor === 'B2'}
              className={floorStepBtn}
              aria-label="아래층으로"
              title="아래층으로"
            >
              <ChevronDown size={14} />
            </button>
          </div>
          <div className="flex rounded-lg border border-hairline p-0.5">
            {(['2d', '3d'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`h-7 cursor-pointer whitespace-nowrap rounded-md px-2.5 text-xs font-semibold transition-colors ${
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
        style={{ cursor: mode === '3d' ? 'grab' : panRef.current.active ? 'grabbing' : 'grab' }}
        onPointerDown={mode === '3d' ? undefined : onPointerDown}
        onPointerMove={mode === '3d' ? undefined : onPointerMove}
        onPointerUp={mode === '3d' ? undefined : onPointerUp}
        onPointerCancel={mode === '3d' ? undefined : onPointerUp}
        onClickCapture={(e) => {
          /* 드래그 팬 직후의 클릭은 구역 상세/선택 해제로 이어지지 않게 차단 */
          if (mode !== '3d' && panRef.current.moved) e.stopPropagation()
        }}
        onClick={() => {
          if (mode !== '3d' && !panRef.current.moved) setSelectedId(null)
        }}
      >
        {mode !== '3d' ? (
          <svg
            viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
            className="h-full w-full"
            role="img"
            aria-label="현장 실시간 위치 지도"
          >
            {mode === '2d' && bg !== 'none' && (
              <TileLayer vb={vb} kind={bg} screenW={wrapRef.current?.clientWidth ?? 900} />
            )}
            <StaticLayers
              floor={floor}
              k={k}
              showGrid={bg === 'none'}
              show={layersOn}
              onZoneOpen={setDetailZone}
            />
            {layersOn.workers && selected && !selected.outTime && workerFloor(selected) === floor && (
              <Trail worker={selected} tick={tick} />
            )}
            {layersOn.workers && (
              <WorkerLayer tick={tick} floor={floor} k={k} selectedId={selectedId} onSelect={setSelectedId} />
            )}
          </svg>
        ) : (
          /* three.js 3D 뷰 — OrbitControls 회전·줌·팬 */
          <Suspense
            fallback={
              <div className="flex h-full items-center justify-center text-sm text-muted">
                3D 뷰 로딩 중…
              </div>
            }
          >
            {/* 3D는 층 구분 없이 전체 사업소(건물·공동구)를 모두 표시, 건물 클릭 → 상세 */}
            <Site3D onZoneOpen={setDetailZone} layers={layersOn} />
          </Suspense>
        )}

        {/* 줌 컨트롤 (SVG 모드 전용 — 3D는 OrbitControls) */}
        {mode !== '3d' && (
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
        )}

        {/* 선택 작업자 위치 이력 */}
        {selected && mode !== '3d' && (
          <HistoryPanel worker={selected} tick={tick} onClose={() => setSelectedId(null)} />
        )}

        {/* 레이어 범례 — 좌하단 미니멀 토글 패널 (펼치면 항목별 표시/숨김) */}
        <div
          className="absolute bottom-3 left-3 z-10"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          {legendOpen ? (
            <div className="w-56 rounded-[10px] border border-hairline bg-surface-1/92 p-2 backdrop-blur-sm">
              <div className="flex items-center justify-between px-1 pb-1">
                <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted">
                  <Layers size={11} /> 레이어
                </span>
                <button
                  onClick={() => setLegendOpen(false)}
                  className="flex size-5 cursor-pointer items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-ink"
                  aria-label="범례 접기"
                >
                  <X size={11} />
                </button>
              </div>
              <ul className="flex flex-col gap-0.5">
                {LAYER_ROWS.map((row) => (
                  <li key={row.key}>
                    <button
                      onClick={() => setLayersOn((prev) => ({ ...prev, [row.key]: !prev[row.key] }))}
                      className={`flex w-full cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-[11px] transition-colors hover:bg-surface-2 ${
                        layersOn[row.key] ? 'text-ink-2' : 'text-muted opacity-45'
                      }`}
                      title={layersOn[row.key] ? '클릭하여 숨기기' : '클릭하여 표시'}
                    >
                      <span className="flex w-5 shrink-0 items-center justify-center">
                        <LayerIcon k={row.key} is3d={mode === '3d'} />
                      </span>
                      <span className="truncate">{row.label}</span>
                      <span className="ml-auto text-[9px] font-semibold tracking-wide">
                        {layersOn[row.key] ? 'ON' : 'OFF'}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <p className="mt-1 border-t border-hairline px-1 pt-1.5 text-[10px] leading-relaxed text-muted">
                {mode === '3d' ? '드래그 회전 · 휠 줌 · 건물 클릭 → 상세' : '건물 클릭 → 상세 보기'}
              </p>
            </div>
          ) : (
            <button
              onClick={() => setLegendOpen(true)}
              className="flex size-9 cursor-pointer items-center justify-center rounded-[10px] border border-hairline bg-surface-1/85 text-ink-2 backdrop-blur-sm transition-colors hover:bg-surface-2 hover:text-ink"
              aria-label="레이어 범례 펼치기"
              title="레이어 범례"
            >
              <Layers size={16} />
            </button>
          )}
        </div>

        <div className="absolute bottom-3 right-3 flex items-center gap-2 text-[10px] text-muted">
          {mode === '2d' && bg === 'map' && <span className="opacity-80">© OpenStreetMap · CARTO</span>}
          {mode === '2d' && bg === 'sat' && <span className="opacity-80">© Esri World Imagery</span>}
          {mode === '2d' && <ScaleBar vb={vb} wrap={wrapRef.current} />}
        </div>
      </div>

      {/* 건물 상세 모달 — 팬/줌 핸들러 밖에 렌더링, 구역 변경 시 리마운트 */}
      {detailZone && (
        <ZoneDetailModal
          key={detailZone}
          zone={zones.find((z) => z.name === detailZone)!}
          tick={tick}
          onClose={() => setDetailZone(null)}
        />
      )}
    </div>
  )
}
