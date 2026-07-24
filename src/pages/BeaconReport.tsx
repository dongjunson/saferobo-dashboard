import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  CircleAlert,
  CircleCheck,
  LoaderCircle,
  Map as MapIcon,
  MapPin,
  Maximize2,
  RefreshCw,
  RotateCcw,
  TriangleAlert,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import {
  DEFAULT_M_PER_UNIT,
  FENCE_COLOR,
  levelName,
  loadBuilderMap,
  pointInShape,
  saveBuilderMap,
  shapeOutline,
  type BBuilding,
  type BObstacle,
  type BSymbol,
} from '../data/builder'
import {
  BEACON_RADIUS_M,
  BEACON_RADIUS_OPTIONS,
  DEFAULT_OPTIONS,
  TARGET_COVERAGE_OPTIONS,
  buildFenceRequests,
  type FencePlanInput,
} from '../features/beacon-planning/adapter'
import { PlanningClient } from '../features/beacon-planning/worker-client'
import type { BeaconPlanRequest, BeaconPlanResult } from '../features/beacon-planning/types'
import { Select } from '../components/ui'

/* ── 비콘 배치 리포트 — 맵 빌더 저장본의 지오펜스를 나열하고,
 * Planning Worker로 산출한 최적 비콘 수량·위치를 지오펜스별 카드로 보여준다.
 * 설치 제약: 비콘은 벽면(지오펜스·구조물 외곽)에만 — 장애물은 설치면이자
 * 차폐(음영) 원인으로 반영된다. docs/beacon_planning.md §6 + 벽면 제약. ── */

const SELECT_CLS =
  'h-8 cursor-pointer rounded-lg border border-hairline bg-surface-2 px-2 text-xs text-ink outline-none focus:border-primary'

interface FenceCard {
  input: FencePlanInput
  result?: BeaconPlanResult
  error?: string
}

const fmt = (v: number) => Math.round(v).toLocaleString('ko-KR')

export default function BeaconReport() {
  const navigate = useNavigate()
  /* 배치 적용 후 저장본 재로드용 버전 카운터 */
  const [mapVersion, setMapVersion] = useState(0)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- mapVersion은 재로드 트리거
  const map = useMemo(() => loadBuilderMap(), [mapVersion])
  const mpu = map.metersPerUnit ?? DEFAULT_M_PER_UNIT
  const buildings = useMemo(
    () => map.elements.filter((e): e is BBuilding => e.kind === 'building'),
    [map],
  )
  const existingBeacons = useMemo(
    () => map.elements.filter((e): e is BSymbol => e.kind === 'symbol' && e.type === 'beacon'),
    [map],
  )
  const obstacles = useMemo(
    () => map.elements.filter((e): e is BObstacle => e.kind === 'obstacle'),
    [map],
  )

  /* 옵션 — 반경·목표 커버리지·기존 비콘 정책. 변경 후 [다시 계산] */
  const [radiusM, setRadiusM] = useState(BEACON_RADIUS_M)
  const [targetPct, setTargetPct] = useState(Math.round(DEFAULT_OPTIONS.targetCoverage * 100))
  const [mode, setMode] = useState<'keep' | 'replace'>(DEFAULT_OPTIONS.existingBeaconMode)

  const [cards, setCards] = useState<FenceCard[]>([])
  /* 상세 모달 — 지오펜스 id로 참조해 계산 완료 시 결과가 즉시 반영된다 */
  const [detailId, setDetailId] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number; name: string; phase: string } | null>(null)
  const clientRef = useRef<PlanningClient | null>(null)
  const runSeq = useRef(0)

  const run = async () => {
    const client = clientRef.current
    if (!client) return
    const seq = ++runSeq.current
    client.cancelAll()
    const inputs = buildFenceRequests(map, radiusM, {
      ...DEFAULT_OPTIONS,
      targetCoverage: targetPct / 100,
      existingBeaconMode: mode,
    })
    setCards(inputs.map((input) => ({ input })))
    setRunning(true)
    /* 지오펜스별 순차 실행 — 진행률이 자연스럽고 워커 부하도 일정 */
    for (let i = 0; i < inputs.length; i++) {
      if (seq !== runSeq.current) return
      const input = inputs[i]
      setProgress({ done: i, total: inputs.length, name: input.fence.name, phase: '계산 중' })
      try {
        const result = await client.plan(input.request, (phase) => {
          if (seq === runSeq.current)
            setProgress({ done: i, total: inputs.length, name: input.fence.name, phase })
        })
        if (seq !== runSeq.current) return
        setCards((prev) => prev.map((c) => (c.input.fence.id === input.fence.id ? { ...c, result } : c)))
      } catch (err) {
        if (seq !== runSeq.current) return
        const msg = err instanceof Error ? err.message : String(err)
        if (msg === 'cancelled') return
        setCards((prev) =>
          prev.map((c) => (c.input.fence.id === input.fence.id ? { ...c, error: msg } : c)),
        )
      }
    }
    if (seq === runSeq.current) {
      setProgress(null)
      setRunning(false)
    }
  }

  useEffect(() => {
    const client = new PlanningClient()
    clientRef.current = client
    void run()
    /* dispose가 대기 중 요청을 cancelled로 reject → run 루프가 조용히 종료된다 */
    return () => client.dispose()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* 옵션(반경·목표 커버리지·기존 비콘)·저장본 변경 시 자동 재계산 —
   * 마운트 직후 1회는 위 초기 실행과 겹치지 않게 건너뛴다 */
  const optsReady = useRef(false)
  useEffect(() => {
    if (!optsReady.current) {
      optsReady.current = true
      return
    }
    void run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [radiusM, targetPct, mode, mapVersion])

  /* 합계 — 완료된 카드 기준 */
  const done = cards.filter((c) => c.result)
  const totalArea = done.reduce((s, c) => s + (c.result?.totalAreaM2 ?? 0), 0)
  const totalProposed = done.reduce((s, c) => s + (c.result?.optimizedCount ?? 0), 0)
  const totalRecommended = done.reduce((s, c) => s + (c.result?.recommendedCount ?? 0), 0)
  const avgCoverage = done.length
    ? done.reduce((s, c) => s + (c.result?.coverageRatio ?? 0), 0) / done.length
    : 0

  return (
    <div className="flex h-full min-w-0 flex-col overflow-x-hidden overflow-y-auto bg-page text-ink">
      {/* ── 헤더 ── */}
      <header className="sticky top-0 z-20 flex min-h-14 shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-hairline bg-surface-1/95 px-5 py-2.5 backdrop-blur">
        <button
          onClick={() => navigate('/map-builder')}
          className="flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-hairline px-2.5 text-xs font-medium text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
        >
          <ArrowLeft size={14} />
          맵 빌더
        </button>
        <h1 className="shrink-0 whitespace-nowrap text-sm font-bold">비콘 배치 리포트</h1>
        <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2.5 text-xs text-muted">
          <label className="flex shrink-0 items-center gap-1.5 whitespace-nowrap">
            반경
            <Select
              fullWidth={false}
              className={SELECT_CLS}
              value={radiusM}
              onChange={(e) => setRadiusM(Number(e.target.value))}
            >
              {BEACON_RADIUS_OPTIONS.map((r) => (
                <option key={r} value={r}>
                  {r} m
                </option>
              ))}
            </Select>
          </label>
          <label className="flex shrink-0 items-center gap-1.5 whitespace-nowrap">
            목표 커버리지
            <Select
              fullWidth={false}
              className={SELECT_CLS}
              value={targetPct}
              onChange={(e) => setTargetPct(Number(e.target.value))}
            >
              {TARGET_COVERAGE_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {t}%
                </option>
              ))}
            </Select>
          </label>
          <label className="flex shrink-0 items-center gap-1.5 whitespace-nowrap">
            기존 비콘
            <Select fullWidth={false} className={SELECT_CLS} value={mode} onChange={(e) => setMode(e.target.value as 'keep' | 'replace')}>
              <option value="keep">유지(선반영)</option>
              <option value="replace">교체(무시)</option>
            </Select>
          </label>
          <button
            onClick={() => void run()}
            disabled={running}
            className="flex h-8 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg bg-primary px-3 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-default disabled:opacity-50"
          >
            {running ? <LoaderCircle size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            다시 계산
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1360px] flex-1 px-5 pb-10 pt-5">
        {/* ── 요약 ── */}
        <section className="mb-5 grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-6">
          {[
            ['지오펜스', `${cards.length}개`],
            ['총 실면적', `${fmt(totalArea)} ㎡`],
            ['기존 비콘', `${existingBeacons.length}개`],
            ['제안 비콘(최적)', `${totalProposed}개`],
            ['권장 수량(+10%)', `${totalRecommended}개`],
            ['평균 커버리지', `${(avgCoverage * 100).toFixed(1)}%`],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl border border-hairline bg-surface-1 px-3.5 py-3">
              <p className="text-[11px] text-muted">{label}</p>
              <p className="mt-1 text-lg font-bold tabular-nums">{value}</p>
            </div>
          ))}
        </section>
        <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] leading-relaxed text-muted">
          <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 font-medium text-amber-400">
            장애물·내벽 미반영 MVP — 낙관적 추정
          </span>
          {/* 범례 — 기존/제안 비콘은 색으로 구분 */}
          <span className="flex items-center gap-1.5">
            <svg width="14" height="14" viewBox="-7 -7 14 14">
              <circle r="5" fill="none" stroke="#a78bfa" strokeWidth="1.4" strokeDasharray="2.6 1.8" />
              <circle r="1.6" fill="#a78bfa" />
            </svg>
            제안 비콘(AUTO)
          </span>
          <span className="flex items-center gap-1.5">
            <svg width="14" height="14" viewBox="-7 -7 14 14">
              <rect x="-4.5" y="-4.5" width="9" height="9" rx="2" fill="#34d399" />
              <rect x="-1.7" y="-1.7" width="3.4" height="3.4" rx="0.8" fill="var(--surface-1)" />
            </svg>
            기존 비콘(설치됨)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-red-400" />
            음영(미커버)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-3.5 rounded-[3px] bg-slate-500/70 ring-1 ring-slate-400/60" />
            장애물(구조물)
          </span>
          <span>
            축척 1 unit = {mpu} m · 유효 반경 {(radiusM * (1 - DEFAULT_OPTIONS.safetyMargin)).toFixed(1)} m
            (안전 여유 {DEFAULT_OPTIONS.safetyMargin * 100}%) · 샘플링 {DEFAULT_OPTIONS.samplingResolutionMeters} m ·
            벽면 설치 제약(지오펜스·구조물 외곽) + 차폐(LOS) 반영 Greedy Set Cover ·
            제안 위치는 미리보기이며 저장본에는 반영되지 않습니다.
          </span>
        </div>

        {/* ── 진행률 ── */}
        {progress && (
          <div className="mb-5 flex items-center gap-3 rounded-xl border border-hairline bg-surface-1 px-4 py-3 text-xs text-ink-2">
            <LoaderCircle size={15} className="animate-spin text-primary" />
            <span className="font-medium">
              {progress.name} 계산 중 ({progress.done + 1}/{progress.total}) · {progress.phase}
            </span>
            <div className="ml-auto h-1.5 w-56 overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${((progress.done + 0.5) / progress.total) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* ── 빈 상태 ── */}
        {cards.length === 0 && (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-hairline py-20 text-sm text-muted">
            <MapIcon size={28} className="opacity-60" />
            저장된 지오펜스가 없습니다 — 맵 빌더에서 지오펜스를 먼저 그려주세요.
            <button
              onClick={() => navigate('/map-builder')}
              className="mt-1 flex h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-primary px-4 text-xs font-semibold text-white hover:opacity-90"
            >
              맵 빌더 열기
            </button>
          </div>
        )}

        {/* ── 지오펜스 카드 ── */}
        <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {cards.map((card) => (
            <FenceResultCard
              key={card.input.fence.id}
              card={card}
              buildings={buildings}
              existingBeacons={existingBeacons}
              obstacles={obstacles}
              mpu={mpu}
              radiusM={radiusM}
              mode={mode}
              onOpenDetail={() => setDetailId(card.input.fence.id)}
            />
          ))}
        </section>
      </main>

      {/* ── 지오펜스 상세 모달 — 확대/축소(휠·버튼)·드래그 이동 ── */}
      {(() => {
        const detail = detailId ? cards.find((c) => c.input.fence.id === detailId) : undefined
        return detail ? (
          <FenceDetailModal
            key={detail.input.fence.id}
            card={detail}
            buildings={buildings}
            existingBeacons={existingBeacons}
            obstacles={obstacles}
            mpu={mpu}
            radiusM={radiusM}
            targetPct={targetPct}
            mode={mode}
            plan={(req, onP) =>
              clientRef.current
                ? clientRef.current.plan(req, onP)
                : Promise.reject(new Error('cancelled'))
            }
            onApplied={() => setMapVersion((v) => v + 1)}
            onClose={() => setDetailId(null)}
          />
        ) : null
      })()}
    </div>
  )
}

interface FenceView {
  path: string
  vb0: { x: number; y: number; w: number; h: number }
  kept: BSymbol[]
  myObstacles: BObstacle[]
}

/** 카드·모달 공용 지오펜스 뷰 데이터 — 외곽 path, 기본 뷰박스, 소속 비콘·장애물 */
function computeFenceView(
  card: FenceCard,
  existingBeacons: BSymbol[],
  obstacles: BObstacle[],
  mode: 'keep' | 'replace',
  rEffU: number,
): FenceView {
  const { fence } = card.input
  const outline = shapeOutline(fence, 16)
  const xs = outline.map((p) => p[0])
  const ys = outline.map((p) => p[1])
  const pad = rEffU + 6
  return {
    path: `M ${outline.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' L ')} Z`,
    vb0: {
      x: Math.min(...xs) - pad,
      y: Math.min(...ys) - pad,
      w: Math.max(...xs) - Math.min(...xs) + pad * 2,
      h: Math.max(...ys) - Math.min(...ys) + pad * 2,
    },
    kept:
      mode === 'keep'
        ? existingBeacons.filter(
            (b) =>
              b.level === fence.level && (b.fenceId === fence.id || pointInShape(fence, b.x, b.y)),
          )
        : [],
    myObstacles: obstacles.filter(
      (o) =>
        o.level === fence.level &&
        (o.fenceId === fence.id || pointInShape(fence, o.x + o.w / 2, o.y + o.h / 2)),
    ),
  }
}

/** 미니맵/상세 공용 SVG 레이어 — 건물 컨텍스트 → 지오펜스 → 장애물 → 커버리지 → 음영 → 비콘.
 * markerScale: 상세 모달 줌인 시 마커가 유닛 크기 그대로 커져 벽면 밀착감이 사라지는 것을
 * 방지 — 줌 배율에 반비례(하한 포함)해 화면상 크기를 일정하게 유지한다 */
function FenceMapLayers({
  view,
  result,
  buildings,
  rEffU,
  markerScale = 1,
}: {
  view: FenceView
  result?: BeaconPlanResult
  buildings: BBuilding[]
  rEffU: number
  markerScale?: number
}) {
  return (
    <>
      {/* 주변 건물 — 방향 감각용 흐린 외곽선 */}
      {buildings.map((b) => (
        <path
          key={b.id}
          d={`M ${shapeOutline(b, 12).map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' L ')} Z`}
          fill="#8b5cf6"
          fillOpacity="0.04"
          stroke="#8b5cf6"
          strokeOpacity="0.25"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {/* 지오펜스 */}
      <path d={view.path} fill={FENCE_COLOR} fillOpacity="0.07" stroke={FENCE_COLOR} strokeWidth="1.4" strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />
      {/* 장애물(구조물) — 벽면 설치면·차폐 원인 */}
      {view.myObstacles.map((o) => (
        <path
          key={o.id}
          d={`M ${shapeOutline(o, 20).map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' L ')} Z`}
          fill="#64748b"
          fillOpacity="0.42"
          stroke="#94a3b8"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        >
          <title>{`${o.name} · 장애물(${o.effect === 'blocked' ? '차폐' : o.effect === 'heavy' ? '강한 감쇠' : '경미 감쇠'})`}</title>
        </path>
      ))}
      {/* 기존 비콘 참고 반경 — 에메랄드 톤 (설치된 커버리지) */}
      {view.kept.map((b) => (
        <circle key={`kcov-${b.id}`} cx={b.x} cy={b.y} r={rEffU} fill="#34d399" fillOpacity="0.06" stroke="#34d399" strokeOpacity="0.35" strokeWidth="0.7" vectorEffect="non-scaling-stroke" />
      ))}
      {/* 제안 비콘 참고 반경 (§9.4 — 차폐 미반영 참고용) */}
      {result?.proposedBeacons.map((b) => (
        <circle key={`cov-${b.id}`} cx={b.x} cy={b.y} r={rEffU} fill="#8b5cf6" fillOpacity="0.055" stroke="#8b5cf6" strokeOpacity="0.3" strokeWidth="0.7" vectorEffect="non-scaling-stroke" />
      ))}
      {/* 커버리지 음영(미커버) */}
      {result?.holeSamples.map((h, i) => (
        <circle key={`h-${i}`} cx={h.x} cy={h.y} r={0.9} fill="#f87171" fillOpacity="0.8" />
      ))}
      {/* 기존 비콘 (유지 모드) — 제안(보라 점선)과 구분되는 에메랄드 */}
      {view.kept.map((b) => (
        <g key={b.id} transform={`translate(${b.x},${b.y}) scale(${markerScale})`}>
          <rect x={-2.8} y={-2.8} width={5.6} height={5.6} rx={1.3} fill="#34d399" stroke="var(--page)" strokeWidth="0.7" />
          <rect x={-1.1} y={-1.1} width={2.2} height={2.2} rx={0.5} fill="var(--surface-1)" />
          <title>{`${b.name} · 기존 설치 비콘`}</title>
        </g>
      ))}
      {/* 제안 비콘 — 점선 고스트 + AUTO */}
      {result?.proposedBeacons.map((b) => (
        <g key={b.id} transform={`translate(${b.x},${b.y}) scale(${markerScale})`}>
          <circle r={3.4} fill="var(--page)" fillOpacity="0.75" stroke="#a78bfa" strokeWidth="1.1" strokeDasharray="2.2 1.6" vectorEffect="non-scaling-stroke" />
          <circle r={1.1} fill="#a78bfa" />
          <title>{`${b.id} · 제안 위치 (${Math.round(b.x)}, ${Math.round(b.y)})`}</title>
        </g>
      ))}
    </>
  )
}

/* ── 지오펜스 결과 카드 — 좌: 미니맵(클릭 → 상세 모달), 우: 수치 ── */
function FenceResultCard({
  card,
  buildings,
  existingBeacons,
  obstacles,
  mpu,
  radiusM,
  mode,
  onOpenDetail,
}: {
  card: FenceCard
  buildings: BBuilding[]
  existingBeacons: BSymbol[]
  obstacles: BObstacle[]
  mpu: number
  radiusM: number
  mode: 'keep' | 'replace'
  onOpenDetail: () => void
}) {
  const { fence } = card.input
  const r = card.result
  const rEffU = (radiusM * (1 - DEFAULT_OPTIONS.safetyMargin)) / mpu
  const view = useMemo(
    () => computeFenceView(card, existingBeacons, obstacles, mode, rEffU),
    [card, existingBeacons, obstacles, mode, rEffU],
  )
  const { vb0: vb, kept, myObstacles } = view
  const fenceWarnings = (r?.warnings ?? []).filter((w) => w.startsWith(`${fence.name}:`))

  return (
    <div className="overflow-hidden rounded-2xl border border-hairline bg-surface-1">
      <div className="flex items-center gap-2 border-b border-hairline px-4 py-2.5">
        <span className="size-2.5 rounded-full" style={{ background: FENCE_COLOR }} />
        <p className="text-[13px] font-bold">{fence.name}</p>
        <span className="rounded-md bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium text-ink-2">
          {levelName(fence.level)}
        </span>
        {card.error && (
          <span className="ml-auto flex items-center gap-1 text-[10px] font-medium text-red-400">
            <CircleAlert size={12} /> {card.error}
          </span>
        )}
      </div>

      <div className="flex">
        {/* 미니맵 — 클릭하면 확대/축소 가능한 상세 모달 */}
        <button
          type="button"
          onClick={onOpenDetail}
          title="클릭하여 상세 보기 (확대/축소·이동)"
          className="group relative h-[248px] w-[54%] shrink-0 cursor-zoom-in border-r border-hairline bg-page"
        >
          <svg
            viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
            className="h-full w-full"
            preserveAspectRatio="xMidYMid meet"
          >
            <FenceMapLayers view={view} result={r} buildings={buildings} rEffU={rEffU} />
          </svg>
          <span className="absolute right-2 top-2 flex size-6 items-center justify-center rounded-md border border-hairline bg-surface-1/85 text-muted opacity-0 backdrop-blur transition-opacity group-hover:opacity-100">
            <Maximize2 size={12} />
          </span>
        </button>

        {/* 수치 */}
        <div className="flex-1 px-4 py-3 text-xs">
          {!r && !card.error && (
            <div className="flex h-full items-center justify-center gap-2 text-muted">
              <LoaderCircle size={14} className="animate-spin" /> 계산 중…
            </div>
          )}
          {r && (
            <>
              {/* 히어로 — 시뮬레이션 핵심 결과: 커버리지 · 배치 제안 수량 */}
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-hairline bg-surface-2/50 px-3 pb-2.5 pt-2">
                  <p className="text-[10px] font-medium text-muted">커버리지</p>
                  <p
                    className={`mt-0.5 text-[26px] font-bold leading-none tabular-nums ${
                      r.coverageRatio >= 0.98 ? 'text-emerald-400' : 'text-amber-400'
                    }`}
                  >
                    {(r.coverageRatio * 100).toFixed(1)}
                    <span className="ml-0.5 text-sm font-semibold">%</span>
                  </p>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
                    <div
                      className={`h-full rounded-full ${r.coverageRatio >= 0.98 ? 'bg-emerald-400' : 'bg-amber-400'}`}
                      style={{ width: `${r.coverageRatio * 100}%` }}
                    />
                  </div>
                </div>
                <div className="rounded-xl border border-primary/25 bg-primary/[0.07] px-3 pb-2.5 pt-2">
                  <p className="text-[10px] font-medium text-muted">배치 제안</p>
                  <p className="mt-0.5 text-[26px] font-bold leading-none tabular-nums text-ink">
                    {r.optimizedCount}
                    <span className="ml-0.5 text-sm font-semibold text-ink-2">개</span>
                  </p>
                  <p className="mt-2 text-[10px] leading-none text-muted">
                    권장 {r.recommendedCount}개 · 기존 {kept.length}개
                  </p>
                </div>
              </div>

              {/* 상세 수치 */}
              <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5">
                <Stat label="유효 면적" value={`${fmt(r.totalAreaM2)} ㎡`} />
                <Stat label="음영(미커버)" value={`${fmt(r.uncoveredAreaM2)} ㎡`} />
                <Stat label="이론 하한" value={`${r.theoreticalCount}개`} />
                <Stat label="육각 추정" value={`${r.hexEstimateCount}개`} />
                <Stat label="장애물" value={`${myObstacles.length}개`} />
                <Stat label="계산" value={`${r.calculationMs} ms`} />
              </div>
              <p className="mt-1.5 text-[10px] text-muted">
                샘플 {fmt(r.sampleCount)}점 중 {fmt(r.coveredSampleCount)}점 커버
                {r.holeSamples.length > 0 ? ` · 음영 ${r.holeSamples.length}점` : ''}
              </p>
              {fenceWarnings.length > 0 && (
                <ul className="mt-2 space-y-0.5">
                  {fenceWarnings.map((w) => (
                    <li key={w} className="flex items-start gap-1 text-[10px] text-amber-400">
                      <TriangleAlert size={11} className="mt-px shrink-0" />
                      {w.slice(fence.name.length + 1).trim()}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between border-b border-hairline/50 pb-1">
      <span className="text-[11px] text-muted">{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </div>
  )
}

/* ── 지오펜스 상세 모달 — 큰 배치 이미지, 휠/버튼 확대·축소, 드래그 이동,
 * 반경(커버리지) 변경 시 이 지오펜스만 즉시 재계산(디바운스), Esc/배경 클릭 닫기 ── */
function FenceDetailModal({
  card,
  buildings,
  existingBeacons,
  obstacles,
  mpu,
  radiusM,
  targetPct,
  mode,
  plan,
  onApplied,
  onClose,
}: {
  card: FenceCard
  buildings: BBuilding[]
  existingBeacons: BSymbol[]
  obstacles: BObstacle[]
  mpu: number
  radiusM: number
  targetPct: number
  mode: 'keep' | 'replace'
  plan: (
    req: BeaconPlanRequest,
    onProgress?: (phase: string, ratio: number) => void,
  ) => Promise<BeaconPlanResult>
  /** 배치 적용 후 리포트 저장본 재로드 */
  onApplied: () => void
  onClose: () => void
}) {
  const navigate = useNavigate()
  const { fence } = card.input

  /* 반경·목표 커버리지 시뮬레이션 — 모달 전용. 기본값은 리포트 공통 설정,
   * 변경 시 이 지오펜스만 재계산한다 */
  const [localRadius, setLocalRadius] = useState(radiusM)
  const [localTarget, setLocalTarget] = useState(targetPct)
  const [localResult, setLocalResult] = useState<BeaconPlanResult | undefined>(card.result)
  const [computing, setComputing] = useState(false)
  const isSim = localRadius !== radiusM || localTarget !== targetPct
  const simSeq = useRef(0)
  useEffect(() => {
    if (!isSim) {
      simSeq.current++
      setLocalResult(card.result)
      setComputing(false)
      return
    }
    const seq = ++simSeq.current
    setComputing(true)
    const t = setTimeout(() => {
      const base = card.input.request
      void plan({
        ...base,
        requestId: `${base.requestId}-detail-${localRadius}-${localTarget}`,
        beacon: { radiusMeters: localRadius },
        existingBeacons: base.existingBeacons.map((b) => ({ ...b, radiusMeters: localRadius })),
        options: { ...base.options, targetCoverage: localTarget / 100 },
      })
        .then((res) => {
          if (seq === simSeq.current) setLocalResult(res)
        })
        .catch(() => undefined)
        .finally(() => {
          if (seq === simSeq.current) setComputing(false)
        })
    }, 350)
    return () => clearTimeout(t)
  }, [isSim, localRadius, localTarget, card.result, card.input.request, plan])

  const r = localResult
  const rEffU = (localRadius * (1 - DEFAULT_OPTIONS.safetyMargin)) / mpu
  const view = useMemo(
    () => computeFenceView(card, existingBeacons, obstacles, mode, rEffU),
    [card, existingBeacons, obstacles, mode, rEffU],
  )
  const [vb, setVb] = useState(view.vb0)
  const svgRef = useRef<SVGSVGElement>(null)
  const dragRef = useRef<{ cx: number; cy: number; vb: typeof vb } | null>(null)

  const MIN_W = view.vb0.w * 0.06
  const MAX_W = view.vb0.w * 1.8
  const zoomPct = Math.round((view.vb0.w / vb.w) * 100)

  /* 배치 적용 (§9.5 preview → commit) — 시뮬레이션 제안을 실제 BC-AUTO 비콘으로 저장.
   * 교체 모드면 이 지오펜스 소속 기존 비콘을 제거한 뒤 추가한다 */
  const [applied, setApplied] = useState<{ added: number; removed: number } | null>(null)
  const applyToBuilder = () => {
    if (!r || r.proposedBeacons.length === 0) return
    const saved = loadBuilderMap()
    let removed = 0
    const els = saved.elements.filter((e) => {
      if (
        mode === 'replace' &&
        e.kind === 'symbol' &&
        e.type === 'beacon' &&
        e.level === fence.level &&
        (e.fenceId === fence.id || pointInShape(fence, e.x, e.y))
      ) {
        removed++
        return false
      }
      return true
    })
    /* 빌더 id 시퀀스(el-N)와 BC-AUTO 이름 시퀀스를 이어서 발급 */
    let maxId = els.reduce((m, e) => Math.max(m, parseInt(e.id.split('-')[1] ?? '0', 10) || 0), 0)
    const autoBase = els.filter(
      (e) => e.kind === 'symbol' && e.type === 'beacon' && e.name.startsWith('BC-AUTO'),
    ).length
    const newBeacons: BSymbol[] = r.proposedBeacons.map((p, i) => ({
      id: `el-${++maxId}`,
      kind: 'symbol',
      type: 'beacon',
      name: `BC-AUTO-${String(autoBase + i + 1).padStart(2, '0')}`,
      x: Math.round(p.x * 10) / 10,
      y: Math.round(p.y * 10) / 10,
      level: p.level,
      fenceId: p.fenceId,
    }))
    saveBuilderMap({ ...saved, elements: [...els, ...newBeacons] })
    setApplied({ added: newBeacons.length, removed })
    onApplied()
  }

  /* 중심 기준 버튼 줌 */
  const zoomBy = (factor: number) =>
    setVb((cur) => {
      const w = Math.max(MIN_W, Math.min(MAX_W, cur.w * factor))
      const h = cur.h * (w / cur.w)
      return { x: cur.x + (cur.w - w) / 2, y: cur.y + (cur.h - h) / 2, w, h }
    })

  /* 휠 줌 — 커서 위치 고정. preventDefault를 위해 native non-passive 리스너 */
  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const fx = (e.clientX - rect.left) / rect.width
      const fy = (e.clientY - rect.top) / rect.height
      setVb((cur) => {
        const factor = e.deltaY > 0 ? 1.22 : 1 / 1.22
        const w = Math.max(MIN_W, Math.min(MAX_W, cur.w * factor))
        const h = cur.h * (w / cur.w)
        return { x: cur.x + (cur.w - w) * fx, y: cur.y + (cur.h - h) * fy, w, h }
      })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [MIN_W, MAX_W])

  /* Esc 닫기 */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="flex h-[86vh] w-[min(1200px,94vw)] flex-col overflow-hidden rounded-2xl border border-hairline bg-surface-1 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex shrink-0 items-center gap-2 border-b border-hairline px-4 py-3">
          <span className="size-2.5 rounded-full" style={{ background: FENCE_COLOR }} />
          <p className="text-sm font-bold">{fence.name}</p>
          <span className="rounded-md bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium text-ink-2">
            {levelName(fence.level)}
          </span>
          {r && (
            <span className="text-[11px] text-muted">
              장애물 {view.myObstacles.length} · 유효 면적 {fmt(r.totalAreaM2)} ㎡ · 음영{' '}
              {fmt(r.uncoveredAreaM2)} ㎡
            </span>
          )}
          {/* 반경·목표 커버리지 시뮬레이션 — 이 지오펜스만 재계산 */}
          <div className="ml-auto flex shrink-0 items-center gap-2 whitespace-nowrap text-[11px] text-muted">
            {computing ? (
              <LoaderCircle size={12} className="animate-spin text-primary" />
            ) : (
              isSim && (
                <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold text-primary">
                  시뮬레이션
                </span>
              )
            )}
            <label className="flex items-center gap-1.5">
              커버리지 반경
              <Select
                fullWidth={false}
                className="h-7 cursor-pointer rounded-lg border border-hairline bg-surface-2 px-2 text-xs tabular-nums text-ink outline-none focus:border-primary"
                value={localRadius}
                onChange={(e) => setLocalRadius(Number(e.target.value))}
              >
                {BEACON_RADIUS_OPTIONS.map((r) => (
                  <option key={r} value={r}>
                    {r} m
                  </option>
                ))}
              </Select>
            </label>
            <label className="flex items-center gap-1.5">
              목표
              <Select
                fullWidth={false}
                className="h-7 cursor-pointer rounded-lg border border-hairline bg-surface-2 px-2 text-xs tabular-nums text-ink outline-none focus:border-primary"
                value={localTarget}
                onChange={(e) => setLocalTarget(Number(e.target.value))}
              >
                {TARGET_COVERAGE_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {t}%
                  </option>
                ))}
              </Select>
            </label>
            <span className="hidden xl:inline">유효 {(localRadius * (1 - DEFAULT_OPTIONS.safetyMargin)).toFixed(1)}m</span>
          </div>
          <button
            onClick={onClose}
            aria-label="상세 닫기"
            className="flex size-7 cursor-pointer items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <X size={15} />
          </button>
        </div>

        {/* 맵 — 휠 줌·드래그 팬 */}
        <div className="relative min-h-0 flex-1 bg-page">
          <svg
            ref={svgRef}
            viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
            className="h-full w-full cursor-grab touch-none active:cursor-grabbing"
            preserveAspectRatio="xMidYMid meet"
            onPointerDown={(e) => {
              if (e.button !== 0) return
              e.currentTarget.setPointerCapture(e.pointerId)
              dragRef.current = { cx: e.clientX, cy: e.clientY, vb }
            }}
            onPointerMove={(e) => {
              const d = dragRef.current
              const el = svgRef.current
              if (!d || !el) return
              const rect = el.getBoundingClientRect()
              setVb({
                ...d.vb,
                x: d.vb.x - (e.clientX - d.cx) * (d.vb.w / rect.width),
                y: d.vb.y - (e.clientY - d.cy) * (d.vb.h / rect.height),
              })
            }}
            onPointerUp={() => (dragRef.current = null)}
            onPointerCancel={() => (dragRef.current = null)}
          >
            <FenceMapLayers
              view={view}
              result={r}
              buildings={buildings}
              rEffU={rEffU}
              /* 줌인 시 마커 화면 크기 고정(하한 32%) — 벽면 밀착감 유지 */
              markerScale={Math.max(0.32, Math.min(1, vb.w / view.vb0.w))}
            />
          </svg>

          {/* 히어로 — 시뮬레이션 핵심 결과 (맵 좌상단 플로팅) */}
          {r && (
            <div className="pointer-events-none absolute left-3 top-3 flex gap-2">
              <div className="w-[132px] rounded-xl border border-hairline bg-surface-1/92 px-3.5 pb-2.5 pt-2 backdrop-blur">
                <p className="text-[10px] font-medium text-muted">커버리지</p>
                <p
                  className={`mt-0.5 text-[30px] font-bold leading-none tabular-nums ${
                    r.coverageRatio >= 0.98 ? 'text-emerald-400' : 'text-amber-400'
                  }`}
                >
                  {(r.coverageRatio * 100).toFixed(1)}
                  <span className="ml-0.5 text-sm font-semibold">%</span>
                </p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
                  <div
                    className={`h-full rounded-full ${
                      r.coverageRatio >= 0.98 ? 'bg-emerald-400' : 'bg-amber-400'
                    }`}
                    style={{ width: `${r.coverageRatio * 100}%` }}
                  />
                </div>
              </div>
              <div className="w-[132px] rounded-xl border border-primary/30 bg-surface-1/92 px-3.5 pb-2.5 pt-2 backdrop-blur">
                <p className="text-[10px] font-medium text-muted">배치 제안</p>
                <p className="mt-0.5 text-[30px] font-bold leading-none tabular-nums text-ink">
                  {r.optimizedCount}
                  <span className="ml-0.5 text-sm font-semibold text-ink-2">개</span>
                </p>
                <p className="mt-2 text-[10px] leading-none text-muted">
                  권장 {r.recommendedCount}개 · 기존 {view.kept.length}개
                </p>
              </div>
            </div>
          )}

          {/* 줌 컨트롤 */}
          <div className="absolute right-3 top-3 flex flex-col items-center gap-1 rounded-[10px] border border-hairline bg-surface-1/90 p-1 backdrop-blur">
            <button onClick={() => zoomBy(1 / 1.35)} aria-label="확대" className="flex size-7 cursor-pointer items-center justify-center rounded-md text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink">
              <ZoomIn size={14} />
            </button>
            <button onClick={() => zoomBy(1.35)} aria-label="축소" className="flex size-7 cursor-pointer items-center justify-center rounded-md text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink">
              <ZoomOut size={14} />
            </button>
            <button onClick={() => setVb(view.vb0)} aria-label="배율 초기화" className="flex size-7 cursor-pointer items-center justify-center rounded-md text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink">
              <RotateCcw size={13} />
            </button>
            <span className="px-1 pb-0.5 text-[9px] tabular-nums text-muted">{zoomPct}%</span>
          </div>

          <span className="pointer-events-none absolute bottom-3 left-3 rounded-[8px] border border-hairline bg-surface-1/85 px-2.5 py-1.5 text-[11px] text-muted backdrop-blur">
            휠: 확대/축소 · 드래그: 이동 · Esc: 닫기
          </span>
          {!r && (
            <span className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-lg border border-hairline bg-surface-1/90 px-3 py-2 text-xs text-muted backdrop-blur">
              <LoaderCircle size={14} className="animate-spin" /> 계산 중…
            </span>
          )}
        </div>

        {/* ── 배치 적용 푸터 (§9.5 preview → commit) ── */}
        <div className="flex shrink-0 items-center gap-3 border-t border-hairline bg-surface-1 px-4 py-3">
          {applied ? (
            <>
              <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
                <CircleCheck size={15} />
                비콘 {applied.added}개를 맵 빌더에 추가했습니다
                {applied.removed > 0 ? ` (기존 ${applied.removed}개 교체)` : ''} — 관제 대시보드에도 자동 반영됩니다
              </span>
              <button
                onClick={() => navigate('/map-builder')}
                className="ml-auto flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-hairline px-3.5 text-xs font-semibold text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
              >
                맵 빌더에서 확인
              </button>
            </>
          ) : (
            <>
              <p className="min-w-0 text-[11px] leading-relaxed text-muted">
                {isSim ? '시뮬레이션' : '공통'} 설정(반경 {localRadius}m · 목표 {localTarget}%)의 제안{' '}
                {r?.optimizedCount ?? 0}개를 실제 비콘(BC-AUTO)으로 맵 빌더에 저장합니다.{' '}
                {mode === 'replace'
                  ? '교체 모드 — 이 지오펜스의 기존 비콘은 제거됩니다.'
                  : '기존 비콘은 유지되며, 저장 후 맵 빌더에서 이동·삭제할 수 있습니다.'}
              </p>
              <button
                onClick={applyToBuilder}
                disabled={!r || r.proposedBeacons.length === 0 || computing}
                className="ml-auto flex h-10 shrink-0 cursor-pointer items-center gap-1.5 rounded-xl bg-primary px-4 text-[13px] font-bold text-white shadow-lg shadow-primary/25 transition-opacity hover:opacity-90 disabled:cursor-default disabled:opacity-40"
              >
                <MapPin size={15} />
                맵 빌더에 배치 적용{r && r.proposedBeacons.length > 0 ? ` (${r.proposedBeacons.length}개)` : ''}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
