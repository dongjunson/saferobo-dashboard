// 맵 빌더 도메인 모델 — 사용자가 그리는 사이트맵(건물·지오펜스·심볼).
// 캔버스는 관제 지도와 동일한 1000×640 좌표계를 사용하고,
// 작업본은 localStorage에 자동 저장된다. 실제 연동 시 서버 저장으로 교체.

import { gasDetectors, gateways, mapBeacons, rooms, stairwells, tunnelEntrances, utilityTunnels, zones } from './site'

export type BuilderShape = 'rect' | 'ellipse' | 'poly'

/** 다각형 정점 — c=true면 곡선 정점(앞뒤 중점 사이를 Q 베지어로 스무딩) */
export interface BPoint {
  x: number
  y: number
  c?: boolean
}

/** 건물 — bbox(x,y,w,h) + 지상/지하 층수. 타원은 bbox 내접 타원,
 * poly는 포인트 직접 그리기(pts 절대좌표, bbox는 항상 동기화 유지) */
export interface BBuilding {
  id: string
  kind: 'building'
  name: string
  shape: BuilderShape
  x: number
  y: number
  w: number
  h: number
  /** 지상 층수 (0이면 지하 전용 구조물) */
  floorsUp: number
  /** 지하 층수 */
  floorsDown: number
  /** poly 전용 — 다각형 정점 */
  pts?: BPoint[]
  /** 오브젝트 회전각(°, 시계방향) — bbox 중심 기준 */
  rot?: number
}

/** 지하 공동구 라인 — 폴리라인 경로 + 설치 층(-1=지하1층, -2=지하2층) */
export interface BTunnel {
  id: string
  kind: 'tunnel'
  name: string
  path: Array<[number, number]>
  level: number
  /** 통로 폭 (기본 18) */
  width?: number
}

/** 작업영역(Room) — 건물 내 층별 세부 작업 구획.
 * shape 생략 시 직각(구버전 저장본 호환) */
export interface BRoom {
  id: string
  kind: 'room'
  name: string
  shape?: BuilderShape
  x: number
  y: number
  w: number
  h: number
  level: number
  /** poly 전용 — 다각형 정점 */
  pts?: BPoint[]
  /** 오브젝트 회전각(°, 시계방향) — bbox 중심 기준 */
  rot?: number
}

/** 지오펜스 — 층(level)에 귀속되는 가상 감시 구역. level: 1=지상1층, -1=지하1층.
 * 등급(주의/위험 등)은 관제 실데이터에서 동적으로 판정되므로 빌더는 경계만 정의한다 */
export interface BGeofence {
  id: string
  kind: 'fence'
  name: string
  shape: BuilderShape
  x: number
  y: number
  w: number
  h: number
  level: number
  /** poly 전용 — 다각형 정점 */
  pts?: BPoint[]
  /** 오브젝트 회전각(°, 시계방향) — bbox 중심 기준 */
  rot?: number
}

/** 배치 심볼 — 하수도 사업소 설비/장비 마커 (x,y는 중심점).
 * level은 설치 층(계단은 시작 층) */
export interface BSymbol {
  id: string
  kind: 'symbol'
  type: SymbolType
  name: string
  x: number
  y: number
  level: number
  /** 계단 전용 — 도착 층 (시작층보다 낮으면 하행, 높으면 상행) */
  toLevel?: number
  /** 계단·출입구 전용 — 폭 (계단 기본 34, 출입구 기본 12) */
  width?: number
  /** 계단·출입구 전용 — 회전각(°, 시계방향). 출입구는 벽면 스냅 시 자동 설정 */
  rot?: number
  /** 비콘 전용 — 소속 지오펜스 id (비콘은 지오펜스 내부에만 배치) */
  fenceId?: string
}

export type BElement = BBuilding | BGeofence | BSymbol | BTunnel | BRoom

/** 지오펜스 표시색 — 가상 영역(홀로그램) 톤. 등급색은 관제 실데이터 연동 시 동적 적용 */
export const FENCE_COLOR = '#22d3ee'

/* ── 심볼 팔레트 — 하수도 사업소 설비 세트 ── */
export const SYMBOL_DEFS = [
  { type: 'gateway', code: 'GW', label: '중계기', color: '#3b82f6' },
  { type: 'beacon', code: 'BC', label: '비콘', color: '#8b5cf6' },
  { type: 'gas', code: 'GAS', label: '가스검침기', color: '#f59e0b' },
  { type: 'door', code: 'DR', label: '출입구', color: '#38bdf8' },
  { type: 'stairs', code: 'ST', label: '계단실', color: '#94a3b8' },
  { type: 'entrance', code: 'ENT', label: '공동구 출입구', color: '#60a5fa' },
] as const
export type SymbolType = (typeof SYMBOL_DEFS)[number]['type']

export function symbolDef(type: SymbolType) {
  return SYMBOL_DEFS.find((s) => s.type === type)!
}

/** 층 번호 → 표시명 (1 → 지상 1층, -2 → 지하 2층) */
export function levelName(n: number): string {
  return n > 0 ? `지상 ${n}층` : `지하 ${-n}층`
}

/** 층 번호 → 짧은 표시명 (2 → 2F, -1 → B1) */
export function levelShort(n: number): string {
  return n > 0 ? `${n}F` : `B${-n}`
}

/* ── 다각형(포인트 드로잉) 경로 유틸 ──────────────────────────────────
 * 곡선 정점(c)은 앞뒤 이웃과의 중점 사이를 해당 정점을 제어점으로 하는
 * Q 베지어로 스무딩한다. 코너 정점은 그대로 꼭짓점. */

const midOf = (a: BPoint, b: BPoint) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })

/** SVG path 문자열 — close=false면 열린 경로(드로잉 프리뷰), 양 끝은 코너 취급 */
export function polyPath(pts: BPoint[], close = true): string {
  const n = pts.length
  if (n < 2) return ''
  const at = (i: number) => pts[((i % n) + n) % n]
  const isCurve = (i: number) => !!at(i).c && (close || (i > 0 && i < n - 1))
  const parts: string[] = []
  const startAtMid = isCurve(0)
  const start = startAtMid ? midOf(at(-1), at(0)) : at(0)
  parts.push(`M ${start.x},${start.y}`)
  for (let i = startAtMid ? 0 : 1; i < n; i++) {
    const v = at(i)
    if (isCurve(i)) {
      /* 직전이 코너면 대칭 스무딩을 위해 중점까지 직선 후 곡선 시작 */
      if (!isCurve(i - 1) && !(startAtMid && i === 0)) {
        const m = midOf(at(i - 1), v)
        parts.push(`L ${m.x},${m.y}`)
      }
      const m2 = midOf(v, at(i + 1))
      parts.push(`Q ${v.x},${v.y} ${m2.x},${m2.y}`)
    } else {
      parts.push(`L ${v.x},${v.y}`)
    }
  }
  if (close) parts.push('Z')
  return parts.join(' ')
}

/** 곡선 포함 다각형 → 샘플링된 폴리라인 좌표 (대시보드 Zone·3D 볼륨용) */
export function samplePoly(pts: BPoint[], seg = 8): Array<[number, number]> {
  const n = pts.length
  if (n < 3) return pts.map((p) => [p.x, p.y])
  const at = (i: number) => pts[((i % n) + n) % n]
  const out: Array<[number, number]> = []
  for (let i = 0; i < n; i++) {
    const v = at(i)
    if (!v.c) {
      out.push([v.x, v.y])
      continue
    }
    /* Q(중점 → v 제어 → 다음 중점) 구간을 seg등분 샘플링 */
    const p0 = midOf(at(i - 1), v)
    const p2 = midOf(v, at(i + 1))
    for (let s = 0; s <= seg; s++) {
      const t = s / seg
      const a = 1 - t
      out.push([
        a * a * p0.x + 2 * a * t * v.x + t * t * p2.x,
        a * a * p0.y + 2 * a * t * v.y + t * t * p2.y,
      ])
    }
  }
  return out
}

/** 정점 배열의 bbox — poly 건물의 x/y/w/h 동기화용 */
export function ptsBBox(pts: BPoint[]): { x: number; y: number; w: number; h: number } {
  const xs = pts.map((p) => p.x)
  const ys = pts.map((p) => p.y)
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }
}

/** 좌표 배열을 (cx,cy) 기준 deg° 회전 — 오브젝트 회전을 지오메트리에 굽는 용도 */
export function rotateOutline(
  pts: Array<[number, number]>,
  deg: number,
  cx: number,
  cy: number,
): Array<[number, number]> {
  const rad = (deg * Math.PI) / 180
  const c = Math.cos(rad)
  const s = Math.sin(rad)
  return pts.map(([x, y]) => [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c])
}

/** BPoint 배열 회전 — 곡선 플래그 유지 */
export function rotateBPts(pts: BPoint[], deg: number, cx: number, cy: number): BPoint[] {
  const rad = (deg * Math.PI) / 180
  const c = Math.cos(rad)
  const s = Math.sin(rad)
  return pts.map((p) => ({
    ...p,
    x: cx + (p.x - cx) * c - (p.y - cy) * s,
    y: cy + (p.x - cx) * s + (p.y - cy) * c,
  }))
}

/** 형태 요소의 외곽선 좌표 — 직각/타원/다각형 공통, 회전(rot) 반영.
 * 대시보드 변환·3D 렌더링에서 공용으로 사용한다. */
export function shapeOutline(
  el: { shape?: BuilderShape; x: number; y: number; w: number; h: number; pts?: BPoint[]; rot?: number },
  ellipseSeg = 32,
): Array<[number, number]> {
  let out: Array<[number, number]>
  if (el.shape === 'poly' && el.pts) {
    out = samplePoly(el.pts)
  } else if (el.shape === 'ellipse') {
    out = Array.from({ length: ellipseSeg }, (_, i) => {
      const t = (i / ellipseSeg) * Math.PI * 2
      return [el.x + el.w / 2 + (el.w / 2) * Math.cos(t), el.y + el.h / 2 + (el.h / 2) * Math.sin(t)] as [number, number]
    })
  } else {
    out = [
      [el.x, el.y],
      [el.x + el.w, el.y],
      [el.x + el.w, el.y + el.h],
      [el.x, el.y + el.h],
    ]
  }
  const rot = el.rot ?? 0
  return rot ? rotateOutline(out, rot, el.x + el.w / 2, el.y + el.h / 2) : out
}

/* ── 샘플 — 관제 도메인(site.ts)의 군포 하수도 사업소를 빌더 요소로 변환 ── */
export function sampleElements(): BElement[] {
  let seq = 1
  const id = () => `el-${seq++}`
  const els: BElement[] = []

  for (const z of zones) {
    const pts = z.points
      .trim()
      .split(/\s+/)
      .map((p) => p.split(',').map(Number))
    const xs = pts.map((p) => p[0])
    const ys = pts.map((p) => p[1])
    const x = Math.min(...xs)
    const y = Math.min(...ys)
    els.push({
      id: id(),
      kind: 'building',
      name: z.name,
      shape: 'rect',
      x,
      y,
      w: Math.max(...xs) - x,
      h: Math.max(...ys) - y,
      floorsUp: z.floors.includes('F1') ? 1 : 0,
      floorsDown: z.floors.filter((f) => f !== 'F1').length,
    })
  }

  for (const g of gateways)
    els.push({ id: id(), kind: 'symbol', type: 'gateway', name: g.id, x: g.x, y: g.y, level: 1 })
  for (const b of mapBeacons)
    els.push({
      id: id(), kind: 'symbol', type: 'beacon', name: b.id, x: b.x, y: b.y,
      level: b.level === 'B2' ? -2 : b.level === 'B1' ? -1 : 1,
    })
  for (const g of gasDetectors)
    els.push({ id: id(), kind: 'symbol', type: 'gas', name: g.id, x: g.x, y: g.y, level: 1 })
  for (const s of stairwells)
    els.push({
      id: id(), kind: 'symbol', type: 'stairs', name: s.id, x: s.x, y: s.y,
      level: 1, toLevel: s.toLevel === 'B2' ? -2 : -1, width: 34,
    })

  /* 작업영역(Room) — 건물 내 층별 세부 구획 */
  for (const r of rooms) {
    const pts = r.points
      .trim()
      .split(/\s+/)
      .map((p) => p.split(',').map(Number))
    const xs = pts.map((p) => p[0])
    const ys = pts.map((p) => p[1])
    const x = Math.min(...xs)
    const y = Math.min(...ys)
    els.push({
      id: id(), kind: 'room', name: r.name, x, y,
      w: Math.max(...xs) - x, h: Math.max(...ys) - y,
      level: r.level === 'B2' ? -2 : r.level === 'B1' ? -1 : 1,
    })
  }

  /* 지하 공동구 라인 + 출입구 — 관제 도메인의 공동구를 빌더 요소로 */
  for (const t of utilityTunnels)
    els.push({
      id: id(), kind: 'tunnel', name: t.name, level: t.level === 'B2' ? -2 : -1,
      path: t.path.map((p) => [...p] as [number, number]),
    })
  for (const e of tunnelEntrances)
    els.push({
      id: id(), kind: 'symbol', type: 'entrance', name: e.id, x: e.x, y: e.y,
      level: e.level === 'B2' ? -2 : -1,
    })

  /* 데모용 지오펜스 — 소화조 가스 구역(지상) · 전처리조 밀폐 구역(지하 1층) */
  els.push({
    id: id(), kind: 'fence', name: '소화조 가스 위험구역', shape: 'rect',
    x: 810, y: 180, w: 135, h: 120, level: 1,
  })
  els.push({
    id: id(), kind: 'fence', name: '전처리조 밀폐구역', shape: 'rect',
    x: 125, y: 365, w: 200, h: 120, level: -1,
  })
  return els
}

/* ── 점 포함 판정 — 지오펜스 내부 배치 제한(비콘) 등에 사용 ── */
export function pointInOutline(outline: Array<[number, number]>, px: number, py: number): boolean {
  let inside = false
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
    const [xi, yi] = outline[i]
    const [xj, yj] = outline[j]
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** 형태 요소(직각/타원/다각형·회전 포함) 내부에 점이 있는지 */
export function pointInShape(
  el: { shape?: BuilderShape; x: number; y: number; w: number; h: number; pts?: BPoint[]; rot?: number },
  px: number,
  py: number,
): boolean {
  return pointInOutline(shapeOutline(el, 32), px, py)
}

/* ── 저장/불러오기 ── */
const STORAGE_KEY = 'builder-map-v1'

/** 위경도 앵커 기본값 — 캔버스 중심(500,320)이 이 좌표에 매핑된다 (군포 하수도 사업소) */
export const DEFAULT_ANCHOR = { lat: 37.3503, lng: 126.9401 }

/** 저장 단위 — 요소 + 지도 메타(위경도 앵커·캔버스 회전) */
export interface BuilderMap {
  anchor: { lat: number; lng: number }
  rotation: number
  elements: BElement[]
}

export function sampleMap(): BuilderMap {
  return { anchor: { ...DEFAULT_ANCHOR }, rotation: 0, elements: sampleElements() }
}

const isElements = (v: unknown): v is BElement[] =>
  Array.isArray(v) && v.every((e) => e && typeof e.id === 'string' && typeof e.kind === 'string')

/** 저장본이 있으면 반환, 없거나 손상됐으면 null — 대시보드 연동 판별용.
 * 구버전(요소 배열만 저장) 포맷은 기본 메타로 감싸 마이그레이션한다. */
export function loadSavedBuilderMap(): BuilderMap | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed: unknown = JSON.parse(raw)
      if (isElements(parsed))
        return {
          anchor: { ...DEFAULT_ANCHOR },
          rotation: 0,
          elements: parsed.filter(
            (e) => e.kind !== 'symbol' || SYMBOL_DEFS.some((s) => s.type === e.type),
          ),
        }
      const m = parsed as BuilderMap
      if (m && isElements(m.elements))
        return {
          anchor: m.anchor ?? { ...DEFAULT_ANCHOR },
          rotation: typeof m.rotation === 'number' ? m.rotation : 0,
          /* 팔레트에서 제거된 심볼 타입(CCTV·비상벨·펌프·전기설비 등)은 정리 */
          elements: m.elements.filter(
            (e) => e.kind !== 'symbol' || SYMBOL_DEFS.some((s) => s.type === e.type),
          ),
        }
    }
  } catch {
    /* 손상된 저장본은 무시 */
  }
  return null
}

export function loadBuilderMap(): BuilderMap {
  return loadSavedBuilderMap() ?? sampleMap()
}

export function saveBuilderMap(map: BuilderMap) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
  } catch {
    /* 저장 실패(쿼터 등)는 무시 — 목업 수준 */
  }
}
