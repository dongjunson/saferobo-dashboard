// 통합 관제 상황판(레거시 es-main-dashboard-new.html) 도메인의 목업 데이터.
// GIS 지도는 1000×640 SVG 좌표계를 사용한다. 실제 연동 시 GeoJSON/비콘 좌표로 교체.

/* ── 현장 KPI (위급 상황 / 위험 작업 / 전체 작업자 현황) ─────────── */
export const controlKpi = {
  heartAlarm: 1,
  gasAlarm: 2,
  sosAlarm: 0,
  riskWork: 7,
  confined: 24,
  remain: 155,
  totalIn: 482,
  totalOut: 327,
}

export const siteInfo = {
  name: '여수 LNG 3부두 현장',
  weather: { condition: '흐림', temp: 31.3, feel: 32.6, wind: 2.1, humidity: 70, pm10: 12, pm25: 8 },
}

/* ── 지도: 구역(폴리곤)·게이트웨이·고정형 비콘 ────────────────────── */
export interface Zone {
  id: string
  name: string
  points: string // SVG polygon points
  labelX: number
  labelY: number
}

export const siteBoundary =
  '40,240 300,60 640,40 950,120 970,420 760,600 340,610 60,480'

export const zones: Zone[] = [
  { id: 'Z1', name: '하수유입동', points: '120,220 280,220 280,320 120,320', labelX: 200, labelY: 274 },
  { id: 'Z2', name: '탈수기동', points: '330,140 470,140 470,230 330,230', labelX: 400, labelY: 189 },
  { id: 'Z3', name: '축산전처리동', points: '130,370 320,370 320,480 130,480', labelX: 225, labelY: 429 },
  { id: 'Z4', name: '관리동', points: '420,300 580,300 580,400 420,400', labelX: 500, labelY: 354 },
  { id: 'Z5', name: '금수동', points: '650,180 790,180 790,270 650,270', labelX: 720, labelY: 229 },
  { id: 'Z6', name: '실험동', points: '440,460 570,460 570,545 440,545', labelX: 505, labelY: 507 },
  { id: 'Z7', name: '전기실', points: '660,400 780,400 780,470 660,470', labelX: 720, labelY: 439 },
]

export interface MapPoint {
  id: string
  x: number
  y: number
  zone: string
}

export const gateways: MapPoint[] = [
  { id: 'GW-0021', x: 132, y: 232, zone: '하수유입동' },
  { id: 'GW-0018', x: 458, y: 152, zone: '탈수기동' },
  { id: 'GW-0034', x: 308, y: 468, zone: '축산전처리동' },
  { id: 'GW-0022', x: 568, y: 312, zone: '관리동' },
  { id: 'GW-0027', x: 778, y: 192, zone: '금수동' },
  { id: 'GW-0031', x: 672, y: 458, zone: '전기실' },
]

export const mapBeacons: MapPoint[] = [
  { id: 'BC-1101', x: 160, y: 250, zone: '하수유입동' },
  { id: 'BC-1102', x: 250, y: 300, zone: '하수유입동' },
  { id: 'BC-1121', x: 360, y: 165, zone: '탈수기동' },
  { id: 'BC-1122', x: 440, y: 210, zone: '탈수기동' },
  { id: 'BC-1141', x: 165, y: 395, zone: '축산전처리동' },
  { id: 'BC-1142', x: 290, y: 455, zone: '축산전처리동' },
  { id: 'BC-1143', x: 225, y: 425, zone: '축산전처리동' },
  { id: 'BC-1161', x: 445, y: 320, zone: '관리동' },
  { id: 'BC-1162', x: 555, y: 380, zone: '관리동' },
  { id: 'BC-1181', x: 675, y: 200, zone: '금수동' },
  { id: 'BC-1182', x: 765, y: 250, zone: '금수동' },
  { id: 'BC-1201', x: 465, y: 480, zone: '실험동' },
  { id: 'BC-1202', x: 545, y: 525, zone: '실험동' },
  { id: 'BC-1221', x: 700, y: 420, zone: '전기실' },
]

/* ── 작업자 실시간 위치: 비콘 웨이포인트를 따라 이동 ─────────────── */
export interface LiveWorker {
  id: number
  name: string
  vendor: string
  space: string // 작업 공간
  zone: string // 작업 구역
  inTime: string
  outTime: string | null
  heartRate: number
  skinTemp: number
  danger: boolean
  dangerType?: string
  /** 이동 경로 웨이포인트 (지도 좌표) */
  path: Array<[number, number]>
  /** 초당 이동 거리(px) */
  speed: number
  /** 경로 시작 오프셋(px) */
  offset: number
}

export const liveWorkers: LiveWorker[] = [
  { id: 1, name: '김철수', vendor: '대한중공업', space: '지상층', zone: '탈수기동', inTime: '07:12', outTime: null, heartRate: 128, skinTemp: 34.2, danger: true, dangerType: '심박 위험', path: [[360, 165], [440, 210], [400, 185]], speed: 6, offset: 0 },
  { id: 2, name: '박영호', vendor: '서해산업', space: '지상층', zone: '하수유입동', inTime: '07:03', outTime: null, heartRate: 96, skinTemp: 33.1, danger: false, path: [[160, 250], [250, 300], [200, 280], [140, 265]], speed: 8, offset: 40 },
  { id: 3, name: '이민재', vendor: '금강ENG', space: '지상층', zone: '관리동', inTime: '07:45', outTime: null, heartRate: 88, skinTemp: 32.8, danger: false, path: [[445, 320], [555, 380], [500, 350]], speed: 7, offset: 90 },
  { id: 4, name: '최성훈', vendor: '대한중공업', space: '지상층', zone: '축산전처리동', inTime: '06:58', outTime: null, heartRate: 74, skinTemp: 31.9, danger: false, path: [[165, 395], [290, 455], [225, 425]], speed: 9, offset: 10 },
  { id: 5, name: '정우진', vendor: '남도기공', space: '지상층', zone: '금수동', inTime: '07:31', outTime: null, heartRate: 81, skinTemp: 32.4, danger: false, path: [[675, 200], [765, 250], [720, 225]], speed: 6, offset: 60 },
  { id: 6, name: '한지훈', vendor: '서해산업', space: '지하층', zone: '실험동', inTime: '08:02', outTime: null, heartRate: 79, skinTemp: 32.0, danger: false, path: [[465, 480], [545, 525], [505, 500]], speed: 5, offset: 25 },
  { id: 7, name: '임동혁', vendor: '대한중공업', space: '지상층', zone: '전기실', inTime: '07:55', outTime: null, heartRate: 92, skinTemp: 33.4, danger: false, path: [[700, 420], [760, 445], [680, 450]], speed: 6, offset: 35 },
  { id: 8, name: '오세영', vendor: '금강ENG', space: '지상층', zone: '관리동', inTime: '07:19', outTime: '16:40', heartRate: 0, skinTemp: 0, danger: false, path: [[520, 330]], speed: 0, offset: 0 },
]

/** tick(초) 기준 작업자의 현재 지도 좌표 계산 — 웨이포인트 선형 보간 순환 */
export function workerPosition(w: LiveWorker, tick: number): [number, number] {
  if (w.path.length < 2 || w.speed === 0) return w.path[0]
  const pts = [...w.path, w.path[0]] // 순환 경로
  const segLens = pts.slice(0, -1).map((p, i) => Math.hypot(pts[i + 1][0] - p[0], pts[i + 1][1] - p[1]))
  const total = segLens.reduce((a, b) => a + b, 0)
  let d = (tick * w.speed + w.offset) % total
  for (let i = 0; i < segLens.length; i++) {
    if (d <= segLens[i]) {
      const t = segLens[i] === 0 ? 0 : d / segLens[i]
      return [
        pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t,
        pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t,
      ]
    }
    d -= segLens[i]
  }
  return w.path[0]
}

/* ── 고정가스검침기 (O₂ % / H₂S PPM) ─────────────────────────────── */
export interface GasDetector {
  id: string
  name: string
  o2: number
  h2s: number
}

export const gasDetectors: GasDetector[] = [
  { id: 'GAS-01', name: '하수유입동 01 고정가스검침기', o2: 20.8, h2s: 0.0 },
  { id: 'GAS-02', name: '탈수기동 02 고정가스검침기', o2: 21.0, h2s: 0.0 },
  { id: 'GAS-03', name: '축산전처리동 03 고정가스검침기', o2: 21.0, h2s: 0.2 },
]

/** 초기 스파크라인 히스토리 생성 */
export function genGasHistory(base: number, jitter: number, n = 60): number[] {
  const out: number[] = []
  let v = base
  for (let i = 0; i < n; i++) {
    v = base + (Math.random() - 0.5) * jitter
    out.push(Math.max(0, +v.toFixed(2)))
  }
  return out
}

/* ── 작업 목록 ────────────────────────────────────────────────────── */
export interface WorkItem {
  name: string
  risk: '상' | '중' | '하'
  type: string
  space: string
  zone: string
  workers: string
  planDt: string
  startDt: string
  status: '작업중' | '작업대기' | '완료'
}

export const workItems: WorkItem[] = [
  { name: '탈수기 배관 용접', risk: '상', type: '화기', space: '지상층', zone: '탈수기동', workers: '김철수 외 2', planDt: '07-14 08:00', startDt: '07-14 08:12', status: '작업중' },
  { name: '유입 펌프 정비', risk: '중', type: '일반', space: '지상층', zone: '하수유입동', workers: '박영호 외 1', planDt: '07-14 09:00', startDt: '07-14 09:05', status: '작업중' },
  { name: '전처리조 내부 점검', risk: '상', type: '밀폐', space: '지하층', zone: '축산전처리동', workers: '최성훈 외 3', planDt: '07-14 10:00', startDt: '07-14 10:20', status: '작업중' },
  { name: '수배전반 점검', risk: '중', type: '전기', space: '지상층', zone: '전기실', workers: '임동혁', planDt: '07-14 13:00', startDt: '-', status: '작업대기' },
  { name: '실험동 배기 덕트 교체', risk: '하', type: '일반', space: '지하층', zone: '실험동', workers: '한지훈 외 1', planDt: '07-14 08:30', startDt: '07-14 08:40', status: '완료' },
]

/* ── 고정형 비콘 / 트래커 목록 ────────────────────────────────────── */
export interface BeaconRow {
  name: string
  major: number
  minor: number
  space: string
  zone: string
  use: boolean
  scanDt: string
}

export const beaconRows: BeaconRow[] = mapBeacons.map((b, i) => ({
  name: b.id,
  major: 100 + Math.floor(i / 4),
  minor: 1000 + i,
  space: b.zone === '실험동' ? '지하층' : '지상층',
  zone: b.zone,
  use: true,
  scanDt: '2026.07.14 (13:4' + (i % 10) + ')',
}))

export interface TrackerRow {
  name: string
  worker: string
  sos: boolean
  battery: number
  use: boolean
  lastDt: string
}

export const trackerRows: TrackerRow[] = [
  { name: 'TR-0101', worker: '김철수', sos: false, battery: 82, use: true, lastDt: '2026.07.14 (13:45)' },
  { name: 'TR-0102', worker: '박영호', sos: false, battery: 64, use: true, lastDt: '2026.07.14 (13:45)' },
  { name: 'TR-0103', worker: '이민재', sos: false, battery: 91, use: true, lastDt: '2026.07.14 (13:44)' },
  { name: 'TR-0104', worker: '최성훈', sos: false, battery: 47, use: true, lastDt: '2026.07.14 (13:45)' },
  { name: 'TR-0105', worker: '정우진', sos: false, battery: 18, use: true, lastDt: '2026.07.14 (13:41)' },
  { name: 'TR-0106', worker: '한지훈', sos: false, battery: 73, use: true, lastDt: '2026.07.14 (13:45)' },
]

/* ── 위급 상황 현황 (하단 패널) ───────────────────────────────────── */
export interface EmergencyRow {
  worker: string
  area: string
  type: string
  time: string
  action: '완료' | '조치중'
}

export const emergencyRows: EmergencyRow[] = [
  { worker: '축산반입동 04 고정가스검침기', area: '지상층/1F 축산전처리동', type: '가스 위험', time: '07-14 (08:13)', action: '완료' },
  { worker: '축산반입동 04 고정가스검침기', area: '지상층/1F 축산전처리동', type: '가스 위험', time: '07-14 (08:17)', action: '완료' },
  { worker: '김철수', area: '지상층/탈수기동', type: '심박 위험', time: '07-14 (08:48)', action: '조치중' },
  { worker: '축산전처리동 03 고정가스검침기', area: '지상층/1F 축산전처리동', type: '가스 위험', time: '07-14 (09:02)', action: '완료' },
  { worker: '축산반입동 04 고정가스검침기', area: '지상층/1F 축산전처리동', type: '가스 위험', time: '07-14 (09:28)', action: '완료' },
  { worker: '축산반입동 04 고정가스검침기', area: '지상층/1F 축산전처리동', type: '가스 위험', time: '07-14 (10:13)', action: '완료' },
]

/* ── 구역별 알림 현황 (도넛) ──────────────────────────────────────── */
export const zoneAlarmStats = [
  { zone: '축산전처리동', count: 11 },
  { zone: '탈수기동', count: 4 },
  { zone: '하수유입동', count: 3 },
  { zone: '전기실', count: 2 },
]
