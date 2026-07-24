// 대시보드가 소비하는 현장 모델 — 맵 빌더 저장본이 있으면 그것을 대시보드
// 도메인(Zone·게이트웨이·비콘·가스검침기·계단실)으로 변환해 쓰고,
// 없으면 site.ts 기본 사업소를 그대로 쓴다.
// 지하 공동구·출입구는 빌더가 편집하지 않는 공용 인프라라 항상 site.ts 기준.

import { useState } from 'react'
import {
  assessZoneRisks,
  beaconRows,
  gasDetectors,
  gateways,
  makeBeaconRows,
  mapBeacons,
  rooms,
  stairwells,
  tunnelEntrances,
  utilityTunnels,
  zones,
  type BeaconRow,
  type FloorId,
  type GasDetector,
  type MapPoint,
  type Room,
  type Stairwell,
  type TunnelSegment,
  type Zone,
  type ZoneRisk,
} from './site'
import {
  DEFAULT_ANCHOR,
  FENCE_COLOR,
  loadSavedBuilderMap,
  pointInShape,
  polyPath,
  rotateBPts,
  samplePoly,
  shapeOutline,
  symbolDef,
  type BBuilding,
  type BObstacle,
  type BRoom,
  type BSymbol,
  type BTunnel,
  type BuilderShape,
  type SymbolType,
} from './builder'

/** 지오펜스 — 빌더에서 그린 가상 감시 구역 (대시보드 표시용).
 * 등급/색상 판정은 관제 실데이터 연동 시 동적으로 대체된다 */
export interface SiteGeofence {
  id: string
  name: string
  shape: BuilderShape
  x: number
  y: number
  w: number
  h: number
  floor: FloorId
  color: string
  /** poly·회전 전용 — 2D 렌더용 SVG path */
  path?: string
  /** 3D 가상 영역 렌더용 외곽선 좌표 (항상 제공) */
  pts: Array<[number, number]>
}

/** 지오펜스 내부 물리 장애물 — 맵 빌더의 형태·회전·차폐 속성을 그대로 유지 */
export interface SiteObstacle {
  id: string
  name: string
  fenceId: string
  floor: FloorId
  shape: 'rect' | 'ellipse'
  x: number
  y: number
  w: number
  h: number
  rot?: number
  effect: BObstacle['effect']
}

/** 기타 설비 심볼 — 대시보드 고유 레이어가 없는 빌더 심볼(출입구 등) */
export interface SiteFacility {
  id: string
  name: string
  type: SymbolType
  code: string
  label: string
  color: string
  x: number
  y: number
  floor: FloorId
  /** 출입구 전용 — 개구부 폭·벽면 방향 */
  width?: number
  rot?: number
  /** 엘리베이터 전용 — 종료 층·세로 깊이 */
  toFloor?: FloorId
  depth?: number
}

export interface SiteModel {
  source: 'builder' | 'default'
  /** 배경 지도 타일용 위경도 앵커 (캔버스 중심 500,320) */
  anchor: { lat: number; lng: number }
  /** 맵 빌더에서 설정한 기본 도면 회전각(°) — 관제 2D의 초기 회전 */
  rotation: number
  zones: Zone[]
  gateways: MapPoint[]
  mapBeacons: MapPoint[]
  gasDetectors: GasDetector[]
  stairwells: Stairwell[]
  rooms: Room[]
  utilityTunnels: TunnelSegment[]
  tunnelEntrances: MapPoint[]
  geofences: SiteGeofence[]
  obstacles: SiteObstacle[]
  facilities: SiteFacility[]
  beaconRows: BeaconRow[]
  zoneRisks: ZoneRisk[]
  zoneRisk: Map<string, ZoneRisk>
}

/** 빌더 층 번호(1=지상1층, -1=지하1층) → 대시보드 층 — 지하는 B3까지 지원(그 이하는 B3로 캡) */
function levelToFloor(level: number): FloorId {
  return level >= 1 ? 'F1' : level === -1 ? 'B1' : level === -2 ? 'B2' : 'B3'
}

/** id 기반 결정적 의사난수 0~1 — 빌더 가스검침기의 목업 측정값 생성용 */
function hash01(s: string, salt: number): number {
  let h = 2166136261 ^ salt
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return ((h >>> 0) % 1000) / 1000
}

export function resolveSiteModel(): SiteModel {
  const saved = loadSavedBuilderMap()
  const els = saved?.elements

  if (!saved || !els || els.length === 0) {
    const risks = assessZoneRisks()
    return {
      source: 'default',
      anchor: { ...DEFAULT_ANCHOR },
      rotation: 0,
      zones,
      gateways,
      mapBeacons,
      gasDetectors,
      stairwells,
      rooms,
      utilityTunnels,
      tunnelEntrances,
      geofences: [],
      obstacles: [],
      facilities: [],
      beaconRows,
      zoneRisks: risks,
      zoneRisk: new Map(risks.map((r) => [r.zone, r])),
    }
  }

  /* ── 빌더 저장본 → 대시보드 도메인 변환 ── */
  const buildings = els.filter((e): e is BBuilding => e.kind === 'building')
  const symbols = els.filter((e): e is BSymbol => e.kind === 'symbol')

  const ptsToStr = (pts: Array<[number, number]>) =>
    pts.map((p) => `${+p[0].toFixed(1)},${+p[1].toFixed(1)}`).join(' ')

  const bZones: Zone[] = buildings.map((b) => {
    const floors: FloorId[] = []
    if (b.floorsUp >= 1) floors.push('F1')
    if (b.floorsDown >= 1) floors.push('B1')
    if (b.floorsDown >= 2) floors.push('B2')
    if (b.floorsDown >= 3) floors.push('B3')
    if (floors.length === 0) floors.push('F1')
    /* poly·회전 오브젝트는 외곽선을 폴리곤으로 굽고, 그 외에는 원시 형태 유지 */
    const asPoly = b.shape === 'poly' || (b.rot ?? 0) !== 0
    const points = asPoly
      ? ptsToStr(shapeOutline(b))
      : `${b.x},${b.y} ${b.x + b.w},${b.y} ${b.x + b.w},${b.y + b.h} ${b.x},${b.y + b.h}`
    return {
      id: b.id,
      name: b.name,
      points,
      labelX: b.x + b.w / 2,
      labelY: b.y + b.h / 2 + 4,
      floors,
      shape: asPoly ? 'poly' : b.shape,
      upFloors: b.floorsUp,
    }
  })

  /** 좌표가 속한 건물 이름 — 회전·타원·다각형 반영 외곽선 포함 판정, 없으면 '외부' */
  const zoneOf = (x: number, y: number): string =>
    buildings.find((b) => pointInShape(b, x, y))?.name ?? '외부'

  const symPoint = (s: BSymbol): MapPoint => ({
    id: s.name,
    x: s.x,
    y: s.y,
    zone: zoneOf(s.x, s.y),
    level: levelToFloor(s.level),
  })

  const bGateways = symbols
    .filter((s) => s.type === 'gateway')
    .map((s) => ({ ...symPoint(s), roof: s.roof }))
  const bBeacons = symbols.filter((s) => s.type === 'beacon').map(symPoint)

  const bGas: GasDetector[] = symbols
    .filter((s) => s.type === 'gas')
    .map((s) => {
      const zone = zoneOf(s.x, s.y)
      return {
        id: s.name,
        name: `${zone} ${s.name} 고정가스검침기`,
        x: s.x,
        y: s.y,
        zone,
        level: levelToFloor(s.level),
        /* 결정적 목업 측정값 — 전 항목 정상 범위 */
        o2: +(20.6 + hash01(s.name, 1) * 0.6).toFixed(1),
        h2s: +(hash01(s.name, 2) * 0.4).toFixed(1),
        co: +(0.4 + hash01(s.name, 3) * 1.6).toFixed(1),
        nh3: +(1 + hash01(s.name, 4) * 7).toFixed(1),
        ch4: +(0.5 + hash01(s.name, 5) * 3.5).toFixed(1),
      }
    })

  const bStairs: Stairwell[] = symbols
    .filter((s) => s.type === 'stairs')
    .map((s) => ({
      id: s.name,
      zone: zoneOf(s.x, s.y),
      x: s.x,
      y: s.y,
      fromLevel: levelToFloor(s.level),
      toLevel: levelToFloor(s.toLevel ?? s.level),
      width: s.width,
      rot: s.rot,
    }))

  const geofences: SiteGeofence[] = els
    .filter((e) => e.kind === 'fence')
    .map((f) => {
      const rot = f.rot ?? 0
      let path: string | undefined
      let pts3: Array<[number, number]>
      if (f.shape === 'poly' && f.pts) {
        /* 다각형 — 회전은 정점을 굽고 곡선(polyPath)은 유지 */
        const bp = rot ? rotateBPts(f.pts, rot, f.x + f.w / 2, f.y + f.h / 2) : f.pts
        path = polyPath(bp)
        pts3 = samplePoly(bp)
      } else {
        /* 직각/타원 — 3D 가상 영역용 외곽선. 회전 시 2D도 path로 굽는다 */
        pts3 = shapeOutline(f, 36)
        if (rot) path = `M ${pts3.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' L ')} Z`
      }
      return {
        id: f.id,
        name: f.name,
        shape: f.shape,
        x: f.x,
        y: f.y,
        w: f.w,
        h: f.h,
        floor: levelToFloor(f.level),
        color: FENCE_COLOR,
        path,
        pts: pts3,
      }
    })

  const obstacles: SiteObstacle[] = els
    .filter((e): e is BObstacle => e.kind === 'obstacle')
    .map((o) => ({
      id: o.id,
      name: o.name,
      fenceId: o.fenceId,
      floor: levelToFloor(o.level),
      shape: o.shape,
      x: o.x,
      y: o.y,
      w: o.w,
      h: o.h,
      rot: o.rot,
      effect: o.effect,
    }))

  /* 지하 공동구 — 빌더에서 그린 라인. 출입구는 'entrance' 심볼 */
  const bTunnels: TunnelSegment[] = els
    .filter((e): e is BTunnel => e.kind === 'tunnel')
    .map((t) => ({
      id: t.id,
      name: t.name,
      path: t.path,
      level: levelToFloor(Math.min(t.level, -1)),
      width: t.width,
    }))
  const bEntrances: MapPoint[] = symbols.filter((s) => s.type === 'entrance').map(symPoint)

  const facilities: SiteFacility[] = symbols
    .filter((s) => !['gateway', 'beacon', 'gas', 'stairs', 'entrance'].includes(s.type))
    .map((s) => {
      const d = symbolDef(s.type)
      return {
        id: s.name,
        name: s.name,
        type: s.type,
        code: d.code,
        label: d.label,
        color: d.color,
        x: s.x,
        y: s.y,
        floor: levelToFloor(s.level),
        width: s.width,
        rot: s.rot,
        toFloor: s.toLevel != null ? levelToFloor(s.toLevel) : undefined,
        depth: s.depth,
      }
    })

  /* 작업영역(Room) — 빌더에서 그린 구획. 소속 건물은 중심점 포함 판정.
   * 직각/타원/다각형·회전 모두 외곽선 폴리곤으로 변환 */
  const bRooms: Room[] = els
    .filter((e): e is BRoom => e.kind === 'room')
    .map((r) => ({
      id: r.id,
      zone: zoneOf(r.x + r.w / 2, r.y + r.h / 2),
      level: levelToFloor(r.level),
      name: r.name,
      points: ptsToStr(shapeOutline(r, 24)),
      labelX: r.x + r.w / 2,
      labelY: r.y + r.h / 2 + 3,
    }))

  const risks = assessZoneRisks(bZones, bGas)
  return {
    source: 'builder',
    anchor: saved.anchor ?? { ...DEFAULT_ANCHOR },
    rotation: saved.rotation ?? 0,
    zones: bZones,
    gateways: bGateways,
    mapBeacons: bBeacons,
    gasDetectors: bGas,
    stairwells: bStairs,
    rooms: bRooms,
    utilityTunnels: bTunnels,
    tunnelEntrances: bEntrances,
    geofences,
    obstacles,
    facilities,
    beaconRows: makeBeaconRows(bBeacons),
    zoneRisks: risks,
    zoneRisk: new Map(risks.map((r) => [r.zone, r])),
  }
}

/** 마운트 시점에 1회 해석 — 맵 빌더에서 돌아오면 페이지 재진입으로 최신 반영 */
export function useSiteModel(): SiteModel {
  return useState(resolveSiteModel)[0]
}
