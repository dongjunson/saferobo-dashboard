import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowDownToLine,
  ArrowUpDown,
  Box,
  Building2,
  ChevronDown,
  ChevronUp,
  Circle,
  DoorOpen,
  Eraser,
  Fence,
  FileDown,
  Gauge,
  LocateFixed,
  LogOut,
  MapPin,
  Minus,
  MousePointer2,
  PenTool,
  Plus,
  RotateCcw,
  RotateCw,
  Router,
  Scan,
  Spline,
  Square,
  Trash2,
  Undo2,
  Waypoints,
  Wifi,
  X,
} from 'lucide-react'
import type { ReactNode } from 'react'
import Builder3D from '../components/Builder3D'
import TileLayer, { ScaleBar, type BgKind, type ViewBox } from '../components/TileLayer'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../components/ui/tooltip'
import {
  DEFAULT_ANCHOR,
  FENCE_COLOR,
  SYMBOL_DEFS,
  levelName,
  levelShort,
  loadBuilderMap,
  polyPath,
  ptsBBox,
  sampleMap,
  saveBuilderMap,
  shapeOutline,
  symbolDef,
  type BBuilding,
  type BElement,
  type BGeofence,
  type BPoint,
  type BRoom,
  type BSymbol,
  type BTunnel,
  type BuilderShape,
  pointInShape,
  type SymbolType,
} from '../data/builder'

/* ── 맵 빌더 — 독립 전체화면 페이지 ──────────────────────────────────
 * 2D 캔버스(1000×640)에 건물(직각/타원/포인트+곡선)·지오펜스·지하 공동구를
 * 그리고 심볼을 드래그&드롭 배치한다. 배경 지도 타일(위경도 앵커 매핑)과
 * 캔버스 회전을 지원하며, 우측 분할 패널에서 3D 실시간 미리보기. */

const GRID = 10
const MIN_SIZE = 20
const MAP_W = 1000
const MAP_H = 640
const CX = 500
const CY = 320

const SYMBOL_ICON: Record<SymbolType, ReactNode> = {
  gateway: <Router size={14} />,
  beacon: <Wifi size={14} />,
  gas: <Gauge size={14} />,
  door: <DoorOpen size={14} />,
  stairs: <ArrowUpDown size={14} />,
  entrance: <ArrowDownToLine size={14} />,
}

/* 도구 = 대상(무엇을) × 형태(어떤 모양으로) 2단 구성 —
 * 건물/작업영역/지오펜스는 직각·타원·다각형 공통 지원 */
type Tool = 'select' | 'building' | 'room' | 'fence' | 'tunnel'
type ShapedEl = BBuilding | BGeofence | BRoom
type LevelFilter = 'all' | number
interface Draft {
  x: number
  y: number
  w: number
  h: number
}
type Drag =
  | { mode: 'draw'; sx: number; sy: number }
  | {
      mode: 'move'
      id: string
      sx: number
      sy: number
      orig: BElement
      before: BElement[]
      moved: boolean
      /** 건물 이동 시 함께 움직일 내부 요소(심볼·작업영역) 스냅샷 */
      children?: Array<{ id: string; orig: BElement }>
    }
  | { mode: 'resize'; id: string; ax: number; ay: number; orig: BElement; before: BElement[]; moved: boolean }
  | { mode: 'vertex'; id: string; index: number; before: BElement[] | null; moved: boolean; rot: number; cx: number; cy: number }
  | { mode: 'rotobj'; id: string; cx: number; cy: number; startAngle: number; startRot: number; before: BElement[]; moved: boolean }
  | { mode: 'pan'; cx: number; cy: number; vb0: ViewBox }
  | { mode: 'rotate'; startAngle: number; startRot: number }

/* ── 줌/팬 viewBox — 캔버스는 무한 평면 느낌(경계 없음), 작업 범위만 제한 ── */
const BASE_VB: ViewBox = { x: 0, y: 0, w: MAP_W, h: MAP_H }
const MIN_VB_W = 200 // 최대 5배 확대
const MAX_VB_W = 2200 // 축소 한계 (~45%)
const WORLD_PAD = 2000 // 기준 영역(1000×640) 밖으로 허용하는 작업 여백
const X_MIN = -WORLD_PAD
const X_MAX = MAP_W + WORLD_PAD
const Y_MIN = -WORLD_PAD
const Y_MAX = MAP_H + WORLD_PAD

function zoomVb(vb: ViewBox, factor: number, px: number, py: number): ViewBox {
  const w = Math.min(MAX_VB_W, Math.max(MIN_VB_W, vb.w * factor))
  const h = (w * BASE_VB.h) / BASE_VB.w
  const kx = (px - vb.x) / vb.w
  const ky = (py - vb.y) / vb.h
  return { x: px - kx * w, y: py - ky * h, w, h }
}

const clampVb = (vb: ViewBox): ViewBox => ({
  ...vb,
  x: Math.max(X_MIN - vb.w / 2, Math.min(X_MAX - vb.w / 2, vb.x)),
  y: Math.max(Y_MIN - vb.h / 2, Math.min(Y_MAX - vb.h / 2, vb.y)),
})

const normDeg = (v: number) => {
  const n = ((v + 540) % 360) - 180
  return Math.abs(n) < 0.01 ? 0 : n
}

/** 점-폴리라인 최단 거리 — 공동구에 접한 심볼(비콘·출입구) 판정용 */
const distToPolyline = (path: Array<[number, number]>, px: number, py: number): number => {
  let best = Infinity
  for (let i = 0; i < path.length - 1; i++) {
    const [ax, ay] = path[i]
    const [bx, by] = path[i + 1]
    const vx = bx - ax
    const vy = by - ay
    const len2 = vx * vx + vy * vy
    const t = len2 < 1e-6 ? 0 : Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / len2))
    best = Math.min(best, Math.hypot(px - (ax + vx * t), py - (ay + vy * t)))
  }
  return best
}

/** (cx,cy) 기준 -deg 역회전 — 회전된 오브젝트의 리사이즈/정점 편집 좌표 보정 */
const invRotPt = (x: number, y: number, deg: number, cx: number, cy: number): [number, number] => {
  const rad = (-deg * Math.PI) / 180
  const dx = x - cx
  const dy = y - cy
  return [cx + dx * Math.cos(rad) - dy * Math.sin(rad), cy + dx * Math.sin(rad) + dy * Math.cos(rad)]
}

const TARGETS: Array<{ k: Tool; label: string; icon: ReactNode }> = [
  { k: 'select', label: '선택 / 이동 — 빈 곳 드래그: 팬 · Shift+드래그: 회전', icon: <MousePointer2 size={16} /> },
  { k: 'building', label: '건물 그리기 — 우측에서 형태(직각·타원·다각형)를 선택', icon: <Building2 size={16} /> },
  { k: 'room', label: '작업영역(Room) 그리기 — 건물 내 층별 세부 구획', icon: <Scan size={16} /> },
  { k: 'fence', label: '지오펜스 그리기 — 등급별 감시 구역', icon: <Fence size={16} /> },
  { k: 'tunnel', label: '지하 공동구 — 클릭으로 경유점 추가, Enter로 완성', icon: <Waypoints size={16} /> },
]

const SHAPES: Array<{ k: BuilderShape; label: string; icon: ReactNode }> = [
  { k: 'rect', label: '직각 — 드래그로 그리기', icon: <Square size={14} /> },
  { k: 'ellipse', label: '타원(원형) — 드래그로 그리기', icon: <Circle size={14} /> },
  { k: 'poly', label: '다각형 — 클릭으로 점 추가 · 곡선 지원', icon: <PenTool size={14} /> },
]

const snap = (v: number) => Math.round(v / GRID) * GRID
const normBox = (x0: number, y0: number, x1: number, y1: number): Draft => ({
  x: Math.min(x0, x1),
  y: Math.min(y0, y1),
  w: Math.abs(x1 - x0),
  h: Math.abs(y1 - y0),
})

/** 층 필터에서 건물 표시 여부 — 지상 f층은 floorsUp≥f, 지하는 floorsDown≥-f */
const bldOnFloor = (b: BBuilding, f: number) => (f > 0 ? b.floorsUp >= f : b.floorsDown >= -f)

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-muted">{label}</span>
      {children}
    </label>
  )
}

const INPUT_CLS =
  'h-9 w-full rounded-[8px] border border-hairline bg-surface-2 px-2.5 text-sm text-ink outline-none focus:border-primary/60'
const SELECT_CLS = `${INPUT_CLS} map-builder-select appearance-none pr-9`
const ICON_BTN =
  'flex size-9 cursor-pointer items-center justify-center rounded-lg text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink'

/** shadcn Tooltip 래퍼 — 툴바 아이콘 버튼 공통 */
function Tip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

export default function MapBuilder() {
  const navigate = useNavigate()
  const [initial] = useState(loadBuilderMap)
  const [elements, setElements] = useState<BElement[]>(initial.elements)
  const [anchor, setAnchor] = useState(initial.anchor)
  const [rotation, setRotation] = useState(initial.rotation)
  const [history, setHistory] = useState<BElement[][]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [tool, setTool] = useState<Tool>('select')
  const [shapeMode, setShapeMode] = useState<BuilderShape>('rect')
  const [curveMode, setCurveMode] = useState(false)
  const [levelFilter, setLevelFilter] = useState<LevelFilter>('all')
  const [show3D, setShow3D] = useState(true)
  const [bg, setBg] = useState<BgKind>('none')
  const [anchorOpen, setAnchorOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(true)
  const [propsOpen, setPropsOpen] = useState(true)
  const [notice, setNotice] = useState<string | null>(null)
  const noticeTimer = useRef<number | undefined>(undefined)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [draftPts, setDraftPts] = useState<BPoint[]>([])
  const [hoverPt, setHoverPt] = useState<[number, number] | null>(null)
  const [vb, setVb] = useState<ViewBox>(BASE_VB)
  const svgRef = useRef<SVGSVGElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<Drag | null>(null)
  const idRef = useRef(0)
  const vbRef = useRef(vb)
  vbRef.current = vb
  const [, forceTick] = useState(0)

  /* 마운트 후 1회 리렌더 — 타일 줌 계산에 캔버스 실측 폭 반영 */
  useEffect(() => forceTick(1), [])

  /* 휠 줌 (Shift+휠은 회전) — passive 리스너 회피를 위해 네이티브로 등록 */
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const delta = e.deltaY || e.deltaX
      if (e.shiftKey) {
        setRotation((r) => normDeg(Math.round(r + (delta > 0 ? 5 : -5))))
        return
      }
      const svg = svgRef.current
      const ctm = svg?.getScreenCTM()
      if (!svg || !ctm) return
      const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse())
      setVb((prev) => clampVb(zoomVb(prev, delta > 0 ? 1.18 : 0.85, p.x, p.y)))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  if (idRef.current === 0)
    idRef.current =
      1 + elements.reduce((m, e) => Math.max(m, parseInt(e.id.split('-')[1] ?? '0', 10) || 0), 0)
  const newId = () => `el-${idRef.current++}`

  /* 자동 저장 — 요소 + 지도 메타(앵커·회전) */
  useEffect(
    () => saveBuilderMap({ anchor, rotation, elements }),
    [anchor, rotation, elements],
  )

  /* 선택이 바뀌면 속성 플로팅 창을 다시 연다 */
  useEffect(() => {
    if (selectedId) setPropsOpen(true)
  }, [selectedId])

  const selected = elements.find((e) => e.id === selectedId) ?? null
  const buildings = useMemo(
    () => elements.filter((e): e is BBuilding => e.kind === 'building'),
    [elements],
  )
  const fences = elements.filter((e) => e.kind === 'fence')
  const symbols = elements.filter((e) => e.kind === 'symbol')
  const tunnels = elements.filter((e): e is BTunnel => e.kind === 'tunnel')
  const roomEls = elements.filter((e) => e.kind === 'room')

  const maxUp = Math.max(1, ...buildings.map((b) => b.floorsUp))
  const maxDown = Math.max(0, ...buildings.map((b) => b.floorsDown))

  /* 층 필터 칩 — 건물 속성값(지상/지하 층수)에서 유도 */
  const floorChips = useMemo(() => {
    const opts: number[] = []
    for (let u = maxUp; u >= 1; u--) opts.push(u)
    for (let d = 1; d <= maxDown; d++) opts.push(-d)
    return opts
  }, [maxUp, maxDown])

  /* 지오펜스·심볼 층 선택지 */
  const levelOpts = useMemo(() => {
    const opts: number[] = []
    for (let u = maxUp; u >= 1; u--) opts.push(u)
    for (let d = 1; d <= maxDown; d++) opts.push(-d)
    return opts
  }, [maxUp, maxDown])

  /* 공동구 층 선택지 — 지하 전용 */
  const tunnelLevelOpts = useMemo(() => {
    const opts: number[] = []
    for (let d = 1; d <= Math.max(1, maxDown); d++) opts.push(-d)
    return opts
  }, [maxDown])

  const passLevel = (lv: number) => levelFilter === 'all' || lv === levelFilter
  const defaultLevel = () => (typeof levelFilter === 'number' ? levelFilter : 1)

  /** 심볼이 놓인 소속 건물 — 층 선택지는 그 건물의 층 구성에 귀속된다 */
  const buildingAt = (x: number, y: number): BBuilding | undefined =>
    buildings.find((b) => pointInShape(b, x, y))

  /** 소속 건물의 층 선택지 (건물 밖이면 전체 층 범위) */
  const levelOptsFor = (b?: BBuilding): number[] => {
    if (!b) return levelOpts
    const opts: number[] = []
    for (let u = b.floorsUp; u >= 1; u--) opts.push(u)
    for (let dn = 1; dn <= b.floorsDown; dn++) opts.push(-dn)
    return opts.length ? opts : [1]
  }

  /** 건물 위 좌표라면 층 값을 그 건물의 층 구성 안으로 보정 */
  const clampLevelFor = (x: number, y: number, lv: number): number => {
    const b = buildingAt(x, y)
    if (!b) return lv
    const opts = levelOptsFor(b)
    return opts.includes(lv)
      ? lv
      : opts.reduce((a, c) => (Math.abs(c - lv) < Math.abs(a - lv) ? c : a))
  }

  const pushHistory = (snapshot: BElement[]) => setHistory((h) => [...h.slice(-49), snapshot])
  const commit = (next: BElement[]) => {
    pushHistory(elements)
    setElements(next)
  }
  const undo = () => {
    if (!history.length) return
    setElements(history[history.length - 1])
    setHistory(history.slice(0, -1))
    setSelectedId(null)
  }
  const patchEl = (id: string, patch: Partial<BElement>) =>
    setElements((prev) => prev.map((e) => (e.id === id ? ({ ...e, ...patch } as BElement) : e)))

  /** 상단 안내 배너 — 배치 제약 등 일시 피드백 */
  const showNotice = (msg: string) => {
    setNotice(msg)
    window.clearTimeout(noticeTimer.current)
    noticeTimer.current = window.setTimeout(() => setNotice(null), 2500)
  }

  const deleteSelected = () => {
    if (!selectedId) return
    const target = elements.find((e) => e.id === selectedId)
    commit(
      elements.filter((e) => {
        if (e.id === selectedId) return false
        /* 지오펜스 삭제 시 소속 비콘도 함께 제거 */
        if (
          target?.kind === 'fence' &&
          e.kind === 'symbol' &&
          e.type === 'beacon' &&
          (e.fenceId === selectedId || pointInShape(target, e.x, e.y))
        )
          return false
        return true
      }),
    )
    setSelectedId(null)
  }

  /* viewBox 좌표(회전 미적용) — 줌 앵커·회전각 계산용 */
  const rawPt = (clientX: number, clientY: number): [number, number] => {
    const svg = svgRef.current
    const ctm = svg?.getScreenCTM()
    if (!svg || !ctm) return [0, 0]
    const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse())
    return [p.x, p.y]
  }

  /** 캔버스 중심(회전 피벗) 기준 포인터 각도(°) */
  const angleAt = (clientX: number, clientY: number): number => {
    const [x, y] = rawPt(clientX, clientY)
    return (Math.atan2(y - CY, x - CX) * 180) / Math.PI
  }

  /** 계단 발자국(폭×27, 회전 반영)이 소속 건물 벽 안쪽에 머물도록 중심 좌표 클램프 —
   * 건물 밖 배치는 자유, 건물 안이면 벽면과 겹치지 않게 밀어 넣는다 */
  const clampStairPos = (
    list: BElement[],
    st: { width?: number; rot?: number },
    nx: number,
    ny: number,
  ): [number, number] => {
    const b = list.find(
      (e): e is BBuilding =>
        e.kind === 'building' && nx >= e.x && nx <= e.x + e.w && ny >= e.y && ny <= e.y + e.h,
    )
    if (!b) return [nx, ny]
    const w = st.width ?? 34
    const rad = ((st.rot ?? 0) * Math.PI) / 180
    const c = Math.abs(Math.cos(rad))
    const s = Math.abs(Math.sin(rad))
    const hw = (c * w + s * 27) / 2 + 2
    const hh = (s * w + c * 27) / 2 + 2
    return [
      hw * 2 > b.w ? b.x + b.w / 2 : Math.max(b.x + hw, Math.min(b.x + b.w - hw, nx)),
      hh * 2 > b.h ? b.y + b.h / 2 : Math.max(b.y + hh, Math.min(b.y + b.h - hh, ny)),
    ]
  }

  /** 출입구를 가장 가까운 건물 벽면에 스냅 — 직각/타원/다각형(곡선 포함)/회전 건물 공통.
   * 건물 외곽선(shapeOutline)에서 최근접 지점을 찾아 그 지점의 벽 접선 방향으로 정렬한다.
   * 긴 직선 벽에서는 문설주가 모서리를 벗어나지 않게 클램프. 벽 근처(±16)가 아니면 자유 배치 */
  const snapDoorToWall = (
    list: BElement[],
    st: { width?: number; rot?: number },
    nx: number,
    ny: number,
  ): { x: number; y: number; rot: number | undefined } => {
    const w = st.width ?? 12
    const TH = 16
    let best: { d: number; x: number; y: number; rot: number } | null = null
    for (const b of list) {
      if (b.kind !== 'building') continue
      if (nx < b.x - TH || nx > b.x + b.w + TH || ny < b.y - TH || ny > b.y + b.h + TH) continue
      const outline = shapeOutline(b, 48)
      for (let i = 0; i < outline.length; i++) {
        const [ax, ay] = outline[i]
        const [bx2, by2] = outline[(i + 1) % outline.length]
        const vx = bx2 - ax
        const vy = by2 - ay
        const len2 = vx * vx + vy * vy
        if (len2 < 1e-6) continue
        let t = ((nx - ax) * vx + (ny - ay) * vy) / len2
        t = Math.max(0, Math.min(1, t))
        const len = Math.sqrt(len2)
        /* 곡선은 짧은 현(chord)의 연속이라 t 클램프 없이 접선을 따라가고,
         * 긴 직선 벽에서만 모서리 여백을 확보한다 */
        if (len > w + 12) {
          const m = (w / 2 + 3) / len
          t = Math.max(m, Math.min(1 - m, t))
        }
        const px2 = ax + vx * t
        const py2 = ay + vy * t
        const dd = Math.hypot(nx - px2, ny - py2)
        if (dd <= TH && (!best || dd < best.d)) {
          const ang = normDeg(Math.round((Math.atan2(vy, vx) * 180) / Math.PI))
          best = { d: dd, x: +px2.toFixed(1), y: +py2.toFixed(1), rot: ang }
        }
      }
    }
    return best
      ? { x: best.x, y: best.y, rot: best.rot || undefined }
      : { x: nx, y: ny, rot: st.rot }
  }

  /* ── 좌표 변환 — CTM 역변환 후 캔버스 회전의 역회전 적용 ── */
  const toMap = (clientX: number, clientY: number): [number, number] => {
    const svg = svgRef.current
    const ctm = svg?.getScreenCTM()
    if (!svg || !ctm) return [0, 0]
    const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse())
    let x = p.x
    let y = p.y
    if (rotation) {
      const rad = (-rotation * Math.PI) / 180
      const dx = x - CX
      const dy = y - CY
      x = CX + dx * Math.cos(rad) - dy * Math.sin(rad)
      y = CY + dx * Math.sin(rad) + dy * Math.cos(rad)
    }
    return [Math.max(X_MIN, Math.min(X_MAX, x)), Math.max(Y_MIN, Math.min(Y_MAX, y))]
  }

  /* ── 포인트 드로잉(poly/tunnel) 완성 ── */
  const cancelDraft = () => {
    setDraft(null)
    setDraftPts([])
    setHoverPt(null)
  }

  const finalizeDraftPts = () => {
    /* 연속 중복점 제거 (더블클릭 finish 대응) */
    const pts = draftPts.filter((p, i, a) => i === 0 || p.x !== a[i - 1].x || p.y !== a[i - 1].y)
    if (tool !== 'tunnel' && tool !== 'select' && pts.length >= 3) {
      const bbox = ptsBBox(pts)
      if (bbox.w >= MIN_SIZE && bbox.h >= MIN_SIZE) {
        let el: BElement
        if (tool === 'building') {
          el = {
            id: newId(), kind: 'building', name: `건물 ${buildings.length + 1}`,
            shape: 'poly', ...bbox, floorsUp: 1, floorsDown: 0, pts,
          }
        } else if (tool === 'room') {
          el = {
            id: newId(), kind: 'room', name: `작업영역 ${roomEls.length + 1}`,
            shape: 'poly', ...bbox,
            level: clampLevelFor(bbox.x + bbox.w / 2, bbox.y + bbox.h / 2, defaultLevel()),
            pts,
          }
        } else {
          el = {
            id: newId(), kind: 'fence', name: `지오펜스 ${fences.length + 1}`,
            shape: 'poly', ...bbox, level: defaultLevel(), pts,
          }
        }
        commit([...elements, el])
        setSelectedId(el.id)
      }
    } else if (tool === 'tunnel' && pts.length >= 2) {
      const el: BElement = {
        id: newId(),
        kind: 'tunnel',
        name: `공동구 ${tunnels.length + 1}`,
        path: pts.map((p) => [p.x, p.y] as [number, number]),
        level: typeof levelFilter === 'number' && levelFilter < 0 ? levelFilter : -1,
      }
      commit([...elements, el])
      setSelectedId(el.id)
    }
    cancelDraft()
    setTool('select')
  }

  /* ── 캔버스 포인터 인터랙션 ── */
  const onCanvasDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    /* Shift+드래그 — 도면 전체 회전 (텍스트는 역회전으로 수평 유지) */
    if (e.shiftKey) {
      svgRef.current?.setPointerCapture(e.pointerId)
      dragRef.current = { mode: 'rotate', startAngle: angleAt(e.clientX, e.clientY), startRot: rotation }
      return
    }
    const [mx, my] = toMap(e.clientX, e.clientY)
    const pointMode = tool === 'tunnel' || (tool !== 'select' && shapeMode === 'poly')
    if (pointMode) {
      const px = snap(mx)
      const py = snap(my)
      /* 다각형: 첫 점 근처 클릭 → 닫고 완성 */
      if (
        tool !== 'tunnel' &&
        draftPts.length >= 3 &&
        Math.hypot(px - draftPts[0].x, py - draftPts[0].y) < 14
      ) {
        finalizeDraftPts()
        return
      }
      setDraftPts((prev) => [...prev, { x: px, y: py, c: tool !== 'tunnel' && (curveMode !== e.altKey) }])
      return
    }
    svgRef.current?.setPointerCapture(e.pointerId)
    if (tool === 'select') {
      /* 빈 캔버스 드래그 = 팬 (클릭만 하면 선택 해제) */
      setSelectedId(null)
      dragRef.current = { mode: 'pan', cx: e.clientX, cy: e.clientY, vb0: vb }
      return
    }
    setSelectedId(null)
    dragRef.current = { mode: 'draw', sx: snap(mx), sy: snap(my) }
    setDraft({ x: snap(mx), y: snap(my), w: 0, h: 0 })
  }

  const onElementDown = (e: React.PointerEvent, el: BElement) => {
    if (tool !== 'select' || e.button !== 0 || e.shiftKey) return
    e.stopPropagation()
    svgRef.current?.setPointerCapture(e.pointerId)
    setSelectedId(el.id)
    const [mx, my] = toMap(e.clientX, e.clientY)
    /* 건물이면 내부(심볼·작업영역), 지오펜스면 소속 비콘을 함께 이동하도록 스냅샷 */
    const children =
      el.kind === 'building'
        ? elements
            .filter((c) => {
              if (c.id === el.id) return false
              const px = c.kind === 'symbol' ? c.x : c.kind === 'room' ? c.x + c.w / 2 : null
              const py = c.kind === 'symbol' ? c.y : c.kind === 'room' ? c.y + c.h / 2 : null
              return (
                px !== null && py !== null &&
                px >= el.x && px <= el.x + el.w && py >= el.y && py <= el.y + el.h
              )
            })
            .map((c) => ({ id: c.id, orig: c }))
        : el.kind === 'fence'
          ? elements
              .filter(
                (c) =>
                  c.kind === 'symbol' &&
                  c.type === 'beacon' &&
                  (c.fenceId === el.id || pointInShape(el, c.x, c.y)),
              )
              .map((c) => ({ id: c.id, orig: c }))
          : el.kind === 'tunnel'
            ? elements
                .filter(
                  (c) =>
                    c.kind === 'symbol' &&
                    (c.type === 'beacon' || c.type === 'entrance') &&
                    distToPolyline(el.path, c.x, c.y) <= (el.width ?? 18) / 2 + 6,
                )
                .map((c) => ({ id: c.id, orig: c }))
            : undefined
    dragRef.current = { mode: 'move', id: el.id, sx: mx, sy: my, orig: el, before: elements, moved: false, children }
  }

  const onHandleDown = (e: React.PointerEvent, el: BElement, cx: number, cy: number) => {
    if (e.button !== 0 || e.shiftKey || el.kind === 'symbol' || el.kind === 'tunnel') return
    e.stopPropagation()
    svgRef.current?.setPointerCapture(e.pointerId)
    const ax = cx === el.x ? el.x + el.w : el.x
    const ay = cy === el.y ? el.y + el.h : el.y
    dragRef.current = { mode: 'resize', id: el.id, ax, ay, orig: el, before: elements, moved: false }
  }

  const onCanvasMove = (e: React.PointerEvent) => {
    const dr = dragRef.current
    if (dr?.mode === 'rotate') {
      setRotation(normDeg(Math.round(dr.startRot + angleAt(e.clientX, e.clientY) - dr.startAngle)))
      return
    }
    if (dr?.mode === 'pan') {
      const rect = wrapRef.current?.getBoundingClientRect()
      if (!rect) return
      const s = Math.min(rect.width / dr.vb0.w, rect.height / dr.vb0.h)
      setVb(
        clampVb({
          ...dr.vb0,
          x: dr.vb0.x - (e.clientX - dr.cx) / s,
          y: dr.vb0.y - (e.clientY - dr.cy) / s,
        }),
      )
      return
    }
    const [mx, my] = toMap(e.clientX, e.clientY)
    if ((tool === 'tunnel' || (tool !== 'select' && shapeMode === 'poly')) && !dragRef.current) {
      setHoverPt([snap(mx), snap(my)])
      return
    }
    const d = dragRef.current
    if (!d) return
    if (d.mode === 'vertex') {
      d.moved = true
      let vx = mx
      let vy = my
      if (d.rot) [vx, vy] = invRotPt(vx, vy, d.rot, d.cx, d.cy)
      const px = snap(vx)
      const py = snap(vy)
      setElements((prev) =>
        prev.map((el) => {
          if (el.id !== d.id || !('pts' in el) || !el.pts) return el
          const pts = el.pts.map((p, i) => (i === d.index ? { ...p, x: px, y: py } : p))
          return { ...el, ...ptsBBox(pts), pts } as BElement
        }),
      )
      return
    }
    if (d.mode === 'rotobj') {
      d.moved = true
      const ang = (Math.atan2(my - d.cy, mx - d.cx) * 180) / Math.PI
      const next = normDeg(Math.round(d.startRot + ang - d.startAngle))
      setElements((prev) =>
        prev.map((el) => {
          if (el.id !== d.id) return el
          const rot = next === 0 ? undefined : next
          /* 계단은 회전 후에도 건물 벽과 겹치지 않게 위치 보정 */
          if (el.kind === 'symbol' && el.type === 'stairs') {
            const [cx2, cy2] = clampStairPos(prev, { ...el, rot }, el.x, el.y)
            return { ...el, rot, x: cx2, y: cy2 } as BElement
          }
          return { ...el, rot } as BElement
        }),
      )
      return
    }
    if (d.mode === 'draw') {
      setDraft(normBox(d.sx, d.sy, snap(mx), snap(my)))
    } else if (d.mode === 'move') {
      d.moved = true
      const dx = snap(mx - d.sx)
      const dy = snap(my - d.sy)
      const o = d.orig
      setElements((prev) =>
        prev.map((el) => {
          if (el.id !== d.id) {
            /* 건물/지오펜스/공동구 이동 — 소속 요소 동반 이동 (같은 클램프 델타 적용) */
            const ch = d.children?.find((c) => c.id === el.id)
            if (ch && (o.kind === 'building' || o.kind === 'fence')) {
              const adx = Math.max(X_MIN, Math.min(X_MAX - o.w, o.x + dx)) - o.x
              const ady = Math.max(Y_MIN, Math.min(Y_MAX - o.h, o.y + dy)) - o.y
              const co = ch.orig
              if (co.kind === 'symbol')
                return { ...el, x: co.x + adx, y: co.y + ady } as BElement
              if (co.kind === 'room') {
                const patch: Partial<BRoom> = { x: co.x + adx, y: co.y + ady }
                if (co.pts) patch.pts = co.pts.map((p) => ({ ...p, x: p.x + adx, y: p.y + ady }))
                return { ...el, ...patch } as BElement
              }
            }
            if (ch && o.kind === 'tunnel') {
              const xs = o.path.map((p) => p[0])
              const ys = o.path.map((p) => p[1])
              const cdx = Math.max(X_MIN - Math.min(...xs), Math.min(X_MAX - Math.max(...xs), dx))
              const cdy = Math.max(Y_MIN - Math.min(...ys), Math.min(Y_MAX - Math.max(...ys), dy))
              const co = ch.orig
              if (co.kind === 'symbol')
                return { ...el, x: co.x + cdx, y: co.y + cdy } as BElement
            }
            return el
          }
          if (o.kind === 'symbol') {
            let sx2 = Math.max(X_MIN, Math.min(X_MAX, o.x + dx))
            let sy2 = Math.max(Y_MIN, Math.min(Y_MAX, o.y + dy))
            if (o.type === 'stairs') [sx2, sy2] = clampStairPos(prev, o, sx2, sy2)
            if (o.type === 'door') {
              const r = snapDoorToWall(prev, o, sx2, sy2)
              return { ...el, x: r.x, y: r.y, rot: r.rot } as BElement
            }
            if (o.type === 'beacon') {
              /* 소속 비콘은 지오펜스 내부에서만 이동(타 지오펜스로 이동 시 소속 변경).
               * 소속 없는 레거시/샘플 비콘은 자유 이동하되 지오펜스에 들어가면 편입 */
              const bf = prev.find(
                (e): e is BGeofence => e.kind === 'fence' && pointInShape(e, sx2, sy2),
              )
              if (bf) return { ...el, x: sx2, y: sy2, fenceId: bf.id, level: bf.level } as BElement
              if (o.fenceId) return el
              return { ...el, x: sx2, y: sy2 } as BElement
            }
            return { ...el, x: sx2, y: sy2 } as BElement
          }
          if (o.kind === 'tunnel') {
            const xs = o.path.map((p) => p[0])
            const ys = o.path.map((p) => p[1])
            const cdx = Math.max(X_MIN - Math.min(...xs), Math.min(X_MAX - Math.max(...xs), dx))
            const cdy = Math.max(Y_MIN - Math.min(...ys), Math.min(Y_MAX - Math.max(...ys), dy))
            return { ...el, path: o.path.map((p) => [p[0] + cdx, p[1] + cdy]) } as BElement
          }
          const nx = Math.max(X_MIN, Math.min(X_MAX - o.w, o.x + dx))
          const ny = Math.max(Y_MIN, Math.min(Y_MAX - o.h, o.y + dy))
          const patch: Partial<BBuilding> = { x: nx, y: ny }
          if ('pts' in o && o.pts)
            patch.pts = o.pts.map((p) => ({ ...p, x: p.x + nx - o.x, y: p.y + ny - o.y }))
          return { ...el, ...patch } as BElement
        }),
      )
    } else if (d.mode === 'resize') {
      d.moved = true
      /* 회전된 오브젝트는 커서를 로컬 좌표로 역회전한 뒤 bbox 계산 */
      const oR = d.orig
      const oRot = 'rot' in oR ? (oR.rot ?? 0) : 0
      let rmx = mx
      let rmy = my
      if (oRot && 'w' in oR) [rmx, rmy] = invRotPt(mx, my, oRot, oR.x + oR.w / 2, oR.y + oR.h / 2)
      const sx = snap(rmx)
      const sy = snap(rmy)
      let w = Math.abs(sx - d.ax)
      let h = Math.abs(sy - d.ay)
      let x = Math.min(sx, d.ax)
      let y = Math.min(sy, d.ay)
      if (w < MIN_SIZE) {
        w = MIN_SIZE
        x = sx < d.ax ? d.ax - MIN_SIZE : d.ax
      }
      if (h < MIN_SIZE) {
        h = MIN_SIZE
        y = sy < d.ay ? d.ay - MIN_SIZE : d.ay
      }
      const o = d.orig
      const patch: Partial<BBuilding> = { x, y, w, h }
      if ('pts' in o && o.pts && o.w > 0 && o.h > 0)
        patch.pts = o.pts.map((p) => ({
          ...p,
          x: +(x + ((p.x - o.x) / o.w) * w).toFixed(1),
          y: +(y + ((p.y - o.y) / o.h) * h).toFixed(1),
        }))
      patchEl(d.id, patch)
    }
  }

  const onCanvasUp = () => {
    const d = dragRef.current
    dragRef.current = null
    if (!d) return
    if (d.mode === 'draw') {
      if (draft && draft.w >= MIN_SIZE && draft.h >= MIN_SIZE) {
        let el: BElement
        const shape: BuilderShape = shapeMode === 'ellipse' ? 'ellipse' : 'rect'
        if (tool === 'fence') {
          el = {
            id: newId(),
            kind: 'fence',
            name: `지오펜스 ${fences.length + 1}`,
            shape,
            ...draft,
            level: defaultLevel(),
          }
        } else if (tool === 'room') {
          el = {
            id: newId(),
            kind: 'room',
            name: `작업영역 ${roomEls.length + 1}`,
            shape,
            ...draft,
            level: clampLevelFor(draft.x + draft.w / 2, draft.y + draft.h / 2, defaultLevel()),
          }
        } else {
          el = {
            id: newId(),
            kind: 'building',
            name: `건물 ${buildings.length + 1}`,
            shape,
            ...draft,
            floorsUp: 1,
            floorsDown: 0,
          }
        }
        commit([...elements, el])
        setSelectedId(el.id)
      }
      setDraft(null)
      setTool('select')
    } else if (
      (d.mode === 'move' || d.mode === 'resize' || d.mode === 'vertex' || d.mode === 'rotobj') &&
      d.moved
    ) {
      if (d.before) pushHistory(d.before)
    }
  }

  const onCanvasDblClick = () => {
    if (draftPts.length > 0) finalizeDraftPts()
  }

  /* ── 다각형 편집 핸들 — 정점 드래그 이동 · Alt+클릭 삭제,
   * 변 중점 드래그 → 곡선 제어점 삽입 후 즉시 드래그 ── */
  const onVertexDown = (e: React.PointerEvent, el: ShapedEl, index: number) => {
    if (e.button !== 0 || e.shiftKey || !el.pts) return
    e.stopPropagation()
    if (e.altKey) {
      if (el.pts.length > 3) {
        const pts = el.pts.filter((_, i) => i !== index)
        commit(
          elements.map((x) => (x.id === el.id ? ({ ...x, ...ptsBBox(pts), pts } as BElement) : x)),
        )
      }
      return
    }
    svgRef.current?.setPointerCapture(e.pointerId)
    dragRef.current = {
      mode: 'vertex', id: el.id, index, before: elements, moved: false,
      rot: el.rot ?? 0, cx: el.x + el.w / 2, cy: el.y + el.h / 2,
    }
  }

  const onEdgeDown = (e: React.PointerEvent, el: ShapedEl, index: number) => {
    if (e.button !== 0 || e.shiftKey || !el.pts) return
    e.stopPropagation()
    svgRef.current?.setPointerCapture(e.pointerId)
    const pts = [...el.pts]
    const a = pts[index]
    const b = pts[(index + 1) % pts.length]
    pts.splice(index + 1, 0, { x: snap((a.x + b.x) / 2), y: snap((a.y + b.y) / 2), c: true })
    pushHistory(elements)
    setElements((prev) =>
      prev.map((x) => (x.id === el.id ? ({ ...x, ...ptsBBox(pts), pts } as BElement) : x)),
    )
    /* 삽입 시점에 이미 히스토리를 쌓았으므로 이어지는 드래그는 추가 푸시 없음 */
    dragRef.current = {
      mode: 'vertex', id: el.id, index: index + 1, before: null, moved: false,
      rot: el.rot ?? 0, cx: el.x + el.w / 2, cy: el.y + el.h / 2,
    }
  }

  /* 회전 핸들 — 드래그: bbox 중심 기준 회전 · Alt+클릭: 0°로 초기화 */
  const onRotObjDown = (e: React.PointerEvent, el: ShapedEl) => {
    if (e.button !== 0 || e.shiftKey) return
    e.stopPropagation()
    const cx = el.x + el.w / 2
    const cy = el.y + el.h / 2
    if (e.altKey) {
      commit(elements.map((x) => (x.id === el.id ? ({ ...x, rot: undefined } as BElement) : x)))
      return
    }
    svgRef.current?.setPointerCapture(e.pointerId)
    const [mx, my] = toMap(e.clientX, e.clientY)
    dragRef.current = {
      mode: 'rotobj',
      id: el.id,
      cx,
      cy,
      startAngle: (Math.atan2(my - cy, mx - cx) * 180) / Math.PI,
      startRot: el.rot ?? 0,
      before: elements,
      moved: false,
    }
  }

  /* 계단 심볼 회전 핸들 — 중심점(x,y) 기준 */
  const onRotSymDown = (e: React.PointerEvent, el: BSymbol) => {
    if (e.button !== 0 || e.shiftKey) return
    e.stopPropagation()
    if (e.altKey) {
      commit(elements.map((x) => (x.id === el.id ? ({ ...x, rot: undefined } as BElement) : x)))
      return
    }
    svgRef.current?.setPointerCapture(e.pointerId)
    const [mx, my] = toMap(e.clientX, e.clientY)
    dragRef.current = {
      mode: 'rotobj',
      id: el.id,
      cx: el.x,
      cy: el.y,
      startAngle: (Math.atan2(my - el.y, mx - el.x) * 180) / Math.PI,
      startRot: el.rot ?? 0,
      before: elements,
      moved: false,
    }
  }

  /* ── 심볼 드래그&드롭 ── */
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const type = e.dataTransfer.getData('text/symbol') as SymbolType
    if (!SYMBOL_DEFS.some((s) => s.type === type)) return
    const [mx, my] = toMap(e.clientX, e.clientY)
    const def = symbolDef(type)
    const n = symbols.filter((s) => s.kind === 'symbol' && s.type === type).length + 1
    let lv = type === 'entrance' && defaultLevel() > 0 ? -1 : defaultLevel()
    let px = snap(mx)
    let py = snap(my)
    let doorRot: number | undefined
    let beaconFenceId: string | undefined
    if (type === 'stairs') [px, py] = clampStairPos(elements, { width: 34 }, px, py)
    if (type === 'door') {
      const r = snapDoorToWall(elements, { width: 12 }, px, py)
      px = r.x
      py = r.y
      doorRot = r.rot
    }
    if (type === 'beacon') {
      /* 비콘은 지오펜스 내부에만 배치 — 소속 지오펜스의 층을 따른다 */
      const bf = elements.find(
        (e): e is BGeofence => e.kind === 'fence' && pointInShape(e, px, py),
      )
      if (!bf) {
        showNotice('비콘은 지오펜스 내부에만 배치할 수 있습니다 — 먼저 지오펜스를 그려주세요')
        return
      }
      beaconFenceId = bf.id
      lv = bf.level
    }
    /* 건물 내부 배치 — 층 선택지가 건물 층 구성에 귀속되므로 기본 층도 보정 */
    const hostB = buildingAt(px, py)
    if (hostB && type !== 'beacon') {
      const opts = levelOptsFor(hostB)
      if (!opts.includes(lv))
        lv = opts.reduce((a, b2) => (Math.abs(b2 - lv) < Math.abs(a - lv) ? b2 : a))
    }
    /* 계단 — 기본은 한 층 아래 하행. 건물 층 구성 안에서 도착층 선택 */
    let stairTo = lv > 0 ? -1 : Math.max(lv - 1, -3)
    if (type === 'stairs' && hostB) {
      const opts = levelOptsFor(hostB)
      stairTo = opts.find((o) => o < lv) ?? opts.find((o) => o !== lv) ?? stairTo
    }
    const el: BElement = {
      id: newId(),
      kind: 'symbol',
      type,
      name: `${def.code}-${String(n).padStart(2, '0')}`,
      x: px,
      y: py,
      level: lv,
      ...(type === 'stairs' ? { toLevel: stairTo, width: 34 } : {}),
      ...(type === 'door' ? { width: 12, rot: doorRot } : {}),
      ...(type === 'beacon' ? { fenceId: beaconFenceId } : {}),
    }
    commit([...elements, el])
    setSelectedId(el.id)
  }

  /* ── 키보드: Delete 삭제 · Ctrl+Z 되돌리기 · Enter 완성 · Esc 취소 ── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        deleteSelected()
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        undo()
      } else if (e.key === 'Enter') {
        if (draftPts.length > 0) finalizeDraftPts()
      } else if (e.key === 'Escape') {
        setSelectedId(null)
        cancelDraft()
        setTool('select')
        dragRef.current = null
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const patchFloors = (b: BBuilding, up: number, down: number) => {
    if (up === 0 && down === 0) down = 1
    patchEl(b.id, { floorsUp: up, floorsDown: down })
  }

  const rotateBy = (deg: number) => setRotation((r) => normDeg(r + deg))

  const previewPts: BPoint[] =
    hoverPt && draftPts.length > 0 ? [...draftPts, { x: hoverPt[0], y: hoverPt[1] }] : draftPts
  const counterRot = (x: number, y: number) =>
    rotation ? `rotate(${-rotation} ${x} ${y})` : undefined
  const shapeCursor = tool === 'select' ? undefined : 'crosshair'
  const shapedTool = tool === 'building' || tool === 'room' || tool === 'fence'
  const polyTarget = shapedTool && shapeMode === 'poly'
  const helpText =
    tool === 'tunnel'
      ? '클릭: 경유점 추가 · 더블클릭 또는 Enter: 완성 · Esc: 취소'
      : polyTarget
        ? '클릭: 점 추가 · 곡선 토글/Alt+클릭: 곡선 점 · 첫 점 클릭/Enter: 완성 · Esc: 취소'
        : shapedTool
          ? '드래그: 그리기 · 완성 후 선택 도구로 이동/크기 조절 · 다각형은 변 중점 드래그로 곡선'
          : '휠: 줌 · 빈 곳 드래그: 팬 · Shift+드래그: 회전 · 팔레트 드래그: 심볼 배치 · Delete: 삭제 · Ctrl+Z: 되돌리기'

  /* 선택된 형태 요소 — 다각형이면 정점/곡선 편집 핸들 표시 */
  const shaped: ShapedEl | null =
    selected && (selected.kind === 'building' || selected.kind === 'fence' || selected.kind === 'room')
      ? selected
      : null
  const shapedPoly = shaped && shaped.shape === 'poly' && shaped.pts ? shaped : null

  return (
    <TooltipProvider delayDuration={250}>
    <div className="flex h-full select-none flex-col bg-page text-ink">
      {/* ── 상단 툴바 — 대상 그룹 × 형태 그룹, shadcn 공통 툴팁 ── */}
      <header className="flex h-14 shrink-0 items-center gap-1.5 border-b border-hairline bg-surface-1 px-3">
        <img src="/android-chrome-192x192.png" alt="" className="h-6 w-6 rounded-[6px]" />
        <span className="mr-1 text-base font-bold tracking-tight">맵 빌더</span>
        <div className="mx-1 h-6 w-px bg-hairline" />
        {/* 대상 — 무엇을 그릴지 */}
        {TARGETS.map((t) => (
          <Tip key={t.k} label={t.label}>
            <button
              aria-label={t.label}
              onClick={() => {
                setTool(t.k)
                cancelDraft()
              }}
              className={`flex size-9 cursor-pointer items-center justify-center rounded-lg transition-colors ${
                tool === t.k ? 'bg-primary text-white' : 'text-ink-2 hover:bg-surface-2 hover:text-ink'
              }`}
            >
              {t.icon}
            </button>
          </Tip>
        ))}
        {/* 형태 — 어떤 모양으로 (건물·작업영역·지오펜스 공통) */}
        {shapedTool && (
          <>
            <div className="mx-1 h-6 w-px bg-hairline" />
            <div className="flex items-center gap-0.5 rounded-lg bg-page/60 p-0.5">
              {SHAPES.map((s) => (
                <Tip key={s.k} label={s.label}>
                  <button
                    aria-label={s.label}
                    onClick={() => {
                      setShapeMode(s.k)
                      cancelDraft()
                    }}
                    className={`flex size-8 cursor-pointer items-center justify-center rounded-md transition-colors ${
                      shapeMode === s.k ? 'bg-primary text-white' : 'text-ink-2 hover:bg-surface-2 hover:text-ink'
                    }`}
                  >
                    {s.icon}
                  </button>
                </Tip>
              ))}
            </div>
            {shapeMode === 'poly' && (
              <Tip label="곡선 점 모드 — 켜면 클릭한 점이 곡선 정점이 됩니다 (Alt+클릭으로 반전)">
                <button
                  onClick={() => setCurveMode((v) => !v)}
                  className={`flex h-9 cursor-pointer items-center gap-1 rounded-lg px-2.5 text-xs font-semibold transition-colors ${
                    curveMode ? 'bg-warning/90 text-black' : 'text-ink-2 hover:bg-surface-2 hover:text-ink'
                  }`}
                >
                  <Spline size={14} />
                  곡선
                </button>
              </Tip>
            )}
          </>
        )}
        <div className="mx-1 h-6 w-px bg-hairline" />
        <Tip label="되돌리기 (Ctrl+Z)">
          <button aria-label="되돌리기" onClick={undo} disabled={!history.length} className={`${ICON_BTN} disabled:cursor-default disabled:opacity-35`}>
            <Undo2 size={16} />
          </button>
        </Tip>
        <Tip label="군포 하수도 사업소 배치 불러오기">
          <button
            aria-label="사업소 불러오기"
            onClick={() => {
              const s = sampleMap()
              commit(s.elements)
              setAnchor(s.anchor)
              setRotation(s.rotation)
              setSelectedId(null)
            }}
            className={ICON_BTN}
          >
            <FileDown size={16} />
          </button>
        </Tip>
        <Tip label="전체 지우기">
          <button
            aria-label="전체 지우기"
            onClick={() => {
              commit([])
              setSelectedId(null)
            }}
            className={ICON_BTN}
          >
            <Eraser size={16} />
          </button>
        </Tip>
        <div className="mx-1 h-6 w-px bg-hairline" />
        {/* 배경 지도 — 위경도 앵커 기준 타일 매핑 */}
        <div className="flex rounded-lg border border-hairline p-0.5">
          {(
            [
              ['none', '기본'],
              ['map', '지도'],
              ['sat', '위성'],
            ] as Array<[BgKind, string]>
          ).map(([v, label]) => (
            <button
              key={v}
              onClick={() => setBg(v)}
              className={`h-7 cursor-pointer whitespace-nowrap rounded-md px-2 text-xs font-semibold transition-colors ${
                bg === v ? 'bg-primary text-white' : 'text-ink-2 hover:bg-surface-2'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="relative">
          <Tip label="위경도 앵커 — 캔버스 중심이 매핑되는 좌표">
            <button
              onClick={() => setAnchorOpen((v) => !v)}
              className={`${ICON_BTN} ${anchorOpen ? 'bg-surface-2 text-ink' : ''}`}
            >
              <MapPin size={16} />
            </button>
          </Tip>
          {anchorOpen && (
            <div className="absolute left-0 top-11 z-50 w-64 rounded-[12px] border border-hairline bg-surface-1 p-3 shadow-xl">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-bold text-ink">위경도 앵커 매핑</p>
                <button onClick={() => setAnchorOpen(false)} className="flex size-5 cursor-pointer items-center justify-center rounded text-muted hover:text-ink">
                  <X size={12} />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="위도 (lat)">
                  <input
                    type="number"
                    step="0.0001"
                    className={INPUT_CLS}
                    value={anchor.lat}
                    onChange={(e) => {
                      const v = Number(e.target.value)
                      if (!Number.isNaN(v)) setAnchor((a) => ({ ...a, lat: Math.max(-85, Math.min(85, v)) }))
                    }}
                  />
                </Field>
                <Field label="경도 (lng)">
                  <input
                    type="number"
                    step="0.0001"
                    className={INPUT_CLS}
                    value={anchor.lng}
                    onChange={(e) => {
                      const v = Number(e.target.value)
                      if (!Number.isNaN(v)) setAnchor((a) => ({ ...a, lng: Math.max(-180, Math.min(180, v)) }))
                    }}
                  />
                </Field>
              </div>
              <p className="mt-2 text-[10px] leading-relaxed text-muted">
                캔버스 중심(500,320)이 이 좌표에 매핑됩니다 · 1unit ≈ 1.25m · 관제 지도의 배경 타일도 함께 이동합니다
              </p>
              <button
                onClick={() => setAnchor({ ...DEFAULT_ANCHOR })}
                className="mt-2 h-8 w-full cursor-pointer rounded-[8px] border border-hairline text-xs text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
              >
                군포 사업소 좌표로 재설정
              </button>
            </div>
          )}
        </div>
        <div className="mx-1 h-6 w-px bg-hairline" />
        {/* 캔버스 회전 */}
        <Tip label="반시계 15° 회전 — 캔버스에서 Shift+드래그·Shift+휠로도 회전">
          <button onClick={() => rotateBy(-15)} className={ICON_BTN}>
            <RotateCcw size={16} />
          </button>
        </Tip>
        <Tip label="회전 초기화 (0°)">
          <button
            onClick={() => setRotation(0)}
            className={`h-7 min-w-11 cursor-pointer rounded-md px-1.5 text-xs font-semibold tabular-nums transition-colors ${
              rotation ? 'bg-surface-2 text-ink' : 'text-muted'
            }`}
          >
            {rotation}°
          </button>
        </Tip>
        <Tip label="시계 15° 회전">
          <button onClick={() => rotateBy(15)} className={ICON_BTN}>
            <RotateCw size={16} />
          </button>
        </Tip>
        <div className="ml-auto flex items-center gap-2">
          <span className="hidden text-xs text-muted 2xl:block">자동 저장 · 대시보드 연동</span>
          <button
            onClick={() => setShow3D((v) => !v)}
            className={`flex h-9 cursor-pointer items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors ${
              show3D ? 'bg-primary text-white' : 'text-ink-2 hover:bg-surface-2 hover:text-ink'
            }`}
          >
            <Box size={15} />
            3D
          </button>
          <div className="h-6 w-px bg-hairline" />
          <button
            onClick={() => navigate('/')}
            className="flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-hairline px-3 text-sm font-medium text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <LogOut size={15} />
            나가기
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* ── 2D 캔버스 (전체 폭) ── */}
        <div
          ref={wrapRef}
          className="relative min-w-0 flex-1 overflow-hidden"
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
        >
          <svg
            ref={svgRef}
            viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
            className="block h-full w-full touch-none"
            style={{ cursor: shapeCursor }}
            onPointerDown={onCanvasDown}
            onPointerMove={onCanvasMove}
            onPointerUp={onCanvasUp}
            onDoubleClick={onCanvasDblClick}
          >
            <defs>
              <pattern id="mb-grid" width={GRID * 2} height={GRID * 2} patternUnits="userSpaceOnUse">
                <path d={`M ${GRID * 2} 0 L 0 0 0 ${GRID * 2}`} fill="none" stroke="var(--grid-line)" strokeWidth="0.6" />
              </pattern>
              <pattern id="mb-grid-major" width={100} height={100} patternUnits="userSpaceOnUse">
                <path d="M 100 0 L 0 0 0 100" fill="none" stroke="var(--axis-line)" strokeWidth="0.6" />
              </pattern>
            </defs>
            {/* 회전 그룹 — 타일·그리드·요소 전부 함께 회전 (뷰 회전) */}
            <g transform={rotation ? `rotate(${rotation} ${CX} ${CY})` : undefined}>
              {bg !== 'none' && (
                <TileLayer
                  /* 회전 시 모서리 공백이 없도록 타일 범위를 여유 있게 확장 */
                  vb={
                    rotation
                      ? { x: vb.x - vb.w * 0.25, y: vb.y - vb.h * 0.25, w: vb.w * 1.5, h: vb.h * 1.5 }
                      : vb
                  }
                  kind={bg}
                  screenW={wrapRef.current?.clientWidth ?? 900}
                  anchor={anchor}
                />
              )}
              {/* 무한 그리드 — 경계 없이 뷰포트(회전 포함)를 항상 덮는 대형 패턴 면 */}
              {bg === 'none' && (
                <>
                  <rect x={-6000} y={-6000} width={13000} height={13000} fill="url(#mb-grid)" />
                  <rect x={-6000} y={-6000} width={13000} height={13000} fill="url(#mb-grid-major)" />
                </>
              )}

              {/* 지하 공동구 라인 */}
              {elements.map((el) => {
                if (el.kind !== 'tunnel' || !passLevel(el.level)) return null
                const sel = el.id === selectedId
                const ptsStr = el.path.map((p) => p.join(',')).join(' ')
                const mid = el.path[Math.floor(el.path.length / 2)]
                return (
                  <g key={el.id}>
                    <polyline
                      points={ptsStr}
                      fill="none"
                      stroke="#3b82f6"
                      strokeWidth={el.width ?? 18}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      opacity={sel ? 0.32 : 0.16}
                      style={{ cursor: tool === 'select' ? 'move' : undefined }}
                      onPointerDown={(e) => onElementDown(e, el)}
                    >
                      <title>{`${el.name} · ${levelName(el.level)}`}</title>
                    </polyline>
                    <polyline
                      points={ptsStr}
                      fill="none"
                      stroke={sel ? 'var(--primary)' : '#3b82f6'}
                      strokeWidth="1.5"
                      strokeDasharray="7 5"
                      strokeLinejoin="round"
                      opacity="0.8"
                      pointerEvents="none"
                    />
                    {sel &&
                      el.path.map((p, i) => (
                        <circle key={i} cx={p[0]} cy={p[1]} r="3" fill="var(--surface-1)" stroke="var(--primary)" strokeWidth="1.5" pointerEvents="none" />
                      ))}
                    <text
                      x={mid[0]}
                      y={mid[1] - 7}
                      textAnchor="middle"
                      fontSize="9"
                      fontWeight="600"
                      fill="#60a5fa"
                      pointerEvents="none"
                      transform={counterRot(mid[0], mid[1] - 7)}
                    >
                      {el.name} · {levelShort(el.level)}
                    </text>
                  </g>
                )
              })}

              {/* 건물 */}
              {elements.map((el) => {
                if (el.kind !== 'building') return null
                const onFloor = levelFilter === 'all' || bldOnFloor(el, levelFilter)
                const sel = el.id === selectedId
                const cx = el.x + el.w / 2
                const cy = el.y + el.h / 2
                const shapeProps = {
                  fill: '#8b5cf6',
                  fillOpacity: 0.13,
                  stroke: sel ? 'var(--primary)' : '#8b5cf6',
                  strokeWidth: sel ? 2 : 1.5,
                  style: { cursor: tool === 'select' ? 'move' : undefined },
                  onPointerDown: (e: React.PointerEvent) => onElementDown(e, el),
                }
                return (
                  <g key={el.id} opacity={onFloor ? 1 : 0.12} pointerEvents={onFloor ? undefined : 'none'}>
                    <g transform={el.rot ? `rotate(${el.rot} ${cx} ${cy})` : undefined}>
                      {el.shape === 'poly' && el.pts ? (
                        <path d={polyPath(el.pts)} {...shapeProps} />
                      ) : el.shape === 'rect' ? (
                        <rect x={el.x} y={el.y} width={el.w} height={el.h} rx={3} {...shapeProps} />
                      ) : (
                        <ellipse cx={cx} cy={cy} rx={el.w / 2} ry={el.h / 2} {...shapeProps} />
                      )}
                    </g>
                    <g transform={counterRot(cx, cy)} pointerEvents="none">
                      <text x={cx} y={cy - 2} textAnchor="middle" fontSize={12} fontWeight={600} fill="var(--text-secondary)">
                        {el.name}
                      </text>
                      <text x={cx} y={cy + 13} textAnchor="middle" fontSize={10} fill="var(--text-muted)">
                        {el.floorsUp > 0 ? `지상 ${el.floorsUp}층` : ''}
                        {el.floorsUp > 0 && el.floorsDown > 0 ? ' · ' : ''}
                        {el.floorsDown > 0 ? `지하 ${el.floorsDown}층` : ''}
                      </text>
                    </g>
                  </g>
                )
              })}

              {/* 작업영역(Room) — 건물 내 층별 구획 (대시보드와 동일한 점선 구획) */}
              {elements.map((el) => {
                if (el.kind !== 'room' || !passLevel(el.level)) return null
                const sel = el.id === selectedId
                const cx = el.x + el.w / 2
                const cy = el.y + el.h / 2
                const roomProps = {
                  fill: 'var(--series-1)',
                  fillOpacity: 0.04,
                  stroke: sel ? 'var(--primary)' : 'var(--axis-line)',
                  strokeOpacity: sel ? 1 : 0.75,
                  strokeWidth: sel ? 1.6 : 1,
                  strokeDasharray: '3 3',
                  style: { cursor: tool === 'select' ? 'move' : undefined },
                  onPointerDown: (e: React.PointerEvent) => onElementDown(e, el),
                } as const
                const roomTitle = <title>{`${el.name} · 작업영역 · ${levelName(el.level)}`}</title>
                return (
                  <g key={el.id}>
                    <g transform={el.rot ? `rotate(${el.rot} ${cx} ${cy})` : undefined}>
                      {el.shape === 'poly' && el.pts ? (
                        <path d={polyPath(el.pts)} {...roomProps}>{roomTitle}</path>
                      ) : el.shape === 'ellipse' ? (
                        <ellipse cx={cx} cy={cy} rx={el.w / 2} ry={el.h / 2} {...roomProps}>{roomTitle}</ellipse>
                      ) : (
                        <rect x={el.x} y={el.y} width={el.w} height={el.h} {...roomProps}>{roomTitle}</rect>
                      )}
                    </g>
                    <text
                      x={cx}
                      y={cy + 3}
                      textAnchor="middle"
                      fontSize={9}
                      fill="var(--text-muted)"
                      pointerEvents="none"
                      transform={counterRot(cx, cy + 3)}
                    >
                      {el.name}
                      {levelFilter === 'all' && el.level !== 1 ? ` · ${levelShort(el.level)}` : ''}
                    </text>
                  </g>
                )
              })}

              {/* 지오펜스 */}
              {elements.map((el) => {
                if (el.kind !== 'fence' || !passLevel(el.level)) return null
                const sel = el.id === selectedId
                const cx = el.x + el.w / 2
                const cy = el.y + el.h / 2
                const shapeProps = {
                  fill: FENCE_COLOR,
                  fillOpacity: 0.08,
                  stroke: sel ? 'var(--primary)' : FENCE_COLOR,
                  strokeWidth: sel ? 2 : 1.5,
                  strokeDasharray: '6 4',
                  style: { cursor: tool === 'select' ? 'move' : undefined },
                  onPointerDown: (e: React.PointerEvent) => onElementDown(e, el),
                }
                return (
                  <g key={el.id} opacity={el.level < 0 ? 0.85 : 1}>
                    <g transform={el.rot ? `rotate(${el.rot} ${cx} ${cy})` : undefined}>
                      {el.shape === 'poly' && el.pts ? (
                        <path d={polyPath(el.pts)} {...shapeProps} />
                      ) : el.shape === 'ellipse' ? (
                        <ellipse cx={cx} cy={cy} rx={el.w / 2} ry={el.h / 2} {...shapeProps} />
                      ) : (
                        <rect x={el.x} y={el.y} width={el.w} height={el.h} rx={4} {...shapeProps} />
                      )}
                    </g>
                    <text
                      x={el.x + 6}
                      y={el.y + 14}
                      fontSize={10}
                      fontWeight={600}
                      fill={FENCE_COLOR}
                      pointerEvents="none"
                      transform={counterRot(el.x + 6, el.y + 14)}
                    >
                      {el.name} · {levelName(el.level)}
                    </text>
                  </g>
                )
              })}

              {/* 심볼 */}
              {elements.map((el) => {
                if (el.kind !== 'symbol') return null
                const sel = el.id === selectedId
                /* 계단 — ST 칩 대신 실제 계단 심볼(디딤판 + 상/하행 화살표), 폭 조절 */
                if (el.type === 'stairs') {
                  const from = el.level
                  const to = el.toLevel ?? -1
                  const lo = Math.min(from, to)
                  const hi = Math.max(from, to)
                  if (levelFilter !== 'all' && (levelFilter < lo || levelFilter > hi)) return null
                  const w = Math.max(20, el.width ?? 34)
                  const down = to < from
                  const sRot = el.rot ?? 0
                  const ax = w / 2 - 6
                  const treads: number[] = []
                  for (let tx = -w / 2 + 4; tx <= w / 2 - 11; tx += 4) treads.push(tx)
                  return (
                    <g
                      key={el.id}
                      transform={`translate(${el.x},${el.y})`}
                      style={{ cursor: tool === 'select' ? 'move' : undefined }}
                      onPointerDown={(e) => onElementDown(e, el)}
                    >
                      <title>{`${el.name} 계단실 · ${levelName(from)} → ${levelName(to)} (${down ? '하행' : to > from ? '상행' : '동일 층'}) · 폭 ${w}${sRot ? ` · 회전 ${sRot}°` : ''}`}</title>
                      {/* 계단 몸체 — 오브젝트 회전을 따라 지오메트리처럼 회전 */}
                      <g transform={sRot ? `rotate(${sRot})` : undefined}>
                        {sel && (
                          <rect x={-w / 2 - 3.5} y={-12.5} width={w + 7} height={25} rx={4} fill="none" stroke="var(--primary)" strokeWidth={1.5} />
                        )}
                        <rect
                          x={-w / 2}
                          y={-9}
                          width={w}
                          height={18}
                          rx={2}
                          fill="var(--surface-1)"
                          fillOpacity="0.8"
                          stroke="var(--axis-line)"
                          strokeWidth="1"
                        />
                        {treads.map((tx) => (
                          <line key={tx} x1={tx} y1={-9} x2={tx} y2={9} stroke="var(--axis-line)" strokeWidth="1" pointerEvents="none" />
                        ))}
                        {/* 방향 화살표 — 하행 ↓ / 상행 ↑ */}
                        <g pointerEvents="none" stroke="var(--text-secondary)" strokeWidth="1.3" fill="none" strokeLinecap="round" strokeLinejoin="round">
                          <line x1={ax} y1={-5} x2={ax} y2={5} />
                          {down ? (
                            <path d={`M ${ax - 2.2},2.4 L ${ax},5 L ${ax + 2.2},2.4`} />
                          ) : (
                            <path d={`M ${ax - 2.2},-2.4 L ${ax},-5 L ${ax + 2.2},-2.4`} />
                          )}
                        </g>
                        {/* 회전 핸들 — 우측 하단 */}
                        {sel && (
                          <>
                            <line x1={w / 2 + 2} y1={11} x2={w / 2 + 8} y2={17} stroke="var(--primary)" strokeWidth="1" strokeDasharray="2 2" opacity="0.6" pointerEvents="none" />
                            <g
                              transform={`translate(${w / 2 + 12} 21)`}
                              style={{ cursor: 'grab' }}
                              onPointerDown={(e) => onRotSymDown(e, el)}
                            >
                              <circle r="6" fill="var(--surface-1)" stroke="var(--primary)" strokeWidth="1.5">
                                <title>{`회전 핸들 — 드래그: 회전 (현재 ${sRot}°) · Alt+클릭: 0°`}</title>
                              </circle>
                              <path d="M -2.4,-1.1 A 2.7,2.7 0 1 1 -2.4,1.9" fill="none" stroke="var(--primary)" strokeWidth="1.1" pointerEvents="none" />
                              <path d="M -3.7,0.9 L -2.4,1.9 L -1.2,0.8" fill="none" stroke="var(--primary)" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" pointerEvents="none" />
                            </g>
                          </>
                        )}
                      </g>
                      {levelFilter === 'all' && (
                        <text
                          y={19}
                          textAnchor="middle"
                          fontSize={7.5}
                          fill="var(--text-muted)"
                          pointerEvents="none"
                          transform={rotation ? `rotate(${-rotation} 0 19)` : undefined}
                        >
                          {levelShort(from)}
                          {down ? '↓' : to > from ? '↑' : ''}
                          {levelShort(to)}
                        </text>
                      )}
                    </g>
                  )
                }
                if (!passLevel(el.level)) return null
                const d = symbolDef(el.type)
                /* 출입구 — 벽 개구부 심볼(문지방 + 양측 문설주). 방향성 없음,
                 * 벽면 스냅 방향(rot)과 폭 반영. 지오메트리처럼 뷰와 함께 회전 */
                if (el.type === 'door') {
                  const w = Math.max(8, el.width ?? 12)
                  const half = w / 2
                  const dRot = el.rot ?? 0
                  const badge = (dRot % 180 !== 0 ? half : 4) + 9
                  return (
                    <g
                      key={el.id}
                      transform={`translate(${el.x},${el.y})`}
                      opacity={el.level < 0 ? 0.8 : 1}
                      style={{ cursor: tool === 'select' ? 'move' : undefined }}
                      onPointerDown={(e) => onElementDown(e, el)}
                    >
                      <title>{`${el.name} · 출입구 · ${levelName(el.level)} · 폭 ${w}`}</title>
                      <g transform={dRot ? `rotate(${dRot})` : undefined}>
                        {sel && (
                          <rect x={-half - 4} y={-7.5} width={w + 8} height={15} rx={3} fill="none" stroke="var(--primary)" strokeWidth={1.5} />
                        )}
                        <line x1={-half} y1={0} x2={half} y2={0} stroke={d.color} strokeWidth={4} opacity={0.8} />
                        <line x1={-half} y1={-4.5} x2={-half} y2={4.5} stroke={d.color} strokeWidth={1.6} />
                        <line x1={half} y1={-4.5} x2={half} y2={4.5} stroke={d.color} strokeWidth={1.6} />
                      </g>
                      {el.level !== 1 && (
                        <text
                          y={badge}
                          textAnchor="middle"
                          fontSize={6}
                          fill="var(--text-muted)"
                          pointerEvents="none"
                          transform={rotation ? `rotate(${-rotation} 0 ${badge})` : undefined}
                        >
                          {levelShort(el.level)}
                        </text>
                      )}
                    </g>
                  )
                }
                /* 타입별 2D 마커 — 비콘·중계기는 대시보드 마커와 동일,
                 * 출입구·공동구 출입구는 3D 모델과 대응하는 도면식 심볼 */
                let glyph: ReactNode
                let badgeY = 14
                if (el.type === 'gateway') {
                  badgeY = 13
                  glyph = (
                    <>
                      {sel && <circle r={9.5} fill="none" stroke="var(--primary)" strokeWidth={1.5} />}
                      {/* 대시보드 마커를 0.65배 축소 — 빌더 격자 밀도에 맞춤 */}
                      <g transform="scale(0.65)">
                        <circle r="10" fill="var(--series-1)" opacity="0.95" />
                        <path d="M-4.5,-0.5 a6.3,6.3 0 0 1 9,0 M-2.4,1.8 a3.2,3.2 0 0 1 4.8,0" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" pointerEvents="none" />
                        <circle cy="4.2" r="1.3" fill="white" pointerEvents="none" />
                      </g>
                    </>
                  )
                } else if (el.type === 'beacon') {
                  badgeY = 13
                  glyph = (
                    <>
                      {sel && <rect x={-7.5} y={-7.5} width={15} height={15} rx={3.5} fill="none" stroke="var(--primary)" strokeWidth={1.5} />}
                      <rect x="-4.5" y="-4.5" width="9" height="9" rx="2" fill="var(--series-4)" opacity="0.9" />
                      <rect x="-1.8" y="-1.8" width="3.6" height="3.6" rx="1" fill="var(--surface-1)" pointerEvents="none" />
                    </>
                  )
                } else if (el.type === 'entrance') {
                  badgeY = 13
                  glyph = (
                    <>
                      {sel && <rect x={-7} y={-7} width={14} height={14} rx={3} fill="none" stroke="var(--primary)" strokeWidth={1.5} />}
                      <rect x="-4" y="-4" width="8" height="8" rx="1.5" fill="var(--surface-1)" stroke="var(--series-1)" strokeWidth="1.4" />
                      <path d="M-2,-1 L0,1.6 L2,-1" fill="none" stroke="var(--series-1)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" pointerEvents="none" />
                    </>
                  )
                } else {
                  /* 가스검침기 — 대시보드와 동일한 마름모 + 불꽃 마커 */
                  badgeY = 15
                  glyph = (
                    <>
                      {sel && <circle r={11} fill="none" stroke="var(--primary)" strokeWidth={1.5} />}
                      <rect
                        x="-5.2"
                        y="-5.2"
                        width="10.4"
                        height="10.4"
                        rx="2"
                        transform="rotate(45)"
                        fill={d.color}
                        stroke="var(--surface-1)"
                        strokeWidth="1.2"
                      />
                      <path
                        d="M0,-3 C1.8,-1 2.6,0.1 2.6,1.1 A2.6,2.6 0 1 1 -2.6,1.1 C-2.6,0.1 -1.8,-1 0,-3 Z"
                        fill="var(--surface-1)"
                        pointerEvents="none"
                      />
                    </>
                  )
                }
                return (
                  <g
                    key={el.id}
                    transform={`translate(${el.x},${el.y})${rotation ? ` rotate(${-rotation})` : ''}`}
                    opacity={el.level < 0 ? 0.8 : 1}
                    style={{ cursor: tool === 'select' ? 'move' : undefined }}
                    onPointerDown={(e) => onElementDown(e, el)}
                  >
                    <title>{`${el.name} · ${d.label} · ${levelName(el.level)}`}</title>
                    {glyph}
                    {el.level !== 1 && (
                      <text y={badgeY} textAnchor="middle" fontSize={6} fill="var(--text-muted)" pointerEvents="none">
                        {levelShort(el.level)}
                      </text>
                    )}
                  </g>
                )
              })}

              {/* bbox 드로잉 프리뷰 (직각/타원 — 건물·작업영역·지오펜스 공통) */}
              {draft && draft.w > 0 && draft.h > 0 && (
                shapeMode === 'ellipse' ? (
                  <ellipse cx={draft.x + draft.w / 2} cy={draft.y + draft.h / 2} rx={draft.w / 2} ry={draft.h / 2} fill="var(--primary)" fillOpacity={0.08} stroke="var(--primary)" strokeWidth={1.5} strokeDasharray="5 4" pointerEvents="none" />
                ) : (
                  <rect x={draft.x} y={draft.y} width={draft.w} height={draft.h} rx={3} fill="var(--primary)" fillOpacity={0.08} stroke="var(--primary)" strokeWidth={1.5} strokeDasharray="5 4" pointerEvents="none" />
                )
              )}

              {/* 포인트 드로잉 프리뷰 (포인트 건물/공동구) */}
              {draftPts.length > 0 && (
                <g pointerEvents="none">
                  {tool === 'tunnel' && (
                    <polyline
                      points={previewPts.map((p) => `${p.x},${p.y}`).join(' ')}
                      fill="none"
                      stroke="#3b82f6"
                      strokeWidth="16"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      opacity="0.14"
                    />
                  )}
                  <path
                    d={polyPath(previewPts, false)}
                    fill={polyTarget ? 'var(--primary)' : 'none'}
                    fillOpacity={polyTarget ? 0.06 : 0}
                    stroke="var(--primary)"
                    strokeWidth="1.5"
                    strokeDasharray="5 4"
                  />
                  {polyTarget && draftPts.length >= 3 && (
                    <>
                      <line
                        x1={previewPts[previewPts.length - 1].x}
                        y1={previewPts[previewPts.length - 1].y}
                        x2={draftPts[0].x}
                        y2={draftPts[0].y}
                        stroke="var(--primary)"
                        strokeWidth="1"
                        strokeDasharray="3 4"
                        opacity="0.5"
                      />
                      <circle cx={draftPts[0].x} cy={draftPts[0].y} r="7" fill="none" stroke="var(--primary)" strokeWidth="1.2" opacity="0.7" />
                    </>
                  )}
                  {draftPts.map((p, i) => (
                    <circle key={i} cx={p.x} cy={p.y} r="3.2" fill={p.c ? 'var(--status-warning)' : 'var(--primary)'} stroke="var(--surface-1)" strokeWidth="1.2" />
                  ))}
                </g>
              )}

              {/* 선택 핸들 — 직각/타원: bbox 리사이즈, 다각형: 정점·곡선 편집.
               * 오브젝트 회전각을 따라 함께 회전하고, 우측 하단에 회전 핸들 */}
              {shaped && (
              <g
                transform={
                  shaped.rot
                    ? `rotate(${shaped.rot} ${shaped.x + shaped.w / 2} ${shaped.y + shaped.h / 2})`
                    : undefined
                }
              >
              {!shapedPoly &&
                [
                  [shaped.x, shaped.y],
                  [shaped.x + shaped.w, shaped.y],
                  [shaped.x, shaped.y + shaped.h],
                  [shaped.x + shaped.w, shaped.y + shaped.h],
                ].map(([hx, hy], i) => (
                  <rect
                    key={i}
                    x={hx - 4}
                    y={hy - 4}
                    width={8}
                    height={8}
                    rx={1.5}
                    fill="var(--surface-1)"
                    stroke="var(--primary)"
                    strokeWidth={1.5}
                    style={{ cursor: i === 0 || i === 3 ? 'nwse-resize' : 'nesw-resize' }}
                    onPointerDown={(e) => onHandleDown(e, shaped, hx, hy)}
                  />
                ))}
              {shapedPoly && (
                <>
                  {/* 변 중점 핸들 — 드래그하면 그 변이 곡선으로 (제어점 삽입) */}
                  {shapedPoly.pts!.map((p, i) => {
                    const nxt = shapedPoly.pts![(i + 1) % shapedPoly.pts!.length]
                    if (p.c || nxt.c) return null
                    return (
                      <circle
                        key={`edge-${i}`}
                        cx={(p.x + nxt.x) / 2}
                        cy={(p.y + nxt.y) / 2}
                        r="4"
                        fill="var(--page)"
                        fillOpacity="0.7"
                        stroke="var(--primary)"
                        strokeWidth="1.3"
                        strokeDasharray="2 1.5"
                        style={{ cursor: 'crosshair' }}
                        onPointerDown={(e) => onEdgeDown(e, shapedPoly, i)}
                      >
                        <title>드래그하여 이 변을 곡선으로</title>
                      </circle>
                    )
                  })}
                  {/* 정점 핸들 — 드래그 이동 · Alt+클릭 삭제. 곡선 제어점은 주황 원 */}
                  {shapedPoly.pts!.map((p, i) =>
                    p.c ? (
                      <circle
                        key={`v-${i}`}
                        cx={p.x}
                        cy={p.y}
                        r="4.2"
                        fill="var(--status-warning)"
                        stroke="var(--surface-1)"
                        strokeWidth="1.4"
                        style={{ cursor: 'move' }}
                        onPointerDown={(e) => onVertexDown(e, shapedPoly, i)}
                      >
                        <title>곡선 제어점 — 드래그: 곡률 조절 · Alt+클릭: 직선으로</title>
                      </circle>
                    ) : (
                      <rect
                        key={`v-${i}`}
                        x={p.x - 3.5}
                        y={p.y - 3.5}
                        width={7}
                        height={7}
                        rx={1.5}
                        fill="var(--surface-1)"
                        stroke="var(--primary)"
                        strokeWidth={1.5}
                        style={{ cursor: 'move' }}
                        onPointerDown={(e) => onVertexDown(e, shapedPoly, i)}
                      >
                        <title>정점 — 드래그: 이동 · Alt+클릭: 삭제</title>
                      </rect>
                    ),
                  )}
                </>
              )}
              {/* 회전 핸들 — 우측 하단 코너 바깥 */}
              <line
                x1={shaped.x + shaped.w + 3}
                y1={shaped.y + shaped.h + 3}
                x2={shaped.x + shaped.w + 11}
                y2={shaped.y + shaped.h + 11}
                stroke="var(--primary)"
                strokeWidth="1"
                strokeDasharray="2 2"
                opacity="0.6"
                pointerEvents="none"
              />
              <g
                transform={`translate(${shaped.x + shaped.w + 16} ${shaped.y + shaped.h + 16})`}
                style={{ cursor: 'grab' }}
                onPointerDown={(e) => onRotObjDown(e, shaped)}
              >
                <circle r="6.5" fill="var(--surface-1)" stroke="var(--primary)" strokeWidth="1.5">
                  <title>{`회전 핸들 — 드래그: 회전 (현재 ${shaped.rot ?? 0}°) · Alt+클릭: 0°`}</title>
                </circle>
                <path d="M -2.6,-1.2 A 2.9,2.9 0 1 1 -2.6,2.1" fill="none" stroke="var(--primary)" strokeWidth="1.2" pointerEvents="none" />
                <path d="M -4,1 L -2.6,2.1 L -1.3,0.9" fill="none" stroke="var(--primary)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" pointerEvents="none" />
              </g>
              </g>
              )}
            </g>
          </svg>

          {/* 층 필터 — 건물 층수 속성에서 유도 */}
          <div className="absolute left-3 top-3 z-10 flex gap-1 rounded-[10px] border border-hairline bg-surface-1/90 p-1 backdrop-blur">
            <button
              onClick={() => setLevelFilter('all')}
              className={`h-7 cursor-pointer rounded-md px-2.5 text-xs font-medium transition-colors ${
                levelFilter === 'all' ? 'bg-primary text-white' : 'text-ink-2 hover:bg-surface-2'
              }`}
            >
              전체
            </button>
            {floorChips.map((f) => (
              <button
                key={f}
                onClick={() => setLevelFilter(f)}
                title={levelName(f)}
                className={`h-7 cursor-pointer rounded-md px-2 text-xs font-medium tabular-nums transition-colors ${
                  levelFilter === f ? 'bg-primary text-white' : 'text-ink-2 hover:bg-surface-2'
                }`}
              >
                {levelShort(f)}
              </button>
            ))}
          </div>

          {/* 줌 컨트롤 */}
          <div className="absolute left-3 top-[52px] z-10 flex flex-col items-center gap-1">
            {[
              { icon: <Plus size={14} />, label: '줌인', fn: () => setVb((p) => clampVb(zoomVb(p, 0.75, p.x + p.w / 2, p.y + p.h / 2))) },
              { icon: <Minus size={14} />, label: '줌아웃', fn: () => setVb((p) => clampVb(zoomVb(p, 1.33, p.x + p.w / 2, p.y + p.h / 2))) },
              { icon: <LocateFixed size={13} />, label: '보기 초기화', fn: () => setVb(BASE_VB) },
            ].map((b) => (
              <button
                key={b.label}
                onClick={b.fn}
                onPointerDown={(e) => e.stopPropagation()}
                className="flex size-8 cursor-pointer items-center justify-center rounded-lg border border-hairline bg-surface-1/85 text-ink-2 backdrop-blur-sm transition-colors hover:bg-surface-2 hover:text-ink"
                aria-label={b.label}
                title={b.label}
              >
                {b.icon}
              </button>
            ))}
            <span className="mt-0.5 rounded-md bg-surface-1/85 px-1.5 py-0.5 text-[10px] tabular-nums text-muted backdrop-blur-sm">
              {Math.round((BASE_VB.w / vb.w) * 100)}%
            </span>
          </div>

          {/* 도구 도움말 */}
          <p className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 whitespace-nowrap rounded-[8px] border border-hairline bg-surface-1/85 px-2.5 py-1.5 text-[11px] text-muted backdrop-blur">
            {helpText}
          </p>
          {/* 배치 제약 안내 배너 */}
          {notice && (
            <p className="pointer-events-none absolute left-1/2 top-12 z-20 -translate-x-1/2 whitespace-nowrap rounded-[8px] border border-warning/40 bg-warning/15 px-3 py-1.5 text-[11px] font-semibold text-warning backdrop-blur">
              {notice}
            </p>
          )}

          {/* 축척 바 + 배경 지도 저작권 */}
          <div className="pointer-events-none absolute bottom-3 right-3 z-10 flex items-center gap-2 text-[10px] text-muted">
            {bg === 'map' && <span className="opacity-80">© OpenStreetMap · CARTO</span>}
            {bg === 'sat' && <span className="opacity-80">© Esri World Imagery</span>}
            <ScaleBar vb={vb} wrap={wrapRef.current} />
          </div>

          {/* ── 플로팅 속성 창 ── */}
          {selected && propsOpen && (
            <div className="absolute right-3 top-3 z-20 flex max-h-[calc(100%-110px)] w-72 flex-col rounded-[14px] border border-hairline bg-surface-1/95 shadow-2xl backdrop-blur">
              <div className="flex shrink-0 items-center justify-between border-b border-hairline px-4 py-2.5">
                <p className="text-xs font-bold text-ink">
                  속성
                  <span className="ml-1.5 font-normal text-muted">
                    {selected.kind === 'building'
                      ? '건물'
                      : selected.kind === 'fence'
                        ? '지오펜스'
                        : selected.kind === 'tunnel'
                          ? '지하 공동구'
                          : selected.kind === 'room'
                            ? '작업영역'
                            : '심볼'}
                  </span>
                </p>
                <button
                  onClick={() => setPropsOpen(false)}
                  className="flex size-6 cursor-pointer items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-ink"
                  aria-label="속성 창 닫기"
                >
                  <X size={13} />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-4 pt-3">
                {selected.kind === 'building' && (
                  <div className="space-y-3">
                    <Field label="건물 이름">
                      <input className={INPUT_CLS} value={selected.name} onChange={(e) => patchEl(selected.id, { name: e.target.value })} />
                    </Field>
                    <div className="grid grid-cols-2 gap-2">
                      <Field label="지상 층수">
                        <select className={SELECT_CLS} value={selected.floorsUp} onChange={(e) => patchFloors(selected, Number(e.target.value), selected.floorsDown)}>
                          {[0, 1, 2, 3, 4, 5].map((n) => (
                            <option key={n} value={n}>{n}층</option>
                          ))}
                        </select>
                      </Field>
                      <Field label="지하 층수">
                        <select className={SELECT_CLS} value={selected.floorsDown} onChange={(e) => patchFloors(selected, selected.floorsUp, Number(e.target.value))}>
                          {[0, 1, 2, 3].map((n) => (
                            <option key={n} value={n}>{n}층</option>
                          ))}
                        </select>
                      </Field>
                    </div>
                    {selected.shape !== 'poly' ? (
                      <div className="grid grid-cols-2 gap-2">
                        {(
                          [
                            ['X', 'x', X_MIN, X_MAX - selected.w],
                            ['Y', 'y', Y_MIN, Y_MAX - selected.h],
                            ['너비', 'w', MIN_SIZE, MAP_W],
                            ['높이', 'h', MIN_SIZE, MAP_H],
                          ] as Array<[string, 'x' | 'y' | 'w' | 'h', number, number]>
                        ).map(([label, key, min, max]) => (
                          <Field key={key} label={label}>
                            <input
                              type="number"
                              className={INPUT_CLS}
                              value={selected[key]}
                              min={min}
                              max={max}
                              step={GRID}
                              onChange={(e) => {
                                const v = Number(e.target.value)
                                if (Number.isNaN(v)) return
                                patchEl(selected.id, { [key]: Math.max(min, Math.min(max, v)) })
                              }}
                            />
                          </Field>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[11px] leading-relaxed text-muted">
                        정점 {selected.pts?.length ?? 0}개 · 곡선 정점 {selected.pts?.filter((p) => p.c).length ?? 0}개
                        <br />변 중점 드래그: 곡선 · 정점 Alt+클릭: 삭제
                      </p>
                    )}
                    <p className="text-[11px] text-muted">
                      형태: {selected.shape === 'rect' ? '직각' : selected.shape === 'ellipse' ? '타원형' : '포인트(다각형)'} · 격자 {GRID}px 스냅
                      {selected.rot ? ` · 회전 ${selected.rot}°` : ''}
                    </p>
                  </div>
                )}

                {selected.kind === 'fence' && (
                  <div className="space-y-3">
                    <Field label="지오펜스 이름">
                      <input className={INPUT_CLS} value={selected.name} onChange={(e) => patchEl(selected.id, { name: e.target.value })} />
                    </Field>
                    <Field label="적용 층">
                      <select className={SELECT_CLS} value={selected.level} onChange={(e) => patchEl(selected.id, { level: Number(e.target.value) })}>
                        {(levelOpts.includes(selected.level) ? levelOpts : [...levelOpts, selected.level]).map((lv) => (
                          <option key={lv} value={lv}>{levelName(lv)}</option>
                        ))}
                      </select>
                    </Field>
                    <p className="text-[11px] text-muted">
                      형태: {selected.shape === 'rect' ? '직각' : selected.shape === 'ellipse' ? '타원형' : '다각형'}
                      {selected.shape === 'poly' && selected.pts
                        ? ` · 정점 ${selected.pts.length}개 (변 중점 드래그: 곡선)`
                        : ''}
                      {selected.rot ? ` · 회전 ${selected.rot}°` : ''}
                    </p>
                    <p className="text-[11px] leading-relaxed text-muted">
                      지오펜스는 층에 귀속되는 가상 감시 경계입니다. 위험 등급은 관제 실데이터에서
                      동적으로 판정되며, 비콘은 지오펜스 내부에만 배치할 수 있습니다.
                    </p>
                  </div>
                )}

                {selected.kind === 'room' && (() => {
                  /* 작업영역 층 선택지도 소속 건물의 층 구성에 귀속 */
                  const roomBld = buildingAt(selected.x + selected.w / 2, selected.y + selected.h / 2)
                  const roomOpts = levelOptsFor(roomBld)
                  return (
                  <div className="space-y-3">
                    <Field label="작업영역 이름">
                      <input className={INPUT_CLS} value={selected.name} onChange={(e) => patchEl(selected.id, { name: e.target.value })} />
                    </Field>
                    <Field label="적용 층">
                      <select className={SELECT_CLS} value={selected.level} onChange={(e) => patchEl(selected.id, { level: Number(e.target.value) })}>
                        {(roomOpts.includes(selected.level) ? roomOpts : [...roomOpts, selected.level]).map((lv) => (
                          <option key={lv} value={lv}>{levelName(lv)}</option>
                        ))}
                      </select>
                    </Field>
                    <p className="text-[11px] text-muted">
                      형태: {selected.shape === 'ellipse' ? '타원형' : selected.shape === 'poly' ? '다각형' : '직각'}
                      {selected.shape === 'poly' && selected.pts
                        ? ` · 정점 ${selected.pts.length}개 (변 중점 드래그: 곡선)`
                        : ''}
                      {selected.rot ? ` · 회전 ${selected.rot}°` : ''}
                    </p>
                    <p className="text-[11px] leading-relaxed text-muted">
                      작업영역은 건물 내 층별 세부 작업 구획입니다.
                      {roomBld
                        ? ` 소속 건물: ${roomBld.name} — 층 선택지는 건물 층 구성을 따릅니다.`
                        : ' 소속 건물은 위치로 자동 판정되어 관제 건물 상세에 표시됩니다.'}
                    </p>
                  </div>
                  )
                })()}

                {selected.kind === 'tunnel' && (
                  <div className="space-y-3">
                    <Field label="공동구 이름">
                      <input className={INPUT_CLS} value={selected.name} onChange={(e) => patchEl(selected.id, { name: e.target.value })} />
                    </Field>
                    <div className="grid grid-cols-2 gap-2">
                      <Field label="설치 층">
                        <select className={SELECT_CLS} value={selected.level} onChange={(e) => patchEl(selected.id, { level: Number(e.target.value) })}>
                          {(tunnelLevelOpts.includes(selected.level) ? tunnelLevelOpts : [...tunnelLevelOpts, selected.level]).map((lv) => (
                            <option key={lv} value={lv}>{levelName(lv)}</option>
                          ))}
                        </select>
                      </Field>
                      <Field label="통로 폭">
                        <input
                          type="number"
                          className={INPUT_CLS}
                          value={selected.width ?? 18}
                          min={10}
                          max={40}
                          step={2}
                          onChange={(e) => {
                            const v = Number(e.target.value)
                            if (!Number.isNaN(v))
                              patchEl(selected.id, { width: Math.max(10, Math.min(40, v)) })
                          }}
                        />
                      </Field>
                    </div>
                    <p className="text-[11px] text-muted">경유점 {selected.path.length}개 · 드래그로 전체 이동 · 폭은 2D/3D·관제 지도에 반영</p>
                  </div>
                )}

                {selected.kind === 'symbol' && (() => {
                  /* 건물 안 심볼 — 층 선택지는 소속 건물의 층 구성에 귀속 */
                  const symBld = buildingAt(selected.x, selected.y)
                  const symOpts = levelOptsFor(symBld)
                  return (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2.5">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg text-white" style={{ background: symbolDef(selected.type).color }}>
                        {SYMBOL_ICON[selected.type]}
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-ink">{symbolDef(selected.type).label}</p>
                        <p className="text-[11px] text-muted">{symbolDef(selected.type).code}</p>
                      </div>
                    </div>
                    <Field label="심볼 이름">
                      <input className={INPUT_CLS} value={selected.name} onChange={(e) => patchEl(selected.id, { name: e.target.value })} />
                    </Field>
                    {selected.type === 'stairs' ? (
                      <>
                        <div className="grid grid-cols-2 gap-2">
                          <Field label="시작 층">
                            <select className={SELECT_CLS} value={selected.level} onChange={(e) => patchEl(selected.id, { level: Number(e.target.value) })}>
                              {(symOpts.includes(selected.level) ? symOpts : [...symOpts, selected.level]).map((lv) => (
                                <option key={lv} value={lv}>{levelName(lv)}</option>
                              ))}
                            </select>
                          </Field>
                          <Field label="도착 층">
                            <select
                              className={SELECT_CLS}
                              value={selected.toLevel ?? -1}
                              onChange={(e) => patchEl(selected.id, { toLevel: Number(e.target.value) })}
                            >
                              {(symOpts.includes(selected.toLevel ?? -1)
                                ? symOpts
                                : [...symOpts, selected.toLevel ?? -1]
                              ).map((lv) => (
                                <option key={lv} value={lv}>{levelName(lv)}</option>
                              ))}
                            </select>
                          </Field>
                        </div>
                        <Field label="계단 폭">
                          <input
                            type="number"
                            className={INPUT_CLS}
                            value={selected.width ?? 34}
                            min={20}
                            max={100}
                            step={2}
                            onChange={(e) => {
                              const v = Number(e.target.value)
                              if (Number.isNaN(v)) return
                              const nw = Math.max(20, Math.min(100, v))
                              /* 폭이 커져도 건물 벽과 겹치지 않게 위치 보정 */
                              const [cx2, cy2] = clampStairPos(
                                elements,
                                { width: nw, rot: selected.rot },
                                selected.x,
                                selected.y,
                              )
                              patchEl(selected.id, { width: nw, x: cx2, y: cy2 })
                            }}
                          />
                        </Field>
                        <p className="text-[11px] text-muted">
                          {(selected.toLevel ?? -1) < selected.level
                            ? '↓ 하행 계단'
                            : (selected.toLevel ?? -1) > selected.level
                              ? '↑ 상행 계단'
                              : '시작·도착 층이 같습니다'}
                          {' · '}
                          {levelName(selected.level)} → {levelName(selected.toLevel ?? -1)}
                          {selected.rot ? ` · 회전 ${selected.rot}°` : ''}
                        </p>
                      </>
                    ) : (
                      <>
                        <Field label="설치 층">
                          <select className={SELECT_CLS} value={selected.level} onChange={(e) => patchEl(selected.id, { level: Number(e.target.value) })}>
                            {(symOpts.includes(selected.level) ? symOpts : [...symOpts, selected.level]).map((lv) => (
                              <option key={lv} value={lv}>{levelName(lv)}</option>
                            ))}
                          </select>
                        </Field>
                        {selected.type === 'beacon' && (
                          <p className="text-[11px] leading-relaxed text-muted">
                            소속 지오펜스:{' '}
                            {(() => {
                              const bf = elements.find(
                                (e): e is BGeofence =>
                                  e.kind === 'fence' &&
                                  (e.id === selected.fenceId || pointInShape(e, selected.x, selected.y)),
                              )
                              return bf ? bf.name : '없음 (샘플/레거시)'
                            })()}
                            <br />
                            비콘은 지오펜스 내부에서만 이동·배치할 수 있습니다.
                          </p>
                        )}
                        {selected.type === 'door' && (
                          <>
                            <Field label="출입구 폭">
                              <input
                                type="number"
                                className={INPUT_CLS}
                                value={selected.width ?? 12}
                                min={8}
                                max={60}
                                step={2}
                                onChange={(e) => {
                                  const v = Number(e.target.value)
                                  if (Number.isNaN(v)) return
                                  const nw = Math.max(8, Math.min(60, v))
                                  /* 폭 변경 후에도 벽 구간 안에 머물도록 재스냅 */
                                  const r = snapDoorToWall(
                                    elements,
                                    { width: nw, rot: selected.rot },
                                    selected.x,
                                    selected.y,
                                  )
                                  patchEl(selected.id, { width: nw, x: r.x, y: r.y, rot: r.rot })
                                }}
                              />
                            </Field>
                            <p className="text-[11px] leading-relaxed text-muted">
                              벽면 근처로 드래그하면 곡선 벽을 포함한 벽면에 자동 스냅되고 접선 방향으로 정렬됩니다.
                              {selected.rot ? ` (벽 방향 ${selected.rot}°)` : ''}
                            </p>
                          </>
                        )}
                      </>
                    )}
                    {symBld && (
                      <p className="text-[11px] leading-relaxed text-muted">
                        소속 건물: {symBld.name} — 층 선택지는 건물 층 구성(
                        {symBld.floorsUp > 0 ? `지상 ${symBld.floorsUp}층` : ''}
                        {symBld.floorsUp > 0 && symBld.floorsDown > 0 ? ' · ' : ''}
                        {symBld.floorsDown > 0 ? `지하 ${symBld.floorsDown}층` : ''}
                        )을 따릅니다.
                      </p>
                    )}
                  </div>
                  )
                })()}

                <button
                  onClick={deleteSelected}
                  className="mt-4 flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-[10px] border border-critical/35 bg-critical/10 text-sm font-semibold text-critical transition-colors hover:bg-critical/20"
                >
                  <Trash2 size={15} />
                  요소 삭제
                </button>
              </div>
            </div>
          )}
          {selected && !propsOpen && (
            <button
              onClick={() => setPropsOpen(true)}
              className="absolute right-3 top-3 z-20 flex h-9 cursor-pointer items-center gap-1.5 rounded-[10px] border border-hairline bg-surface-1/90 px-3 text-xs font-semibold text-ink-2 backdrop-blur transition-colors hover:bg-surface-2 hover:text-ink"
            >
              속성 열기
            </button>
          )}

          {/* ── 심볼 팔레트 — 하단 플로팅 패널 (슬라이드업) ── */}
          <div
            className={`absolute inset-x-0 bottom-3 z-10 flex justify-center transition-all duration-300 ease-out ${
              paletteOpen ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-10 opacity-0'
            }`}
          >
            <div className="w-[min(94%,920px)] rounded-2xl border border-hairline bg-surface-1/95 px-4 pb-3 pt-2.5 shadow-2xl backdrop-blur">
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-ink">심볼 팔레트</span>
                <span className="hidden text-[10px] text-muted lg:block">캔버스로 드래그하여 배치</span>
                <span className="ml-auto text-[10px] tabular-nums text-muted">
                  건물 {buildings.length} · 작업영역 {roomEls.length} · 지오펜스 {fences.length} · 공동구 {tunnels.length} · 심볼 {symbols.length}
                </span>
                <button
                  onClick={() => setPaletteOpen(false)}
                  className="flex size-6 cursor-pointer items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-ink"
                  aria-label="팔레트 내리기"
                  title="팔레트 내리기"
                >
                  <ChevronDown size={14} />
                </button>
              </div>
              {/* 가로 스크롤 없이 줄바꿈 — 패널이 세로로 늘어난다. 호버 리프트 여백 확보 */}
              <div className="mt-1 flex flex-wrap justify-center gap-2 px-1 pb-1.5 pt-2">
                {SYMBOL_DEFS.map((s) => (
                  <div
                    key={s.type}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData('text/symbol', s.type)}
                    title={`${s.label} — 캔버스로 드래그하여 배치`}
                    className="group flex w-[86px] shrink-0 cursor-grab flex-col items-center gap-1.5 rounded-xl border border-hairline bg-surface-2/40 px-2 pb-2 pt-2.5 transition-all duration-150 hover:-translate-y-0.5 hover:border-primary/50 hover:bg-surface-2 hover:shadow-md active:cursor-grabbing"
                  >
                    <span
                      className="flex size-9 items-center justify-center rounded-[10px] text-white shadow-sm transition-transform duration-150 group-hover:scale-110"
                      style={{ background: s.color }}
                    >
                      {SYMBOL_ICON[s.type]}
                    </span>
                    <p className="whitespace-nowrap text-[11px] font-medium leading-none text-ink">{s.label}</p>
                    <span className="rounded-full bg-page/70 px-1.5 py-0.5 font-mono text-[8px] leading-none text-muted">
                      {s.code}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          {!paletteOpen && (
            <button
              onClick={() => setPaletteOpen(true)}
              className="absolute bottom-3 left-1/2 z-10 flex h-8 -translate-x-1/2 cursor-pointer items-center gap-1.5 rounded-full border border-hairline bg-surface-1/90 px-3.5 text-xs font-semibold text-ink-2 shadow-lg backdrop-blur transition-colors hover:bg-surface-2 hover:text-ink"
            >
              <ChevronUp size={13} />
              심볼 팔레트
            </button>
          )}
        </div>

        {/* ── 3D 미리보기 ── */}
        {show3D && (
          <div className="relative w-[34%] min-w-[320px] shrink-0 border-l border-hairline">
            <Builder3D elements={elements} />
            <span className="pointer-events-none absolute top-3 left-3 rounded-[8px] border border-hairline bg-surface-1/85 px-2.5 py-1.5 text-[11px] text-muted backdrop-blur">
              3D 미리보기 — 드래그 회전 · 휠 줌
            </span>
          </div>
        )}
      </div>
    </div>
    </TooltipProvider>
  )
}
