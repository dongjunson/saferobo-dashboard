// 레거시 HamaH-Cloud 대시보드(ui/iot/dashboard/*)의 도메인을 그대로 옮긴 목업 데이터.
// 실제 연동 시 이 모듈만 API 클라이언트로 교체하면 된다.

export interface KpiSummary {
  totalIn: number
  totalOut: number
  remaining: number
  emergencies: number
  confinedWorkers: number
  riskWorks: number
}

export const kpiSummary: KpiSummary = {
  totalIn: 482,
  totalOut: 327,
  remaining: 155,
  emergencies: 3,
  confinedWorkers: 24,
  riskWorks: 7,
}

export interface HourlyFlow {
  hour: string
  in: number
  out: number
}

export const hourlyFlow: HourlyFlow[] = [
  { hour: '06시', in: 12, out: 0 },
  { hour: '07시', in: 96, out: 2 },
  { hour: '08시', in: 188, out: 5 },
  { hour: '09시', in: 64, out: 8 },
  { hour: '10시', in: 31, out: 14 },
  { hour: '11시', in: 18, out: 22 },
  { hour: '12시', in: 9, out: 87 },
  { hour: '13시', in: 41, out: 26 },
  { hour: '14시', in: 15, out: 19 },
  { hour: '15시', in: 6, out: 33 },
  { hour: '16시', in: 2, out: 58 },
  { hour: '17시', in: 0, out: 53 },
]

export interface ZoneAlert {
  zone: string
  gas: number
  heart: number
  sos: number
}

export const zoneAlerts: ZoneAlert[] = [
  { zone: 'A구역 (제1도크)', gas: 4, heart: 1, sos: 0 },
  { zone: 'B구역 (탱크동)', gas: 7, heart: 2, sos: 1 },
  { zone: 'C구역 (배관랙)', gas: 2, heart: 0, sos: 0 },
  { zone: 'D구역 (야드)', gas: 1, heart: 3, sos: 0 },
  { zone: 'E구역 (하역부두)', gas: 3, heart: 1, sos: 1 },
]

export interface TradeCount {
  trade: string
  count: number
}

export const tradeCounts: TradeCount[] = [
  { trade: '용접', count: 118 },
  { trade: '배관', count: 86 },
  { trade: '전기', count: 64 },
  { trade: '비계', count: 57 },
  { trade: '도장', count: 49 },
  { trade: '기타', count: 108 },
]

export const vendorCounts: TradeCount[] = [
  { trade: '대한중공업', count: 132 },
  { trade: '서해산업', count: 97 },
  { trade: '금강ENG', count: 81 },
  { trade: '남도기공', count: 66 },
  { trade: '기타 협력사', count: 106 },
]

export type Severity = 'critical' | 'serious' | 'warning' | 'good'

export interface EmergencyEvent {
  id: number
  time: string
  zone: string
  worker: string
  type: string
  severity: Severity
  status: '조치중' | '완료' | '미확인'
}

export const emergencyEvents: EmergencyEvent[] = [
  { id: 1, time: '14:52', zone: 'B구역 (탱크동)', worker: '김철수', type: 'SOS 호출', severity: 'critical', status: '조치중' },
  { id: 2, time: '14:31', zone: 'E구역 (하역부두)', worker: '박영호', type: '유해가스 (H2S 12ppm)', severity: 'critical', status: '조치중' },
  { id: 3, time: '13:47', zone: 'D구역 (야드)', worker: '이민재', type: '심박 이상 (142bpm)', severity: 'serious', status: '완료' },
  { id: 4, time: '11:20', zone: 'A구역 (제1도크)', worker: '최성훈', type: '유해가스 (CO 28ppm)', severity: 'serious', status: '완료' },
  { id: 5, time: '10:05', zone: 'B구역 (탱크동)', worker: '정우진', type: '장시간 미동작', severity: 'warning', status: '완료' },
]

export interface SensorStatus {
  id: string
  type: string
  zone: string
  battery: number
  state: '정상' | '배터리부족' | '통신불량' | '점검필요'
  lastSeen: string
}

export const sensors: SensorStatus[] = [
  { id: 'GW-0021', type: '게이트웨이', zone: 'A구역', battery: 100, state: '정상', lastSeen: '방금 전' },
  { id: 'BC-1174', type: '비콘', zone: 'B구역', battery: 18, state: '배터리부족', lastSeen: '2분 전' },
  { id: 'GS-0442', type: '가스센서', zone: 'B구역', battery: 64, state: '정상', lastSeen: '방금 전' },
  { id: 'BC-1201', type: '비콘', zone: 'C구역', battery: 9, state: '배터리부족', lastSeen: '11분 전' },
  { id: 'HB-0733', type: '심박밴드', zone: 'D구역', battery: 41, state: '정상', lastSeen: '1분 전' },
  { id: 'GW-0018', type: '게이트웨이', zone: 'E구역', battery: 100, state: '통신불량', lastSeen: '34분 전' },
  { id: 'GS-0455', type: '가스센서', zone: 'A구역', battery: 77, state: '정상', lastSeen: '방금 전' },
  { id: 'BC-1188', type: '비콘', zone: 'E구역', battery: 52, state: '점검필요', lastSeen: '8분 전' },
]

export interface ZoneOccupancy {
  zone: string
  workers: number
  capacity: number
  risk: boolean
}

export const zoneOccupancy: ZoneOccupancy[] = [
  { zone: 'A구역 (제1도크)', workers: 42, capacity: 60, risk: false },
  { zone: 'B구역 (탱크동)', workers: 31, capacity: 35, risk: true },
  { zone: 'C구역 (배관랙)', workers: 18, capacity: 40, risk: false },
  { zone: 'D구역 (야드)', workers: 37, capacity: 80, risk: false },
  { zone: 'E구역 (하역부두)', workers: 27, capacity: 30, risk: true },
]

export interface WeeklyAlert {
  day: string
  gas: number
  heart: number
  sos: number
}

export const weeklyAlerts: WeeklyAlert[] = [
  { day: '월', gas: 11, heart: 4, sos: 1 },
  { day: '화', gas: 8, heart: 6, sos: 0 },
  { day: '수', gas: 14, heart: 3, sos: 2 },
  { day: '목', gas: 9, heart: 7, sos: 1 },
  { day: '금', gas: 17, heart: 5, sos: 2 },
  { day: '토', gas: 6, heart: 2, sos: 0 },
  { day: '일', gas: 3, heart: 1, sos: 0 },
]

export interface Worker {
  id: number
  name: string
  vendor: string
  trade: string
  zone: string
  inTime: string
  heartRate: number | null
  status: '작업중' | '휴식' | '퇴실' | '위험'
}

export const workers: Worker[] = [
  { id: 1, name: '김철수', vendor: '대한중공업', trade: '용접', zone: 'B구역', inTime: '07:12', heartRate: 128, status: '위험' },
  { id: 2, name: '박영호', vendor: '서해산업', trade: '배관', zone: 'E구역', inTime: '07:03', heartRate: 96, status: '위험' },
  { id: 3, name: '이민재', vendor: '금강ENG', trade: '전기', zone: 'D구역', inTime: '07:45', heartRate: 88, status: '작업중' },
  { id: 4, name: '최성훈', vendor: '대한중공업', trade: '용접', zone: 'A구역', inTime: '06:58', heartRate: 74, status: '작업중' },
  { id: 5, name: '정우진', vendor: '남도기공', trade: '비계', zone: 'B구역', inTime: '07:31', heartRate: 81, status: '휴식' },
  { id: 6, name: '한지훈', vendor: '서해산업', trade: '도장', zone: 'C구역', inTime: '08:02', heartRate: 79, status: '작업중' },
  { id: 7, name: '오세영', vendor: '금강ENG', trade: '배관', zone: 'A구역', inTime: '07:19', heartRate: null, status: '퇴실' },
  { id: 8, name: '임동혁', vendor: '대한중공업', trade: '전기', zone: 'D구역', inTime: '07:55', heartRate: 92, status: '작업중' },
  { id: 9, name: '송재광', vendor: '남도기공', trade: '비계', zone: 'E구역', inTime: '07:40', heartRate: 85, status: '작업중' },
  { id: 10, name: '유현석', vendor: '서해산업', trade: '용접', zone: 'B구역', inTime: '06:49', heartRate: null, status: '퇴실' },
]

export interface SiteWeather {
  temp: number
  humidity: number
  windSpeed: number
  windDir: string
  rainProb: number
  condition: string
}

export const siteWeather: SiteWeather = {
  temp: 29,
  humidity: 68,
  windSpeed: 4.2,
  windDir: '남서',
  rainProb: 30,
  condition: '구름 조금',
}

export interface AlertLog {
  id: number
  time: string
  category: '가스' | '심박' | 'SOS' | '센서' | '출입'
  message: string
  zone: string
  severity: Severity
}

export const alertLogs: AlertLog[] = [
  { id: 1, time: '14:52:07', category: 'SOS', message: 'SOS 버튼 호출 — 김철수 (대한중공업)', zone: 'B구역', severity: 'critical' },
  { id: 2, time: '14:31:44', category: '가스', message: 'H2S 12ppm 임계치 초과', zone: 'E구역', severity: 'critical' },
  { id: 3, time: '14:18:29', category: '출입', message: '위험지역 무단 진입 감지', zone: 'B구역', severity: 'serious' },
  { id: 4, time: '13:47:10', category: '심박', message: '심박 142bpm 이상 감지 — 이민재', zone: 'D구역', severity: 'serious' },
  { id: 5, time: '13:22:51', category: '센서', message: '비콘 BC-1201 배터리 9%', zone: 'C구역', severity: 'warning' },
  { id: 6, time: '12:58:33', category: '가스', message: 'CO 농도 상승 추세 (18ppm)', zone: 'A구역', severity: 'warning' },
  { id: 7, time: '12:40:02', category: '센서', message: '게이트웨이 GW-0018 통신 불량', zone: 'E구역', severity: 'warning' },
  { id: 8, time: '11:20:15', category: '가스', message: 'CO 28ppm 임계치 초과', zone: 'A구역', severity: 'serious' },
]
