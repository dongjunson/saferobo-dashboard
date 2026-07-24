/* Beacon Planning 데이터 계약 — docs/beacon_planning.md §5.
 * 엔진은 화면을 그리지 않는다: 순수 계산 입력/결과만 오간다. */

export interface PlanningPoint {
  x: number
  y: number
}

export interface PlanningPolygon {
  id: string
  name: string
  level: number
  points: PlanningPoint[]
}

/** 장애물 — Phase 4 대비 계약만 정의 (MVP 엔진은 비어있는 목록을 가정) */
export interface PlanningObstacle extends PlanningPolygon {
  fenceId: string
  effect: 'blocked' | 'heavy' | 'light'
  attenuationDb?: number
}

export interface PlanningBeacon {
  id: string
  x: number
  y: number
  level: number
  fenceId: string
  radiusMeters: number
}

export interface PlanningOptions {
  /** 목표 커버리지 (0~1, 예: 0.98) */
  targetCoverage: number
  /** 샘플링 간격 (m, 예: 1) */
  samplingResolutionMeters: number
  /** 안전 여유 — 유효 반경 = R × (1 − margin) */
  safetyMargin: number
  existingBeaconMode: 'keep' | 'replace'
}

export interface BeaconPlanRequest {
  requestId: string
  level: number
  geofences: PlanningPolygon[]
  obstacles: PlanningObstacle[]
  existingBeacons: PlanningBeacon[]
  metersPerUnit: number
  beacon: { radiusMeters: number }
  options: PlanningOptions
}

export interface BeaconPlanResult {
  requestId: string
  inputHash: string
  level: number
  totalAreaM2: number
  coveredAreaM2: number
  uncoveredAreaM2: number
  coverageRatio: number
  calculationMs: number

  /** A / (πR²) 하한 */
  theoreticalCount: number
  /** 육각 격자 완전 커버 추정 A / ((3√3/2)·R²) */
  hexEstimateCount: number
  /** Greedy Set Cover + Hole 보정 결과 */
  optimizedCount: number
  /** 안전 여유 반영 권장치 */
  recommendedCount: number

  proposedBeacons: PlanningBeacon[]
  /** 커버 샘플 수 (시각화는 참고 반경 원으로 대체 — §9.4) */
  sampleCount: number
  coveredSampleCount: number
  /** 미커버 홀 샘플 — 경고색 점으로 표시 */
  holeSamples: PlanningPoint[]
  warnings: string[]
}

/* ── Worker 프로토콜 (§8) ── */
export type WorkerRequest =
  | { type: 'PLAN'; request: BeaconPlanRequest }
  | { type: 'CANCEL'; requestId: string }

export type WorkerResponse =
  | { type: 'PROGRESS'; requestId: string; phase: string; ratio: number }
  | { type: 'RESULT'; requestId: string; result: BeaconPlanResult }
  | { type: 'ERROR'; requestId: string; message: string }
  | { type: 'CANCELLED'; requestId: string }
