/* Adapter — 빌더 저장본(BuilderMap) → Planning 요청 (docs/beacon_planning.md §5.2).
 * BGeofence는 shapeOutline()으로 곡선·회전이 구워진 순수 폴리곤으로 정규화한다.
 * 리포트 페이지는 지오펜스별 독립 계산(§2.2)을 위해 지오펜스당 1개 요청을 만든다. */

import {
  DEFAULT_M_PER_UNIT,
  pointInShape,
  shapeOutline,
  type BGeofence,
  type BObstacle,
  type BSymbol,
  type BuilderMap,
} from '../../data/builder'
import type { BeaconPlanRequest, PlanningBeacon, PlanningOptions } from './types'

/** 비콘 기본 반경 (m) — beacon_planning.md §3.2 */
export const BEACON_RADIUS_M = 15

/** 반경 선택지 (m) — 리포트 공통·상세 시뮬레이션 드롭다운에 동일 적용 */
export const BEACON_RADIUS_OPTIONS = [15, 20, 35, 50, 100] as const

/** 목표 커버리지 선택지 (%) — 리포트 공통·상세 시뮬레이션 드롭다운에 동일 적용 */
export const TARGET_COVERAGE_OPTIONS = [80, 90, 95, 98, 100] as const

export const DEFAULT_OPTIONS: PlanningOptions = {
  targetCoverage: 0.98,
  samplingResolutionMeters: 1,
  safetyMargin: 0.1,
  existingBeaconMode: 'keep',
}

export interface FencePlanInput {
  fence: BGeofence
  request: BeaconPlanRequest
}

/** 저장본에서 지오펜스별 Planning 요청 목록 생성 (층·이름 순 정렬 — 결정적) */
export function buildFenceRequests(
  map: BuilderMap,
  radiusMeters = BEACON_RADIUS_M,
  options: PlanningOptions = DEFAULT_OPTIONS,
): FencePlanInput[] {
  const fences = map.elements
    .filter((e): e is BGeofence => e.kind === 'fence')
    .sort((a, b) => b.level - a.level || a.name.localeCompare(b.name, 'ko'))
  const beacons: PlanningBeacon[] = map.elements
    .filter((e): e is BSymbol => e.kind === 'symbol' && e.type === 'beacon')
    .map((b) => ({
      id: b.name,
      x: b.x,
      y: b.y,
      level: b.level,
      fenceId: b.fenceId ?? '',
      radiusMeters,
    }))
  const mpu = map.metersPerUnit ?? DEFAULT_M_PER_UNIT
  const obstacleEls = map.elements.filter((e): e is BObstacle => e.kind === 'obstacle')

  return fences.map((fence) => ({
    fence,
    request: {
      requestId: `plan-${fence.id}`,
      level: fence.level,
      geofences: [
        {
          id: fence.id,
          name: fence.name,
          level: fence.level,
          /* 곡선 정밀도 — 엔진 입력은 16세그먼트 샘플링 (§14 리스크 3) */
          points: shapeOutline(fence, 16).map(([x, y]) => ({ x, y })),
        },
      ],
      /* 소속 장애물 — 벽면 설치면이자 차폐(음영) 원인 */
      obstacles: obstacleEls
        .filter(
          (o) =>
            o.level === fence.level &&
            (o.fenceId === fence.id || pointInShape(fence, o.x + o.w / 2, o.y + o.h / 2)),
        )
        .map((o) => ({
          id: o.id,
          name: o.name,
          level: o.level,
          fenceId: fence.id,
          effect: o.effect,
          points: shapeOutline(o, 20).map(([x, y]) => ({ x, y })),
        })),
      existingBeacons: beacons.filter(
        (b) => b.level === fence.level,
      ),
      metersPerUnit: mpu,
      beacon: { radiusMeters },
      options,
    },
  }))
}
