/* Beacon Planning 계산 엔진 — docs/beacon_planning.md §6 + 벽면 설치 제약(2026-07 변경).
 *
 * 설치 제약: 비콘은 자유 공간이 아니라 **벽면**에만 설치된다 —
 *   후보 = 지오펜스 외곽선 안쪽 오프셋 + 장애물(구조물) 외곽선 바깥 오프셋.
 * 장애물: 내부 샘플은 모집단에서 제외하고, 비콘-샘플 시선(LOS)이 장애물을
 *   가로지르면 차폐(blocked)는 커버 불가, heavy/light는 유효 반경 감쇠.
 * 남는 미커버 영역은 '음영'으로 그대로 보고한다 — 벽면 제약 하에서는
 *   내부 임의 지점 보정이 불가능하므로 구조물 추가가 곧 개선 수단이다.
 * 결정성(§6.4): 동일 입력 → 항상 동일 결과. */

import { pointInOutline } from '../../data/builder'
import type {
  BeaconPlanRequest,
  BeaconPlanResult,
  PlanningBeacon,
  PlanningPoint,
  PlanningPolygon,
} from './types'

type Outline = Array<[number, number]>

const toOutline = (p: PlanningPolygon): Outline => p.points.map((pt) => [pt.x, pt.y])

/** Shoelace 면적 (unit²) */
export function polygonArea(outline: Outline): number {
  let s = 0
  for (let i = 0; i < outline.length; i++) {
    const [x1, y1] = outline[i]
    const [x2, y2] = outline[(i + 1) % outline.length]
    s += x1 * y2 - x2 * y1
  }
  return Math.abs(s) / 2
}

function outlineBBox(outline: Outline) {
  const xs = outline.map((p) => p[0])
  const ys = outline.map((p) => p[1])
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) }
}

/** 점 → 폴리곤 외곽선 최단거리 */
function distToOutline(outline: Outline, px: number, py: number): number {
  let best = Infinity
  for (let i = 0; i < outline.length; i++) {
    const [x1, y1] = outline[i]
    const [x2, y2] = outline[(i + 1) % outline.length]
    const dx = x2 - x1
    const dy = y2 - y1
    const len2 = dx * dx + dy * dy
    const t = len2 ? Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2)) : 0
    const d = Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy))
    if (d < best) best = d
  }
  return best
}

/** 선분-선분 교차 (접촉 포함) — LOS 차폐 판정용 */
function segIntersects(
  ax: number, ay: number, bx: number, by: number,
  cx: number, cy: number, dx: number, dy: number,
): boolean {
  const d1 = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)
  const d2 = (bx - ax) * (dy - ay) - (by - ay) * (dx - ax)
  const d3 = (dx - cx) * (ay - cy) - (dy - cy) * (ax - cx)
  const d4 = (dx - cx) * (by - cy) - (dy - cy) * (bx - cx)
  return d1 * d2 < 0 && d3 * d4 < 0
}

/** 선분이 폴리곤 외곽선을 가로지르는가 (bbox 선차단 후 변 검사) */
function segCrossesOutline(
  ax: number, ay: number, bx: number, by: number,
  outline: Outline,
  bb: { x0: number; y0: number; x1: number; y1: number },
): boolean {
  if (Math.max(ax, bx) < bb.x0 || Math.min(ax, bx) > bb.x1) return false
  if (Math.max(ay, by) < bb.y0 || Math.min(ay, by) > bb.y1) return false
  for (let i = 0; i < outline.length; i++) {
    const [cx, cy] = outline[i]
    const [dx, dy] = outline[(i + 1) % outline.length]
    if (segIntersects(ax, ay, bx, by, cx, cy, dx, dy)) return true
  }
  return false
}

/** 요청 내용 해시(FNV-1a) — stale 결과 판별용 */
function hashRequest(req: BeaconPlanRequest): string {
  const s = JSON.stringify({ ...req, requestId: '' })
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return (h >>> 0).toString(36)
}

interface Candidate {
  x: number
  y: number
  covers: number[]
  boundaryDist: number
}

export interface EngineHooks {
  onProgress?: (phase: string, ratio: number) => void
  shouldCancel?: () => boolean
}

const MAX_SAMPLES_PER_FENCE = 60_000
const MAX_PROPOSALS_PER_FENCE = 400
/** 벽면 후보의 벽 이격 (unit ≈ 2 m) */
const WALL_OFFSET_U = 1.6
/** 슬리버 방지 — 신규 커버가 기준 규모(원판·지오펜스 중 작은 쪽)의 2% 미만이면
 * 잡음으로 간주해 채택하지 않음. 배치 밀도 자체는 NMS(최소 이격)가 제어한다 */
const MIN_GAIN_RATIO = 0.02
/** 중복 커버 억제 — 비콘(기존 설치 포함) 간 최소 이격 = 1.15 × R_eff.
 * 인접 두 원의 중심 거리가 1.15R이면 겹침 면적이 원의 ~30% 수준으로 제한된다 */
const MIN_SPACING_RATIO = 1.15
/** 감쇠 계수 — heavy/light 장애물을 관통하는 시선의 유효 반경 배율 (MVP 단순화) */
const ATTENUATION = { heavy: 0.55, light: 0.85 } as const

export class PlanCancelled extends Error {
  constructor() {
    super('cancelled')
  }
}

/** 외곽선을 따라 일정 간격으로 벽면 설치 후보 생성 —
 * 각 지점에서 변의 법선 양방향으로 오프셋해 유효한(설치 가능한) 쪽을 취한다 */
function wallCandidates(
  outline: Outline,
  stepU: number,
  valid: (x: number, y: number) => boolean,
): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = []
  let carry = 0
  for (let i = 0; i < outline.length; i++) {
    const [x1, y1] = outline[i]
    const [x2, y2] = outline[(i + 1) % outline.length]
    const len = Math.hypot(x2 - x1, y2 - y1)
    if (len < 1e-6) continue
    const ux = (x2 - x1) / len
    const uy = (y2 - y1) / len
    /* 법선 (좌/우) */
    const nx = -uy
    const ny = ux
    let d = carry
    while (d < len) {
      const px = x1 + ux * d
      const py = y1 + uy * d
      const c1x = px + nx * WALL_OFFSET_U
      const c1y = py + ny * WALL_OFFSET_U
      const c2x = px - nx * WALL_OFFSET_U
      const c2y = py - ny * WALL_OFFSET_U
      if (valid(c1x, c1y)) out.push({ x: +c1x.toFixed(2), y: +c1y.toFixed(2) })
      else if (valid(c2x, c2y)) out.push({ x: +c2x.toFixed(2), y: +c2y.toFixed(2) })
      d += stepU
    }
    /* 다음 변으로 간격 이월 — 정점에서 후보가 뭉치지 않게 */
    carry = d - len
  }
  return out
}

/** 요청 전체(지오펜스별 독립 계산 후 합산) Planning 실행 */
export function runPlan(req: BeaconPlanRequest, hooks: EngineHooks = {}): BeaconPlanResult {
  const t0 = performance.now()
  const mpu = req.metersPerUnit
  const rM = req.beacon.radiusMeters
  const rEffM = rM * (1 - req.options.safetyMargin)
  const rEffU = rEffM / mpu
  const rEff2 = rEffU * rEffU

  const warnings: string[] = [
    '벽면 설치 제약 반영 — 비콘 후보는 지오펜스·구조물 외곽뿐이며, 내벽 미반영으로 수량은 낙관적 추정입니다',
  ]
  const proposed: PlanningBeacon[] = []
  const holeOut: PlanningPoint[] = []
  let totalAreaM2 = 0
  let sampleCount = 0
  let coveredSampleCount = 0
  let autoSeq = 0

  const cancelCheck = () => {
    if (hooks.shouldCancel?.()) throw new PlanCancelled()
  }
  const progress = (fi: number, frac: number, phase: string) => {
    hooks.onProgress?.(phase, Math.min(1, (fi + frac) / Math.max(1, req.geofences.length)))
  }

  for (let fi = 0; fi < req.geofences.length; fi++) {
    const fence = req.geofences[fi]
    const outline = toOutline(fence)
    if (outline.length < 3) {
      warnings.push(`${fence.name}: 정점 3개 미만 — 계산 제외`)
      continue
    }
    const fenceAreaU2 = polygonArea(outline)
    if (fenceAreaU2 <= 0) {
      warnings.push(`${fence.name}: 면적 0 — 계산 제외`)
      continue
    }
    const bb = outlineBBox(outline)

    /* 소속 장애물 — 외곽선·bbox·면적 (LOS·샘플 제외·벽면 후보용) */
    const obstacles = req.obstacles
      .filter((o) => o.level === fence.level && o.fenceId === fence.id)
      .map((o) => {
        const ol = toOutline(o)
        return { outline: ol, bbox: outlineBBox(ol), area: polygonArea(ol), effect: o.effect }
      })
      .filter((o) => o.outline.length >= 3)
    const inAnyObstacle = (x: number, y: number) =>
      obstacles.some(
        (o) =>
          x >= o.bbox.x0 && x <= o.bbox.x1 && y >= o.bbox.y0 && y <= o.bbox.y1 &&
          pointInOutline(o.outline, x, y),
      )

    /* 유효 대상 면적 = 지오펜스 − 장애물 footprint 합 (§6.2) */
    const obAreaU2 = obstacles.reduce((s, o) => s + o.area, 0)
    const effAreaU2 = Math.max(0, fenceAreaU2 - obAreaU2)
    totalAreaM2 += effAreaU2 * mpu * mpu

    /* ── 1) 샘플링 (지오펜스 bbox 기준, 장애물 내부 제외) ── */
    cancelCheck()
    progress(fi, 0.05, 'sampling')
    let stepU = req.options.samplingResolutionMeters / mpu
    const estimate = ((bb.x1 - bb.x0) / stepU) * ((bb.y1 - bb.y0) / stepU)
    if (estimate > MAX_SAMPLES_PER_FENCE) {
      stepU *= Math.sqrt(estimate / MAX_SAMPLES_PER_FENCE)
      warnings.push(`${fence.name}: 샘플 상한 초과 — 샘플링 간격을 ${(stepU * mpu).toFixed(1)}m로 완화`)
    }
    const sx: number[] = []
    const sy: number[] = []
    for (let y = bb.y0 + stepU / 2; y <= bb.y1; y += stepU)
      for (let x = bb.x0 + stepU / 2; x <= bb.x1; x += stepU)
        if (pointInOutline(outline, x, y) && !inAnyObstacle(x, y)) {
          sx.push(x)
          sy.push(y)
        }
    const n = sx.length
    sampleCount += n
    if (n === 0) continue
    const covered = new Uint8Array(n)

    /* 커버 판정 — 거리 + 장애물 LOS/감쇠 (§6.2 판정 순서) */
    const coversSample = (bxp: number, byp: number, si: number): boolean => {
      const dx = sx[si] - bxp
      const dy = sy[si] - byp
      const d2 = dx * dx + dy * dy
      if (d2 > rEff2) return false
      let factor = 1
      for (const ob of obstacles) {
        if (!segCrossesOutline(bxp, byp, sx[si], sy[si], ob.outline, ob.bbox)) continue
        if (ob.effect === 'blocked') return false
        factor = Math.min(factor, ATTENUATION[ob.effect])
      }
      if (factor >= 1) return true
      const rr = rEffU * factor
      return d2 <= rr * rr
    }

    /* ── 2) 기존 비콘 선반영 (keep 모드) — 동일 LOS 규칙 적용.
     * 위치는 신규 후보와의 최소 이격 판정에도 쓴다 ── */
    const existingMine =
      req.options.existingBeaconMode === 'keep'
        ? req.existingBeacons.filter(
            (b) =>
              b.level === fence.level &&
              (b.fenceId === fence.id || pointInOutline(outline, b.x, b.y)),
          )
        : []
    for (const b of existingMine)
      for (let i = 0; i < n; i++) if (!covered[i] && coversSample(b.x, b.y, i)) covered[i] = 1

    /* ── 3) 벽면 설치 후보 — 지오펜스 외곽(안쪽) + 장애물 외곽(바깥쪽) ── */
    cancelCheck()
    progress(fi, 0.25, 'wall-candidates')
    const candStep = Math.max(3, rEffU / 2)
    const validSpot = (x: number, y: number) => pointInOutline(outline, x, y) && !inAnyObstacle(x, y)
    const spots = [
      ...wallCandidates(outline, candStep, validSpot),
      ...obstacles.flatMap((o) => wallCandidates(o.outline, candStep, validSpot)),
    ]
    const cands: Candidate[] = spots.map((s) => ({
      x: s.x,
      y: s.y,
      covers: [],
      boundaryDist: +distToOutline(outline, s.x, s.y).toFixed(2),
    }))
    /* 결정성 — 후보 순서 고정 */
    cands.sort((a, b) => a.y - b.y || a.x - b.x)

    /* ── 4) Coverage Matrix ── */
    cancelCheck()
    progress(fi, 0.45, 'coverage')
    for (const c of cands)
      for (let i = 0; i < n; i++) if (coversSample(c.x, c.y, i)) c.covers.push(i)

    /* ── 5) Greedy Set Cover — 동점: 경계거리 desc → y asc → x asc.
     * 중복 억제: ① 신규 커버 < 원판 6%면 중단(슬리버 방지)
     *           ② 선택·기존 비콘과 1.15×R_eff 미만 이격 후보는 배제(NMS) ── */
    cancelCheck()
    progress(fi, 0.7, 'optimize')
    /* 기존 비콘 선반영 스냅샷 — 프루닝 시 영구 커버로 취급 */
    const preCovered = covered.slice()
    let coveredCount = 0
    for (let i = 0; i < n; i++) coveredCount += covered[i]
    const target = Math.ceil(n * req.options.targetCoverage)
    /* 슬리버 임계 — 원판 샘플 수와 지오펜스 전체 샘플 수 중 작은 쪽의 2%.
     * 반경이 지오펜스보다 크면(3m 공동구·100m 반경, 소형 펜스·대반경 코너 등)
     * 원판 기준은 물리적으로 도달 불가능한 값이 되므로 지오펜스 규모로 캡 */
    const discSamples = (Math.PI * rEff2) / (stepU * stepU)
    const minGain = Math.max(4, Math.round(MIN_GAIN_RATIO * Math.min(discSamples, n)))
    /* 최소 이격 — 기본 1.15×R_eff. 단 반경이 지오펜스 자체보다 크면(예: 100m 반경 ×
     * 135×120u 펜스) 이격이 펜스를 넘어서 벽 후보가 전멸하고 코너 벽면이 미커버로
     * 남는다 → 이격을 펜스 bbox 최장변의 1/2로 캡 */
    const fenceSpanCap = Math.max(bb.x1 - bb.x0, bb.y1 - bb.y0) / 2
    const minSpacing = Math.min(MIN_SPACING_RATIO * rEffU, fenceSpanCap)
    const minSpacing2 = minSpacing * minSpacing
    const used = new Uint8Array(cands.length)
    /* 기존 설치 비콘 주변 후보 선차단 — 기존 커버와의 중복 배치 방지 */
    for (const b of existingMine)
      for (let ci = 0; ci < cands.length; ci++) {
        const dx = cands[ci].x - b.x
        const dy = cands[ci].y - b.y
        if (dx * dx + dy * dy < minSpacing2) used[ci] = 1
      }
    const chosen: Candidate[] = []
    while (coveredCount < target && chosen.length < MAX_PROPOSALS_PER_FENCE) {
      let best = -1
      let bestNew = 0
      let bestBd = -1
      for (let ci = 0; ci < cands.length; ci++) {
        if (used[ci]) continue
        const c = cands[ci]
        let nw = 0
        for (const si of c.covers) if (!covered[si]) nw++
        if (nw > bestNew || (nw === bestNew && nw > 0 && best >= 0 && c.boundaryDist > bestBd)) {
          best = ci
          bestNew = nw
          bestBd = c.boundaryDist
        }
      }
      if (best < 0 || bestNew < minGain) break
      used[best] = 1
      const c = cands[best]
      for (const si of c.covers)
        if (!covered[si]) {
          covered[si] = 1
          coveredCount++
        }
      chosen.push(c)
      /* NMS — 선택 비콘의 최소 이격 반경 내 후보를 제거해 과밀 배치를 차단 */
      for (let ci = 0; ci < cands.length; ci++) {
        if (used[ci]) continue
        const dx = cands[ci].x - c.x
        const dy = cands[ci].y - c.y
        if (dx * dx + dy * dy < minSpacing2) used[ci] = 1
      }
    }

    /* ── 5b) 불필요 비콘 제거 (§6.3 L) — 이후 선택들로 잉여가 된 비콘 프루닝.
     * 제거해도 커버 집합이 줄지 않는(모든 샘플이 기존 비콘 또는 타 선택에 의해
     * 중복 커버되는) 비콘을 반복 제거한다. 커버리지는 그대로, 수량만 감소.
     * 결정성: 커버 수 오름차순 → y → x 순으로 제거 ── */
    cancelCheck()
    const cnt = new Uint16Array(n)
    for (const c of chosen) for (const si of c.covers) if (!preCovered[si]) cnt[si]++
    let removed = true
    while (removed) {
      removed = false
      let pick = -1
      for (let k = 0; k < chosen.length; k++) {
        const c = chosen[k]
        let redundant = true
        for (const si of c.covers) {
          if (!preCovered[si] && cnt[si] < 2) {
            redundant = false
            break
          }
        }
        if (!redundant) continue
        if (
          pick < 0 ||
          c.covers.length < chosen[pick].covers.length ||
          (c.covers.length === chosen[pick].covers.length &&
            (c.y < chosen[pick].y || (c.y === chosen[pick].y && c.x < chosen[pick].x)))
        )
          pick = k
      }
      if (pick >= 0) {
        for (const si of chosen[pick].covers) if (!preCovered[si]) cnt[si]--
        chosen.splice(pick, 1)
        removed = true
      }
    }

    const fenceProposals: PlanningBeacon[] = chosen.map((c) => {
      autoSeq++
      return {
        id: `AUTO-${String(autoSeq).padStart(2, '0')}`,
        x: c.x,
        y: c.y,
        level: fence.level,
        fenceId: fence.id,
        radiusMeters: rM,
      }
    })

    /* ── 6) 잔존 음영 보고 — 벽면 제약 하에서는 내부 보정이 불가능하다 ── */
    cancelCheck()
    progress(fi, 0.92, 'holes')
    if (coveredCount < target) {
      const shadowM2 = (n - coveredCount) * stepU * stepU * mpu * mpu
      warnings.push(
        `${fence.name}: 벽면 설치 제약으로 목표 커버리지 미달 (달성 ${((coveredCount / n) * 100).toFixed(1)}%) — ` +
          `내부 음영 약 ${Math.round(shadowM2).toLocaleString('ko-KR')}㎡. 구조물(장애물) 추가 시 설치면이 늘어 개선됩니다`,
      )
    }
    /* 홀 표시 샘플 — 상한을 넘으면 균등 간격으로 추려 분포 왜곡 없이 표시 */
    const holeIdx: number[] = []
    for (let i = 0; i < n; i++) if (!covered[i]) holeIdx.push(i)
    const holeStride = Math.max(1, Math.ceil(holeIdx.length / 2500))
    for (let k = 0; k < holeIdx.length && holeOut.length < 2500; k += holeStride) {
      const i = holeIdx[k]
      holeOut.push({ x: +sx[i].toFixed(1), y: +sy[i].toFixed(1) })
    }

    coveredSampleCount += coveredCount
    proposed.push(...fenceProposals)
    progress(fi, 1, 'done')
  }

  const coverageRatio = sampleCount ? coveredSampleCount / sampleCount : 0
  const coveredAreaM2 = totalAreaM2 * coverageRatio
  const theoreticalCount = totalAreaM2 ? Math.ceil(totalAreaM2 / (Math.PI * rM * rM)) : 0
  const hexEstimateCount = totalAreaM2
    ? Math.ceil(totalAreaM2 / (((3 * Math.sqrt(3)) / 2) * rM * rM))
    : 0
  const optimizedCount = proposed.length
  return {
    requestId: req.requestId,
    inputHash: hashRequest(req),
    level: req.level,
    totalAreaM2,
    coveredAreaM2,
    uncoveredAreaM2: totalAreaM2 - coveredAreaM2,
    coverageRatio,
    calculationMs: Math.round(performance.now() - t0),
    theoreticalCount,
    hexEstimateCount,
    optimizedCount,
    recommendedCount: optimizedCount ? Math.ceil(optimizedCount * 1.1) : 0,
    proposedBeacons: proposed,
    sampleCount,
    coveredSampleCount,
    holeSamples: holeOut,
    warnings,
  }
}
