import * as THREE from 'three'
import type { FloorId } from '../data/site'
import { M_PER_UNIT } from './TileLayer'

/* Site3D·Builder3D 공용 three.js 헬퍼 — 지도 좌표(x 0-1000, y 0-640)를
 * three 좌표(X=x, Z=y, Y=고도)로 매핑하는 규약을 공유한다. */

export const FLOOR_H = 25 // 층고 (시각화용 과장 스케일)
export const LEVEL_Y: Record<FloorId, number> = { F1: 0, B1: -FLOOR_H, B2: -FLOOR_H * 2 }

/** 고정형 가스검침기 커버리지 반경 (실측 m) */
export const GAS_COVERAGE_M = 15
/** 커버리지 반경 — 지도 단위 환산 (1 unit = 1.25 m → 12 unit) */
export const GAS_COVERAGE_UNITS = GAS_COVERAGE_M / M_PER_UNIT

export function parsePts(points: string): Array<[number, number]> {
  return points
    .trim()
    .split(/\s+/)
    .map((p) => p.split(',').map(Number) as [number, number])
}

export function cssColor(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v.startsWith('#') ? v : fallback
}

/* ── 장비 3D 모델 팩토리 — Site3D(대시보드)·Builder3D(맵 빌더)가 공유해
 * 양쪽 렌더링이 항상 동일하게 유지된다. ── */

/** 비콘 — 벽부착형 원형 퍽 + 반투명 돔 (설치 y는 바닥+1.4) */
export function beaconModel(): THREE.Group {
  const grp = new THREE.Group()
  const puck = new THREE.Mesh(
    new THREE.CylinderGeometry(2.3, 2.7, 1.1, 14),
    new THREE.MeshStandardMaterial({ color: '#8b5cf6', roughness: 0.5 }),
  )
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(1.6, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: '#c4b5fd', roughness: 0.3, transparent: true, opacity: 0.85 }),
  )
  dome.position.y = 0.55
  grp.add(puck, dome)
  return grp
}

/** 게이트웨이 — 함체 + 안테나 2본 */
export function gatewayModel(): THREE.Group {
  const grp = new THREE.Group()
  const antMat = new THREE.MeshStandardMaterial({ color: '#cbd5e1', roughness: 0.4 })
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(4.2, 5, 2.2),
    new THREE.MeshStandardMaterial({ color: '#3b82f6', roughness: 0.55 }),
  )
  body.position.y = 2.5
  grp.add(body)
  for (const ax of [-1.2, 1.2]) {
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 5.5, 6), antMat)
    ant.position.set(ax, 7.5, 0)
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.55, 8, 6), antMat)
    tip.position.set(ax, 10.3, 0)
    grp.add(ant, tip)
  }
  return grp
}

/** 고정형 가스검침기 — 함체(판정 등급 색) + 하부 센서 헤드 */
export function gasDetectorModel(color: string): THREE.Group {
  const grp = new THREE.Group()
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(3.4, 4.4, 2),
    new THREE.MeshStandardMaterial({ color, roughness: 0.5 }),
  )
  body.position.y = 3.4
  const head = new THREE.Mesh(
    new THREE.CylinderGeometry(1, 1.2, 1.5, 10),
    new THREE.MeshStandardMaterial({ color: '#475569', roughness: 0.6 }),
  )
  head.position.y = 0.8
  grp.add(body, head)
  return grp
}

/** 가스검침기 커버리지 구 — 은은한 반투명 셸(내부 글로우) + 지면 범위 링.
 * color는 판정 등급 색: 센서 실데이터 연동 시 등급 색이 그대로 반영된다.
 * 원점은 센서 헤드 높이(설치 좌표 기준 y+3.4)에 두고 배치한다 */
export function gasCoverageSphere(color: string, radius = GAS_COVERAGE_UNITS): THREE.Group {
  const grp = new THREE.Group()
  const geo = new THREE.SphereGeometry(radius, 28, 18)
  /* 앞면 + 뒷면 이중 셸 — 낮은 불투명도로 겹쳐 깊이감 있는 글로우 */
  const front = new THREE.Mesh(
    geo,
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.06, depthWrite: false }),
  )
  const back = new THREE.Mesh(
    geo,
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.045,
      depthWrite: false,
      side: THREE.BackSide,
    }),
  )
  /* 수평 범위 링 — 커버리지 경계를 도면 감각으로 읽을 수 있게 */
  const ringPts: THREE.Vector3[] = []
  for (let i = 0; i <= 48; i++) {
    const a = (i / 48) * Math.PI * 2
    ringPts.push(new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius))
  }
  const ring = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(ringPts),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.28 }),
  )
  grp.add(back, front, ring)
  return grp
}

/** 계단실 — bottomY에서 topY(기본 지상)까지 층마다 지그재그 플라이트.
 * 원점은 계단실 기준점(설치 좌표, 지표 높이). */
export function stairFlights(bottomY: number, topY = 0): THREE.Group {
  const grp = new THREE.Group()
  const mat = new THREE.MeshStandardMaterial({ color: '#94a3b8', transparent: true, opacity: 0.95 })
  const treadGeo = new THREE.BoxGeometry(34 / 6, 1.6, 13)
  const flights: number[] = []
  for (let yA = bottomY; yA < topY - 0.01; yA += FLOOR_H) flights.push(yA)
  flights.forEach((yA, fi) => {
    for (let i = 0; i < 6; i++) {
      const tread = new THREE.Mesh(treadGeo, mat)
      const prog = (i + 0.5) / 6
      tread.position.set(
        fi % 2 === 0 ? -17 + 34 * prog : -17 + 34 * (1 - prog),
        yA + FLOOR_H * ((i + 1) / 6),
        -7 + (fi % 2) * 14,
      )
      grp.add(tread)
    }
  })
  return grp
}

/** 엘리베이터 — 시작~종료 층을 잇는 수직 샤프트(반투명 볼륨 + 에지) + 왕복 카.
 * 원점은 설치 좌표(지표). bottomY/topY는 시작·종료 층의 바닥 절대 고도 */
export function elevatorShaft(
  width: number,
  depth: number,
  bottomY: number,
  topY: number,
): THREE.Group {
  const grp = new THREE.Group()
  const h = Math.max(topY + FLOOR_H - bottomY, FLOOR_H)
  const geo = new THREE.BoxGeometry(width, h - 1, depth)
  const shaft = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({
      color: '#f472b6',
      transparent: true,
      opacity: 0.16,
      roughness: 0.8,
      depthWrite: false,
    }),
  )
  shaft.position.y = bottomY + h / 2
  const edge = new THREE.LineSegments(
    new THREE.EdgesGeometry(geo),
    new THREE.LineBasicMaterial({ color: '#f472b6', transparent: true, opacity: 0.9 }),
  )
  edge.position.copy(shaft.position)
  /* 카 — 렌더 루프에서 최하층↔최상층을 왕복한다. */
  const carH = FLOOR_H - 8
  const car = new THREE.Mesh(
    new THREE.BoxGeometry(Math.max(2, width - 3), carH, Math.max(2, depth - 3)),
    new THREE.MeshStandardMaterial({ color: '#f9a8d4', transparent: true, opacity: 0.45, roughness: 0.6 }),
  )
  const carOffset = carH / 2 + 2
  car.position.y = bottomY + carOffset
  car.userData.elevatorMotion = {
    bottom: bottomY + carOffset,
    top: topY + carOffset,
  }
  grp.add(shaft, edge, car)
  return grp
}

/** 모든 엘리베이터 카를 동일한 6초 주기로 부드럽게 상하 왕복시킨다.
 * elapsedSeconds는 performance.now() 기반 절대 시간을 전달해 두 3D 화면의 위상을 맞춘다. */
export function updateElevatorCars(root: THREE.Object3D, elapsedSeconds: number) {
  const p = 0.5 - Math.cos((elapsedSeconds / 6) * Math.PI * 2) * 0.5
  root.traverse((obj) => {
    const motion = obj.userData.elevatorMotion as { bottom: number; top: number } | undefined
    if (motion) obj.position.y = THREE.MathUtils.lerp(motion.bottom, motion.top, p)
  })
}

/** 공동구 출입구 — 지표 해치(사각 개구부) + 공동구 층까지 수직 라인.
 * 2D 마커(사각+화살촉)와 대응하는 형태 */
export function entranceShaft(bottomY: number): THREE.Group {
  const grp = new THREE.Group()
  const mat = new THREE.LineBasicMaterial({ color: '#3b82f6', transparent: true, opacity: 0.55 })
  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, bottomY + 6, 0),
    ]),
    mat,
  )
  const hatch = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-4, 0.2, -4),
      new THREE.Vector3(4, 0.2, -4),
      new THREE.Vector3(4, 0.2, 4),
      new THREE.Vector3(-4, 0.2, 4),
    ]),
    new THREE.LineBasicMaterial({ color: '#3b82f6', transparent: true, opacity: 0.85 }),
  )
  grp.add(line, hatch)
  return grp
}

/** 출입구(문) — 문틀(기둥 2 + 상인방) + 개구부 중앙의 방향성 없는 반투명 패널.
 * 폭(width)은 개구부 너비. 2D 벽 개구부 심볼과 대응하는 형태 */
export function doorModel(width = 12): THREE.Group {
  const grp = new THREE.Group()
  const half = width / 2
  const frameMat = new THREE.MeshStandardMaterial({ color: '#38bdf8', roughness: 0.55 })
  for (const px of [-half - 0.5, half + 0.5]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(1, 9, 1), frameMat)
    post.position.set(px, 4.5, 0)
    grp.add(post)
  }
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(width + 2, 1, 1), frameMat)
  lintel.position.y = 9.5
  grp.add(lintel)
  const panel = new THREE.Mesh(
    new THREE.PlaneGeometry(width, 8.4),
    new THREE.MeshStandardMaterial({
      color: '#7dd3fc',
      transparent: true,
      opacity: 0.4,
      side: THREE.DoubleSide,
      roughness: 0.6,
    }),
  )
  panel.position.set(0, 4.6, 0)
  grp.add(panel)
  return grp
}

/** 지하 공동구 세그먼트 재질 — 바닥은 배경색과 블렌딩(교차부 색 겹침 방지) */
export function tunnelMaterials(pageColor: string) {
  return {
    floor: new THREE.MeshStandardMaterial({
      color: new THREE.Color(pageColor).lerp(new THREE.Color('#3b82f6'), 0.38),
      roughness: 0.7,
    }),
    wall: new THREE.MeshStandardMaterial({
      color: '#3b82f6',
      transparent: true,
      opacity: 0.13,
      roughness: 0.7,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  }
}

/** 공동구 세그먼트 — 바닥 슬래브 + 낮은 양측 벽 (중심 원점, X축 방향 길이 len).
 * width는 통로 폭(기본 10m) */
export function tunnelSegment(
  len: number,
  mats: ReturnType<typeof tunnelMaterials>,
  width = 10,
): THREE.Group {
  const seg = new THREE.Group()
  seg.add(new THREE.Mesh(new THREE.BoxGeometry(len + 4, 1.2, width), mats.floor))
  for (const side of [-(width / 2 - 0.3), width / 2 - 0.3]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(len + 4, 9, 1), mats.wall)
    wall.position.set(0, 5, side)
    seg.add(wall)
  }
  return seg
}

/** 지오펜스 — 실체 없는 가상 영역 느낌: 은은한 바닥 면 + 상/하 점선 루프 +
 * 점선 코너 기둥 (솔리드 볼륨 아님). 원점은 지면, outline은 절대 좌표 */
export function geofenceZone(
  outline: Array<[number, number]>,
  color: string,
  height = FLOOR_H - 6,
): THREE.Group {
  const grp = new THREE.Group()
  const shape = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)))
  const plateGeo = new THREE.ShapeGeometry(shape)
  plateGeo.rotateX(Math.PI / 2)
  const plate = new THREE.Mesh(
    plateGeo,
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.08,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  )
  plate.position.y = 0.3
  grp.add(plate)

  const dashMat = new THREE.LineDashedMaterial({
    color,
    transparent: true,
    opacity: 0.9,
    dashSize: 6,
    gapSize: 4,
  })
  const loopAt = (y: number) => {
    const v = outline.map(([x, z]) => new THREE.Vector3(x, y, z))
    v.push(v[0].clone())
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(v), dashMat)
    line.computeLineDistances()
    return line
  }
  grp.add(loopAt(0.3), loopAt(height))

  /* 코너 기둥 — 외곽선에서 최대 8개 지점만 점선 수직선 */
  const step = Math.max(1, Math.floor(outline.length / 8))
  for (let i = 0; i < outline.length; i += step) {
    const [x, z] = outline[i]
    const post = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(x, 0.3, z),
        new THREE.Vector3(x, height, z),
      ]),
      dashMat,
    )
    post.computeLineDistances()
    grp.add(post)
  }
  return grp
}

/** 텍스트 라벨 스프라이트 (캔버스 텍스처) — 고해상도로 그리고 작게 스케일 */
export function textSprite(text: string, color: string, scale = 0.2): THREE.Sprite {
  const font = '500 44px "IBM Plex Sans KR", sans-serif'
  const probe = document.createElement('canvas').getContext('2d')!
  probe.font = font
  const tw = Math.ceil(probe.measureText(text).width)
  const c = document.createElement('canvas')
  c.width = tw + 24
  c.height = 64
  const ctx = c.getContext('2d')!
  ctx.font = font
  ctx.textBaseline = 'middle'
  ctx.lineWidth = 5
  ctx.strokeStyle = 'rgba(0,0,0,0.5)'
  ctx.strokeText(text, 12, 34)
  ctx.fillStyle = color
  ctx.fillText(text, 12, 34)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  const spr = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }),
  )
  spr.scale.set(c.width * scale, c.height * scale, 1)
  return spr
}
