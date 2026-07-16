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
  name: '경기도 군포 하수도 사업소',
  weather: { condition: '흐림', temp: 31.3, feel: 32.6, wind: 2.1, humidity: 70, pm10: 12, pm25: 8 },
}

/* ── 층(레벨) 정의 — 지상층 / 지하 1층 / 지하 2층 ──────────────────
 * 2D는 층 선택 뷰, 2.5D는 여러 층의 2D 평면을 하나의 스택으로 표현한다. */
export type FloorId = 'F1' | 'B1' | 'B2'

export const floorDefs: Array<{ id: FloorId; name: string; short: string }> = [
  { id: 'F1', name: '지상층', short: '지상' },
  { id: 'B1', name: '지하 1층', short: '지하1' },
  { id: 'B2', name: '지하 2층', short: '지하2' },
]

/* ── 지도: 구역(폴리곤)·게이트웨이·고정형 비콘 ────────────────────── */
export interface Zone {
  id: string
  name: string
  points: string // SVG polygon points
  labelX: number
  labelY: number
  /** 건물이 존재하는 층 — 지상만/지하만/복합을 구분 */
  floors: FloorId[]
}

export const siteBoundary =
  '40,240 300,60 640,40 950,120 970,420 760,600 340,610 60,480'

export const zones: Zone[] = [
  { id: 'Z1', name: '하수유입동', points: '120,220 280,220 280,320 120,320', labelX: 200, labelY: 274, floors: ['F1', 'B1', 'B2'] },
  { id: 'Z2', name: '탈수기동', points: '330,140 470,140 470,230 330,230', labelX: 400, labelY: 189, floors: ['F1'] },
  { id: 'Z3', name: '축산전처리동', points: '130,370 320,370 320,480 130,480', labelX: 225, labelY: 429, floors: ['F1', 'B1'] },
  { id: 'Z4', name: '관리동', points: '420,300 580,300 580,400 420,400', labelX: 500, labelY: 354, floors: ['F1'] },
  { id: 'Z5', name: '금수동', points: '650,180 790,180 790,270 650,270', labelX: 720, labelY: 229, floors: ['F1'] },
  { id: 'Z6', name: '실험동', points: '440,460 570,460 570,545 440,545', labelX: 505, labelY: 507, floors: ['B1'] },
  { id: 'Z7', name: '전기실', points: '660,400 780,400 780,470 660,470', labelX: 720, labelY: 439, floors: ['F1', 'B1'] },
  { id: 'Z8', name: '소화조동', points: '820,190 935,190 935,290 820,290', labelX: 877, labelY: 244, floors: ['F1', 'B1'] },
  { id: 'Z9', name: '약품투입동', points: '830,340 940,340 940,410 830,410', labelX: 885, labelY: 379, floors: ['F1'] },
  { id: 'Z10', name: '슬러지건조동', points: '600,480 730,480 730,560 600,560', labelX: 665, labelY: 524, floors: ['F1'] },
]

export interface MapPoint {
  id: string
  x: number
  y: number
  zone: string
  /** 설치 층 — 생략 시 지상층(F1) */
  level?: FloorId
}

/* ── 지하 공동구(유틸리티 터널) — 주요 동을 잇는 지하 코리도 ──────────
 * path는 지도 좌표 폴리라인. 출입구는 각 동 접속부의 수직구/계단실. */
export interface TunnelSegment {
  id: string
  name: string
  path: Array<[number, number]>
  /** 공동구가 지나는 층 (B1/B2) */
  level: FloorId
}

export const utilityTunnels: TunnelSegment[] = [
  { id: 'UT-A', name: '공동구 A라인 · 하수유입동—관리동', level: 'B1', path: [[280, 300], [405, 300], [405, 352], [420, 352]] },
  { id: 'UT-B', name: '공동구 B라인 · 탈수기동 연결', level: 'B1', path: [[405, 300], [405, 232]] },
  { id: 'UT-C', name: '공동구 C라인 · 축산전처리동 연결', level: 'B1', path: [[405, 352], [405, 435], [322, 435]] },
  { id: 'UT-C2', name: '공동구 C라인 지선 · 실험동 연결', level: 'B1', path: [[405, 435], [405, 505], [438, 505]] },
  { id: 'UT-D', name: '공동구 D라인 · 관리동—전기실', level: 'B1', path: [[580, 352], [660, 352], [660, 435]] },
  { id: 'UT-E', name: '공동구 E라인 · 약품투입동—소화조동', level: 'B2', path: [[660, 352], [830, 352], [830, 292]] },
]

/* ── 계단실 — 건물별 상하 이동 코어. 한 건물에 여러 개소 가능하며,
 * 계단이 설치된 일부 건물에만 존재한다. toLevel은 연결되는 최하층. ── */
export interface Stairwell {
  id: string
  zone: string
  x: number
  y: number
  toLevel: FloorId
}

export const stairwells: Stairwell[] = [
  { id: 'ST-01', zone: '하수유입동', x: 142, y: 296, toLevel: 'B2' },
  { id: 'ST-02', zone: '하수유입동', x: 232, y: 236, toLevel: 'B2' },
  { id: 'ST-03', zone: '축산전처리동', x: 298, y: 392, toLevel: 'B1' },
  { id: 'ST-04', zone: '전기실', x: 752, y: 446, toLevel: 'B1' },
  { id: 'ST-05', zone: '실험동', x: 538, y: 478, toLevel: 'B1' },
]

/** 공동구 출입구(수직구·계단실) — level은 수직구가 닿는 공동구 층 */
export const tunnelEntrances: MapPoint[] = [
  { id: 'ENT-01', x: 280, y: 300, zone: '하수유입동', level: 'B1' },
  { id: 'ENT-02', x: 405, y: 232, zone: '탈수기동', level: 'B1' },
  { id: 'ENT-03', x: 420, y: 352, zone: '관리동', level: 'B1' },
  { id: 'ENT-04', x: 322, y: 435, zone: '축산전처리동', level: 'B1' },
  { id: 'ENT-05', x: 438, y: 505, zone: '실험동', level: 'B1' },
  { id: 'ENT-06', x: 660, y: 435, zone: '전기실', level: 'B1' },
  { id: 'ENT-07', x: 830, y: 352, zone: '약품투입동', level: 'B2' },
  { id: 'ENT-08', x: 830, y: 292, zone: '소화조동', level: 'B2' },
]

export const gateways: MapPoint[] = [
  { id: 'GW-0021', x: 132, y: 232, zone: '하수유입동' },
  { id: 'GW-0018', x: 458, y: 152, zone: '탈수기동' },
  { id: 'GW-0034', x: 308, y: 468, zone: '축산전처리동' },
  { id: 'GW-0022', x: 568, y: 312, zone: '관리동' },
  { id: 'GW-0027', x: 778, y: 192, zone: '금수동' },
  { id: 'GW-0031', x: 672, y: 458, zone: '전기실' },
  { id: 'GW-0042', x: 928, y: 202, zone: '소화조동' },
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
  { id: 'BC-1201', x: 465, y: 480, zone: '실험동', level: 'B1' },
  { id: 'BC-1202', x: 545, y: 525, zone: '실험동', level: 'B1' },
  { id: 'BC-1221', x: 700, y: 420, zone: '전기실' },
  { id: 'BC-1241', x: 850, y: 215, zone: '소화조동' },
  { id: 'BC-1242', x: 915, y: 270, zone: '소화조동' },
  { id: 'BC-1261', x: 855, y: 365, zone: '약품투입동' },
  { id: 'BC-1262', x: 925, y: 395, zone: '약품투입동' },
  { id: 'BC-1281', x: 620, y: 500, zone: '슬러지건조동' },
  { id: 'BC-1282', x: 705, y: 540, zone: '슬러지건조동' },
  /* 지하 공동구 내부 비콘 — 라인별 위치 추적용 */
  { id: 'BC-1301', x: 345, y: 300, zone: '공동구 A라인', level: 'B1' },
  { id: 'BC-1302', x: 405, y: 262, zone: '공동구 B라인', level: 'B1' },
  { id: 'BC-1303', x: 405, y: 400, zone: '공동구 C라인', level: 'B1' },
  { id: 'BC-1304', x: 360, y: 435, zone: '공동구 C라인', level: 'B1' },
  { id: 'BC-1305', x: 405, y: 478, zone: '공동구 C라인', level: 'B1' },
  { id: 'BC-1306', x: 620, y: 352, zone: '공동구 D라인', level: 'B1' },
  { id: 'BC-1307', x: 660, y: 395, zone: '공동구 D라인', level: 'B1' },
  { id: 'BC-1308', x: 745, y: 352, zone: '공동구 E라인', level: 'B2' },
  { id: 'BC-1309', x: 830, y: 320, zone: '공동구 E라인', level: 'B2' },
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
  { id: 4, name: '최성훈', vendor: '대한중공업', space: '지하층', zone: '축산전처리동', inTime: '06:58', outTime: null, heartRate: 74, skinTemp: 31.9, danger: false, path: [[165, 395], [290, 455], [225, 425]], speed: 9, offset: 10 },
  { id: 5, name: '정우진', vendor: '남도기공', space: '지상층', zone: '금수동', inTime: '07:31', outTime: null, heartRate: 81, skinTemp: 32.4, danger: false, path: [[675, 200], [765, 250], [720, 225]], speed: 6, offset: 60 },
  { id: 6, name: '한지훈', vendor: '서해산업', space: '지하층', zone: '실험동', inTime: '08:02', outTime: null, heartRate: 79, skinTemp: 32.0, danger: false, path: [[465, 480], [545, 525], [505, 500]], speed: 5, offset: 25 },
  { id: 7, name: '임동혁', vendor: '대한중공업', space: '지상층', zone: '전기실', inTime: '07:55', outTime: null, heartRate: 92, skinTemp: 33.4, danger: false, path: [[700, 420], [760, 445], [680, 450]], speed: 6, offset: 35 },
  { id: 8, name: '오세영', vendor: '금강ENG', space: '지상층', zone: '관리동', inTime: '07:19', outTime: '16:40', heartRate: 0, skinTemp: 0, danger: false, path: [[520, 330]], speed: 0, offset: 0 },
]

/** 작업 공간 문자열 → 층 (지도 레이어링용) */
export function workerFloor(w: LiveWorker): FloorId {
  return w.space === '지하 2층' ? 'B2' : w.space === '지하층' ? 'B1' : 'F1'
}

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

/* ── 고정형 가스검침기 (5종 복합가스: O₂ · H₂S · CO · NH₃ · CH₄) ───
 * 구역(비콘 기반 작업 구역)에 설치되어 지도에 표시된다. */
export interface GasReading {
  o2: number
  h2s: number
  co: number
  nh3: number
  ch4: number
}

export interface GasDetector extends GasReading {
  id: string
  name: string
  x: number
  y: number
  zone: string
}

/** 수집 항목 정의 — 스파크라인 범위(min/max)·시뮬레이션 흔들림(jitter) 포함 */
export const gasMetrics = [
  { key: 'o2', label: 'O₂', unit: '%', color: '#22d3ee', min: 18, max: 23, jitter: 0.5 },
  { key: 'h2s', label: 'H₂S', unit: 'PPM', color: '#a78bfa', min: 0, max: 4, jitter: 0.6 },
  { key: 'co', label: 'CO', unit: 'PPM', color: '#fbbf24', min: 0, max: 5, jitter: 1.2 },
  { key: 'nh3', label: 'NH₃', unit: 'PPM', color: '#34d399', min: 0, max: 15, jitter: 1.0 },
  { key: 'ch4', label: 'CH₄', unit: '%LEL', color: '#fb7185', min: 0, max: 10, jitter: 0.8 },
] as const
export type GasMetricKey = (typeof gasMetrics)[number]['key']

export const gasDetectors: GasDetector[] = [
  { id: 'GAS-01', name: '하수유입동 01 고정가스검침기', x: 265, y: 237, zone: '하수유입동', o2: 20.8, h2s: 0.0, co: 1.2, nh3: 3.5, ch4: 2.1 },
  { id: 'GAS-02', name: '탈수기동 02 고정가스검침기', x: 345, y: 215, zone: '탈수기동', o2: 21.0, h2s: 0.0, co: 0.8, nh3: 5.2, ch4: 1.4 },
  { id: 'GAS-03', name: '축산전처리동 03 고정가스검침기', x: 255, y: 385, zone: '축산전처리동', o2: 21.0, h2s: 0.2, co: 1.5, nh3: 8.4, ch4: 3.2 },
  { id: 'GAS-04', name: '소화조동 04 고정가스검침기', x: 880, y: 230, zone: '소화조동', o2: 20.9, h2s: 0.1, co: 0.6, nh3: 2.1, ch4: 6.8 },
  { id: 'GAS-05', name: '약품투입동 05 고정가스검침기', x: 890, y: 355, zone: '약품투입동', o2: 21.2, h2s: 0.3, co: 0.4, nh3: 1.2, ch4: 0.5 },
  { id: 'GAS-06', name: '슬러지건조동 06 고정가스검침기', x: 668, y: 498, zone: '슬러지건조동', o2: 20.6, h2s: 1.6, co: 2.2, nh3: 12.5, ch4: 4.6 },
]

/* ── 이동형 가스검침기 — 작업자가 휴대, 이동하며 구역 환경 데이터 취합 ── */
export interface PortableGasDetector extends GasReading {
  id: string
  workerId: number
}

export const portableGasDetectors: PortableGasDetector[] = [
  { id: 'PGAS-01', workerId: 1, o2: 20.9, h2s: 0.2, co: 21.5, nh3: 4.1, ch4: 3.8 },
  { id: 'PGAS-02', workerId: 2, o2: 20.8, h2s: 0.4, co: 1.8, nh3: 6.2, ch4: 1.1 },
  { id: 'PGAS-03', workerId: 4, o2: 19.2, h2s: 2.4, co: 8.5, nh3: 18.2, ch4: 5.4 },
  { id: 'PGAS-04', workerId: 6, o2: 21.1, h2s: 0.1, co: 0.9, nh3: 1.8, ch4: 0.7 },
  { id: 'PGAS-05', workerId: 7, o2: 20.9, h2s: 0.0, co: 1.1, nh3: 0.9, ch4: 0.4 },
]

/* ── 가스 농도 판정 기준
 * O₂ 정상범위 19.5~23.5% / H₂S 1·2ppm / CO 20·30ppm / NH₃ 25·35ppm / CH₄ 10·20%LEL */
export type GasLevel = 'good' | 'warning' | 'critical'

export function gasSeverity(cur: GasReading): GasLevel {
  if (cur.o2 < 19.5 || cur.o2 > 23.5 || cur.h2s >= 2 || cur.co >= 30 || cur.nh3 >= 35 || cur.ch4 >= 20)
    return 'critical'
  if (cur.h2s >= 1 || cur.co >= 20 || cur.nh3 >= 25 || cur.ch4 >= 10) return 'warning'
  return 'good'
}

/** 판정을 유발한 항목(가장 심한 것) — 정상이면 null */
export function gasDriver(cur: GasReading): { label: string; unit: string; value: number } | null {
  const level = gasSeverity(cur)
  if (level === 'good') return null
  const checks: Array<[GasMetricKey, boolean, boolean]> = [
    ['o2', cur.o2 < 19.5 || cur.o2 > 23.5, false],
    ['h2s', cur.h2s >= 2, cur.h2s >= 1],
    ['co', cur.co >= 30, cur.co >= 20],
    ['nh3', cur.nh3 >= 35, cur.nh3 >= 25],
    ['ch4', cur.ch4 >= 20, cur.ch4 >= 10],
  ]
  const hit = checks.find(([, crit, warn]) => (level === 'critical' ? crit : warn))
  if (!hit) return null
  const m = gasMetrics.find((g) => g.key === hit[0])!
  return { label: m.label, unit: m.unit, value: cur[hit[0]] }
}

/* ── 구역별 위험도 평가 — 비콘 기반 작업 구역에 매핑된
 * 고정형 검침기 + (구역 내 작업자가 휴대한) 이동형 검침기 데이터로 판정 ── */
export interface ZoneRisk {
  zone: string
  level: GasLevel
  /** 판정 근거 — 예: 'H₂S 2.4 PPM · 이동형 PGAS-03(최성훈)' */
  cause: string | null
  fixedCount: number
  portableCount: number
  workerCount: number
}

const LEVEL_ORDER: Record<GasLevel, number> = { critical: 0, warning: 1, good: 2 }

export function assessZoneRisks(): ZoneRisk[] {
  return zones
    .map((z) => {
      const sources: Array<{ label: string; cur: GasReading }> = []
      const fixed = gasDetectors.filter((g) => g.zone === z.name)
      fixed.forEach((g) => sources.push({ label: `고정형 ${g.id}`, cur: g }))
      const inZone = liveWorkers.filter((w) => w.outTime === null && w.zone === z.name)
      const portables = portableGasDetectors.filter((p) =>
        inZone.some((w) => w.id === p.workerId),
      )
      portables.forEach((p) => {
        const w = liveWorkers.find((lw) => lw.id === p.workerId)!
        sources.push({ label: `이동형 ${p.id}(${w.name})`, cur: p })
      })

      let level: GasLevel = 'good'
      let cause: string | null = null
      for (const s of sources) {
        const lv = gasSeverity(s.cur)
        if (LEVEL_ORDER[lv] < LEVEL_ORDER[level]) {
          level = lv
          const d = gasDriver(s.cur)
          cause = d ? `${d.label} ${d.value.toFixed(1)} ${d.unit} · ${s.label}` : null
        }
      }
      return {
        zone: z.name,
        level,
        cause,
        fixedCount: fixed.length,
        portableCount: portables.length,
        workerCount: inZone.length,
      }
    })
    .sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level])
}

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
  space: b.level === 'B2' ? '지하 2층' : b.level === 'B1' ? '지하층' : '지상층',
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
