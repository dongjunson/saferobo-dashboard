import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import {
  gasSeverity,
  liveWorkers,
  workerFloor,
  workerPosition,
  type GasLevel,
} from '../data/site'
import type { SiteModel } from '../data/siteModel'
import { DEFAULT_TUNNEL_WIDTH } from '../data/builder'
import { Compass } from './TileLayer'
import {
  FLOOR_H,
  LEVEL_Y,
  beaconModel,
  cssColor,
  doorModel,
  elevatorShaft,
  entranceShaft,
  gasCoverageSphere,
  gasDetectorModel,
  gatewayModel,
  geofenceZone,
  parsePts,
  stairFlights,
  textSprite,
  tunnelMaterials,
  tunnelSegment,
  updateElevatorCars,
} from './three-utils'

/* ── three.js 기반 3D 사업소 뷰 ──────────────────────────────────────
 * 로컬 지도 좌표(x 0-1000, y 0-640)를 three 좌표(X=x, Z=y, Y=고도)로 매핑.
 * OrbitControls로 회전·줌·팬 — 사업소 전체를 다양한 각도에서 본다.
 * 건물은 층 구분 없는 단일 볼륨(지하 보유 시 지표 아래로 연장),
 * 건물 클릭 시 onZoneOpen으로 상세 모달을 연다. */

/** 범례 패널에서 토글하는 표시 레이어 */
export type LayerKey =
  | 'workers'
  | 'beacons'
  | 'gateways'
  | 'gas'
  | 'tunnels'
  | 'stairs'
  | 'rooms'
  | 'fences'
  | 'obstacles'
  | 'facilities'

/** 카메라 보기 프리셋 — n은 같은 프리셋 재클릭도 적용되도록 하는 시퀀스 */
export interface CameraPreset {
  kind: 'default' | 'top' | 'side' | 'fit'
  n: number
}

export default function Site3D({     
  model,
  focusZone,
  onZoneOpen,
  layers,
  preset,
  autoRotate,
}: {
  /** 현장 모델 — 기본 사업소 또는 맵 빌더 제작 맵 (siteModel.ts) */
  model: SiteModel
  /** 단일 건물 포커스(상세 모달) — 해당 구역과 주변 요소만 렌더링 */
  focusZone?: string
  /** 건물 클릭 시 상세 열기 (메인 3D 뷰 전용) */
  onZoneOpen?: (name: string) => void
  /** 레이어 표시 여부 — 생략 시 전부 표시 */
  layers?: Record<LayerKey, boolean>
  /** 카메라 보기 프리셋 (기본/위에서/옆에서/꽉차게) */
  preset?: CameraPreset
  /** 자동 회전 */
  autoRotate?: boolean
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const compassRef = useRef<SVGSVGElement>(null)
  const openRef = useRef(onZoneOpen)
  openRef.current = onZoneOpen
  const layerObjsRef = useRef<Record<LayerKey, THREE.Object3D[]> | null>(null)
  const camApiRef = useRef<{
    camera: THREE.PerspectiveCamera
    controls: OrbitControls
    tgt: THREE.Vector3
    homePos: THREE.Vector3
    sizeW: number
    sizeD: number
    fitFor: (w: number, h: number) => number
  } | null>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    /* 현장 모델 — 기본 사업소 또는 맵 빌더 제작 맵 */
    const {
      zones,
      gateways,
      mapBeacons,
      gasDetectors,
      stairwells,
      rooms,
      utilityTunnels,
      tunnelEntrances,
      geofences,
      obstacles,
      facilities,
      zoneRisk,
    } = model

    const layerObjs: Record<LayerKey, THREE.Object3D[]> = {
      workers: [],
      beacons: [],
      gateways: [],
      gas: [],
      tunnels: [],
      stairs: [],
      rooms: [],
      fences: [],
      obstacles: [],
      facilities: [],
    }

    /* 포커스 건물 bbox — 주변 여백 내 요소만 표시 */
    const focus = focusZone ? zones.find((z) => z.name === focusZone) : undefined
    const fPts = focus ? parsePts(focus.points) : null
    const PAD = 90
    const bx0 = fPts ? Math.min(...fPts.map((p) => p[0])) - PAD : 0
    const bx1 = fPts ? Math.max(...fPts.map((p) => p[0])) + PAD : 1000
    const bz0 = fPts ? Math.min(...fPts.map((p) => p[1])) - PAD : 0
    const bz1 = fPts ? Math.max(...fPts.map((p) => p[1])) + PAD : 640
    const inBox = (x: number, z: number) => x >= bx0 && x <= bx1 && z >= bz0 && z <= bz1

    const col = {
      page: cssColor('--page', '#0f172a'),
      zone: { good: '#8b5cf6', warning: '#fbbf24', critical: '#f87171' } as Record<GasLevel, string>,
      tunnel: '#3b82f6',
      beacon: '#8b5cf6',
      gateway: '#3b82f6',
      gas: { good: '#f59e0b', warning: '#fbbf24', critical: '#f87171' } as Record<GasLevel, string>,
      good: '#34d399',
      critical: '#f87171',
      grid: '#334155',
      label: cssColor('--text-secondary', '#cbd5e1'),
    }

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(col.page)
    scene.fog = new THREE.Fog(col.page, 2200, 4200)

    const camera = new THREE.PerspectiveCamera(45, 1, 1, 10000)
    const tgt = new THREE.Vector3((bx0 + bx1) / 2, -12, (bz0 + bz1) / 2)
    if (focus && fPts) {
      /* 건물 실측(패딩 제외) 크기에 맞춰 카메라를 최적화 — 건물이 화면을 채우도록 */
      const fw = Math.max(...fPts.map((p) => p[0])) - Math.min(...fPts.map((p) => p[0]))
      const fd = Math.max(...fPts.map((p) => p[1])) - Math.min(...fPts.map((p) => p[1]))
      const fBottom = Math.min(...focus.floors.map((lv) => LEVEL_Y[lv]))
      const fTop = (focus.upFloors ?? (focus.floors.includes('F1') ? 1 : 0)) * FLOOR_H
      tgt.y = (fBottom + fTop) / 2
      const r = Math.max(fw, fd, (fTop - fBottom) * 2) * 0.85 + 70
      camera.position.set(tgt.x + r * 0.8, tgt.y + r * 0.62, tgt.z + r * 0.8)
    } else {
      camera.position.set(1150, 520, 1150)
    }

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio))
    host.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.copy(tgt)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.maxDistance = focus ? 1600 : 3200
    controls.minDistance = focus ? 60 : 120
    controls.maxPolarAngle = Math.PI * 0.62 // 지하가 보이도록 수평선 약간 아래까지 허용

    scene.add(new THREE.AmbientLight(0xffffff, 1.4))
    const sun = new THREE.DirectionalLight(0xffffff, 1.6)
    sun.position.set(600, 900, -300)
    scene.add(sun)

    /* 카메라 프리셋 API — 가로·세로 범위가 화면에 꽉 차는 거리 계산 */
    camApiRef.current = {
      camera,
      controls,
      tgt: tgt.clone(),
      homePos: camera.position.clone(),
      sizeW: bx1 - bx0,
      sizeD: bz1 - bz0,
      fitFor: (w: number, h: number) => {
        const vHalf = THREE.MathUtils.degToRad(camera.fov / 2)
        const hHalf = Math.atan(Math.tan(vHalf) * camera.aspect)
        return Math.max(h / 2 / Math.tan(vHalf), w / 2 / Math.tan(hHalf)) * 1.08
      },
    }

    /* ── 지반 그리드 — 메인 뷰는 안개 너머까지 넓게 깔아 무한 지평 느낌.
     * 포커스(건물 상세)만 주변 bbox로 제한 ── */
    const gridGeo = new THREE.BufferGeometry()
    const gv: number[] = []
    const step = focus ? 40 : 80
    const gx0 = focus ? bx0 : -3400
    const gx1 = focus ? bx1 : 4400
    const gz0 = focus ? bz0 : -3400
    const gz1 = focus ? bz1 : 4400
    for (let gx = Math.ceil(gx0 / step) * step; gx <= gx1; gx += step) gv.push(gx, 0, gz0, gx, 0, gz1)
    for (let gz = Math.ceil(gz0 / step) * step; gz <= gz1; gz += step) gv.push(gx0, 0, gz, gx1, 0, gz)
    gridGeo.setAttribute('position', new THREE.Float32BufferAttribute(gv, 3))
    scene.add(
      new THREE.LineSegments(
        gridGeo,
        new THREE.LineBasicMaterial({ color: col.grid, transparent: true, opacity: 0.45 }),
      ),
    )

    /* ── 건물 — 단일 볼륨 + 내부 층 바닥판 + 층간 계단 ── */
    const zoneMeshes: THREE.Mesh[] = []
    for (const z of focus ? [focus] : zones) {
      const pts = parsePts(z.points)
      const xs = pts.map((p) => p[0])
      const zs = pts.map((p) => p[1])
      const w = Math.max(...xs) - Math.min(...xs)
      const d = Math.max(...zs) - Math.min(...zs)
      const cx = Math.min(...xs) + w / 2
      const cz = Math.min(...zs) + d / 2
      const risk = zoneRisk.get(z.name)?.level ?? 'good'
      const color = col.zone[risk]

      const bottom = Math.min(...z.floors.map((lv) => LEVEL_Y[lv]))
      const top = (z.upFloors ?? (z.floors.includes('F1') ? 1 : 0)) * FLOOR_H
      const h = Math.max(top - bottom, 4)
      /* 타원형(맵 빌더)은 실린더, poly(포인트 드로잉)는 단면 압출, 그 외 bbox 박스 */
      const ellipse = z.shape === 'ellipse'
      const poly = z.shape === 'poly'
      const polyShape = poly
        ? new THREE.Shape(pts.map(([px, py]) => new THREE.Vector2(px, py)))
        : null
      let geo: THREE.BufferGeometry
      if (polyShape) {
        geo = new THREE.ExtrudeGeometry(polyShape, { depth: h - 1.5, bevelEnabled: false })
        geo.rotateX(Math.PI / 2) // 단면 XY → 지면 XZ, 압출은 -Y(아래) 방향
      } else if (ellipse) {
        geo = new THREE.CylinderGeometry(0.5, 0.5, h - 1.5, 40)
      } else {
        geo = new THREE.BoxGeometry(w, h - 1.5, d)
      }
      const box = new THREE.Mesh(
        geo,
        new THREE.MeshStandardMaterial({
          color,
          transparent: true,
          opacity: 0.32,
          roughness: 0.85,
          depthWrite: false,
        }),
      )
      if (ellipse) box.scale.set(w, 1, d)
      /* poly는 절대좌표 단면이라 y만 배치, 나머지는 중심 배치 */
      if (poly) box.position.set(0, top - 0.75, 0)
      else box.position.set(cx, bottom + h / 2, cz)
      box.userData.zone = z.name
      scene.add(box)
      zoneMeshes.push(box)
      const edge = new THREE.LineSegments(
        new THREE.EdgesGeometry(geo, poly ? 25 : ellipse ? 30 : 1),
        new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.85 }),
      )
      edge.scale.copy(box.scale)
      edge.position.copy(box.position)
      scene.add(edge)

      const lbl = textSprite(z.name, col.label, 0.2)
      lbl.position.set(cx, top + 12, cz)
      scene.add(lbl)
      if (risk !== 'good') {
        const tag = textSprite(risk === 'critical' ? '▲ 위험' : '▲ 주의', col.zone[risk], 0.17)
        tag.position.set(cx, top + 25, cz)
        scene.add(tag)
      }

      /* 내부 층 구분 — 단일 볼륨 안에 각 층의 바닥판을 얇게 표시.
       * 지상 다층(맵 빌더)은 F1 위로도 층마다 바닥판을 추가 */
      const plateMat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.09,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
      const plateLineMat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.35 })
      for (let py = bottom + FLOOR_H; py <= top - FLOOR_H + 0.01; py += FLOOR_H) {
        if (polyShape) {
          const plateGeo = new THREE.ShapeGeometry(polyShape)
          plateGeo.rotateX(Math.PI / 2)
          const plate = new THREE.Mesh(plateGeo, plateMat)
          plate.position.set(0, py, 0)
          scene.add(plate)
          continue
        }
        const plateGeo = ellipse
          ? new THREE.CircleGeometry(0.5, 40)
          : new THREE.PlaneGeometry(w - 3, d - 3)
        const plate = new THREE.Mesh(plateGeo, plateMat)
        plate.rotation.x = -Math.PI / 2
        if (ellipse) plate.scale.set(w - 3, d - 3, 1)
        plate.position.set(cx, py, cz)
        scene.add(plate)
        if (!ellipse) {
          const pEdge = new THREE.LineSegments(new THREE.EdgesGeometry(plateGeo), plateLineMat)
          pEdge.rotation.x = -Math.PI / 2
          pEdge.position.copy(plate.position)
          scene.add(pEdge)
        }
      }

    }

    /* ── 작업영역(Room) — 층 바닥판 위 구획선 (포커스 모드에선 이름 포함) ── */
    const roomMat = new THREE.LineBasicMaterial({ color: col.grid, transparent: true, opacity: 0.85 })
    for (const r of rooms) {
      if (focus && r.zone !== focus.name) continue
      const pts = parsePts(r.points)
      const y = LEVEL_Y[r.level] + 0.4
      const loop = pts.map(([x, z]) => new THREE.Vector3(x, y, z))
      loop.push(loop[0].clone())
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(loop), roomMat)
      scene.add(line)
      layerObjs.rooms.push(line)
      if (focus) {
        const cx = (Math.min(...pts.map((p) => p[0])) + Math.max(...pts.map((p) => p[0]))) / 2
        const cz = (Math.min(...pts.map((p) => p[1])) + Math.max(...pts.map((p) => p[1]))) / 2
        const lbl = textSprite(r.name, col.label, 0.12)
        lbl.position.set(cx, y + 4, cz)
        scene.add(lbl)
        layerObjs.rooms.push(lbl)
      }
    }

    /* ── 계단실 — 설치된 건물에만(복수 개소 가능) ── */
    for (const s of stairwells) {
      if (focus && s.zone !== focus.name) continue
      const fromY = LEVEL_Y[s.fromLevel ?? 'F1']
      const toY = LEVEL_Y[s.toLevel]
      const grp = stairFlights(Math.min(fromY, toY), Math.max(fromY, toY))
      grp.scale.x = (s.width ?? 34) / 34
      grp.rotation.y = (-(s.rot ?? 0) * Math.PI) / 180
      grp.position.set(s.x, 0, s.y)
      scene.add(grp)
      layerObjs.stairs.push(grp)
    }

    /* ── 지하 공동구 — 바닥 슬래브 + 낮은 양측 벽 (공용 팩토리).
     * 코플래너 z-파이팅 방지를 위해 세그먼트마다 미세한 높이 오프셋 ── */
    const tunMats = tunnelMaterials(col.page)
    let segIdx = 0
    for (const t of utilityTunnels) {
      const yBase = LEVEL_Y[t.level] + 1
      for (let i = 0; i < t.path.length - 1; i++) {
        const [x0, z0] = t.path[i]
        const [x1, z1] = t.path[i + 1]
        if (focus && !inBox(x0, z0) && !inBox(x1, z1)) continue
        const seg = tunnelSegment(Math.hypot(x1 - x0, z1 - z0), tunMats, t.width ?? DEFAULT_TUNNEL_WIDTH)
        seg.position.set((x0 + x1) / 2, yBase + (segIdx++ % 7) * 0.03, (z0 + z1) / 2)
        seg.rotation.y = -Math.atan2(z1 - z0, x1 - x0)
        scene.add(seg)
        layerObjs.tunnels.push(seg)
      }
    }
    /* 출입구 — 지표에서 공동구 층까지 수직 라인 */
    for (const e of tunnelEntrances) {
      if (focus && !inBox(e.x, e.y)) continue
      const shaft = entranceShaft(LEVEL_Y[e.level ?? 'B1'])
      shaft.position.set(e.x, 0, e.y)
      scene.add(shaft)
      layerObjs.tunnels.push(shaft)
    }

    /* ── 장비 마커 — 실제 기기 형태의 소형 모델 (공용 팩토리) ── */
    for (const b of mapBeacons) {
      if (focus && !inBox(b.x, b.y)) continue
      const grp = beaconModel()
      grp.position.set(b.x, LEVEL_Y[b.level ?? 'F1'] + 1.4, b.y)
      scene.add(grp)
      layerObjs.beacons.push(grp)
    }
    for (const g of gateways) {
      if (focus && !inBox(g.x, g.y)) continue
      const grp = gatewayModel()
      /* 옥상 설치 — 소속 건물(zone)의 지상 최상단 위에 배치 */
      let gy = LEVEL_Y[g.level ?? 'F1']
      if (g.roof) {
        const hz = zones.find((z) => z.name === g.zone)
        if (hz) gy = (hz.upFloors ?? (hz.floors.includes('F1') ? 1 : 0)) * FLOOR_H
      }
      grp.position.set(g.x, gy, g.y)
      scene.add(grp)
      layerObjs.gateways.push(grp)
    }
    for (const g of gasDetectors) {
      if (focus && !inBox(g.x, g.y)) continue
      const sevColor = col.gas[gasSeverity(g)]
      const baseY = LEVEL_Y[g.level ?? 'F1']
      const grp = gasDetectorModel(sevColor)
      grp.position.set(g.x, baseY, g.y)
      /* 커버리지(반경 15m) — 등급 색 은은한 구, 실데이터 연동 시 색이 함께 바뀐다 */
      const cov = gasCoverageSphere(sevColor)
      cov.position.set(g.x, baseY + 3.4, g.y)
      scene.add(grp, cov)
      layerObjs.gas.push(grp, cov)
    }

    /* ── 지오펜스(맵 빌더 제작) — 실체 없는 가상 영역:
     * 은은한 바닥 면 + 상/하 점선 루프 + 점선 코너 기둥 ── */
    for (const f of geofences) {
      const fcx = f.x + f.w / 2
      const fcz = f.y + f.h / 2
      if (focus && !inBox(fcx, fcz)) continue
      const baseY = LEVEL_Y[f.floor]
      const zone = geofenceZone(f.pts, f.color)
      zone.position.y = baseY
      const fLbl = textSprite(f.name, f.color, 0.13)
      fLbl.position.set(fcx, baseY + FLOOR_H + 4, fcz)
      scene.add(zone, fLbl)
      layerObjs.fences.push(zone, fLbl)
    }

    /* ── 지오펜스 내부 장애물 — 맵 빌더 3D와 동일한 반투명 솔리드 볼륨 ── */
    for (const obstacle of obstacles) {
      const cx = obstacle.x + obstacle.w / 2
      const cz = obstacle.y + obstacle.h / 2
      if (focus && !inBox(cx, cz)) continue
      const baseY = LEVEL_Y[obstacle.floor]
      const height = 12
      const geometry =
        obstacle.shape === 'ellipse'
          ? new THREE.CylinderGeometry(0.5, 0.5, height, 28)
          : new THREE.BoxGeometry(obstacle.w, height, obstacle.h)
      const mesh = new THREE.Mesh(
        geometry,
        new THREE.MeshStandardMaterial({
          color: '#64748b',
          roughness: 0.8,
          transparent: true,
          opacity: 0.75,
        }),
      )
      if (obstacle.shape === 'ellipse') mesh.scale.set(obstacle.w, 1, obstacle.h)
      mesh.rotation.y = (-((obstacle.rot ?? 0) * Math.PI)) / 180
      mesh.position.set(cx, baseY + height / 2, cz)
      const edge = new THREE.LineSegments(
        new THREE.EdgesGeometry(geometry, obstacle.shape === 'ellipse' ? 30 : 1),
        new THREE.LineBasicMaterial({ color: '#94a3b8', transparent: true, opacity: 0.7 }),
      )
      edge.scale.copy(mesh.scale)
      edge.rotation.copy(mesh.rotation)
      edge.position.copy(mesh.position)
      scene.add(mesh, edge)
      layerObjs.obstacles.push(mesh, edge)
    }

    /* ── 기타 설비(맵 빌더 심볼) — 출입구는 문틀 모델, 그 외 박스 마커 ── */
    for (const fc of facilities) {
      if (focus && !inBox(fc.x, fc.y)) continue
      const baseY = LEVEL_Y[fc.floor]
      const marker: THREE.Object3D =
        fc.type === 'door'
          ? doorModel(fc.width ?? 12)
          : fc.type === 'elevator'
            ? elevatorShaft(
                fc.width ?? 16,
                fc.depth ?? 16,
                Math.min(LEVEL_Y[fc.floor], LEVEL_Y[fc.toFloor ?? fc.floor]),
                Math.max(LEVEL_Y[fc.floor], LEVEL_Y[fc.toFloor ?? fc.floor]),
              )
            : new THREE.Mesh(
                new THREE.BoxGeometry(5.5, 5.5, 5.5),
                new THREE.MeshStandardMaterial({ color: fc.color, roughness: 0.5 }),
              )
      if (fc.type === 'door' || fc.type === 'elevator')
        marker.rotation.y = (-(fc.rot ?? 0) * Math.PI) / 180
      marker.position.set(
        fc.x,
        fc.type === 'door' || fc.type === 'elevator' ? 0 : baseY + 2.8,
        fc.y,
      )
      if (fc.type === 'door') marker.position.y = baseY
      scene.add(marker)
      layerObjs.facilities.push(marker)
      /* 출입구는 형태로 식별 가능 — 이름 라벨 생략 (툴팁·2D에서 확인) */
      if (fc.type !== 'door') {
        const mLbl = textSprite(fc.name, col.label, 0.09)
        mLbl.position.set(fc.x, baseY + 12, fc.y)
        scene.add(mLbl)
        layerObjs.facilities.push(mLbl)
      }
    }

    /* ── 작업자 — 실시간 이동 + 이름 라벨 (+위험 링) ── */
    const t0 = performance.now()
    const workerObjs: Array<{
      g: THREE.Group
      w: (typeof liveWorkers)[number]
      ring: THREE.Mesh | null
    }> = []
    const sphereGeo = new THREE.SphereGeometry(4.6, 20, 14)
    for (const w of liveWorkers) {
      if (w.outTime !== null) continue
      if (focus && w.zone !== focus.name) continue
      const wf = workerFloor(w)
      const g = new THREE.Group()
      const body = new THREE.Mesh(
        sphereGeo,
        new THREE.MeshStandardMaterial({
          color: w.danger ? col.critical : col.good,
          transparent: true,
          opacity: 1,
        }),
      )
      g.add(body)
      let ring: THREE.Mesh | null = null
      if (w.danger) {
        ring = new THREE.Mesh(
          new THREE.RingGeometry(6.5, 8.2, 36),
          new THREE.MeshBasicMaterial({
            color: col.critical,
            transparent: true,
            opacity: 0.7,
            side: THREE.DoubleSide,
            depthWrite: false,
          }),
        )
        ring.rotation.x = -Math.PI / 2
        ring.position.y = -4
        g.add(ring)
      }
      const lbl = textSprite(w.name, col.label, 0.15)
      lbl.position.y = 11
      g.add(lbl)
      const [x, z] = workerPosition(w, 0)
      g.position.set(x, LEVEL_Y[wf] + 5, z)
      scene.add(g)
      workerObjs.push({ g, w, ring })
      layerObjs.workers.push(g)
    }

    layerObjsRef.current = layerObjs

    /* ── 건물 클릭 → 상세 모달 (드래그 회전과 구분: 이동량이 작을 때만) ── */
    const ray = new THREE.Raycaster()
    const pickZone = (e: PointerEvent): string | null => {
      const r = renderer.domElement.getBoundingClientRect()
      const ndc = new THREE.Vector2(
        ((e.clientX - r.left) / r.width) * 2 - 1,
        -((e.clientY - r.top) / r.height) * 2 + 1,
      )
      ray.setFromCamera(ndc, camera)
      const hit = ray.intersectObjects(zoneMeshes, false)[0]
      return hit ? ((hit.object.userData.zone as string) ?? null) : null
    }
    let downX = 0
    let downY = 0
    const onDown = (e: PointerEvent) => {
      downX = e.clientX
      downY = e.clientY
    }
    const onUp = (e: PointerEvent) => {
      if (!openRef.current || e.button !== 0) return
      if (Math.abs(e.clientX - downX) + Math.abs(e.clientY - downY) > 5) return
      const zoneName = pickZone(e)
      if (zoneName) openRef.current(zoneName)
    }
    const onMove = (e: PointerEvent) => {
      if (!openRef.current || e.buttons) return
      renderer.domElement.style.cursor = pickZone(e) ? 'pointer' : 'grab'
    }
    renderer.domElement.addEventListener('pointerdown', onDown)
    renderer.domElement.addEventListener('pointerup', onUp)
    renderer.domElement.addEventListener('pointermove', onMove)

    /* ── 렌더 루프 ── */
    let raf = 0
    const animate = () => {
      raf = requestAnimationFrame(animate)
      const t = (performance.now() - t0) / 1000
      for (const { g, w, ring } of workerObjs) {
        const [x, z] = workerPosition(w, t)
        g.position.x = x
        g.position.z = z
        if (ring) {
          const p = (t % 1.2) / 1.2
          ring.scale.setScalar(0.6 + p)
          ;(ring.material as THREE.MeshBasicMaterial).opacity = 0.7 * (1 - p)
        }
      }
      updateElevatorCars(scene, performance.now() / 1000)
      controls.update()
      /* 나침반 — 카메라 방위각에 맞춰 북침 회전 */
      if (compassRef.current)
        compassRef.current.style.transform = `rotate(${THREE.MathUtils.radToDeg(
          controls.getAzimuthalAngle(),
        )}deg)`
      renderer.render(scene, camera)
    }
    animate()

    const resize = () => {
      const w = host.clientWidth || 600
      const h = host.clientHeight || 400
      renderer.setSize(w, h)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(host)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      renderer.domElement.removeEventListener('pointerdown', onDown)
      renderer.domElement.removeEventListener('pointerup', onUp)
      renderer.domElement.removeEventListener('pointermove', onMove)
      controls.dispose()
      scene.traverse((o) => {
        const mesh = o as THREE.Mesh
        mesh.geometry?.dispose?.()
        const m = mesh.material as THREE.Material | THREE.Material[] | undefined
        if (Array.isArray(m)) m.forEach((x) => x.dispose())
        else m?.dispose?.()
        const map = (m as THREE.SpriteMaterial | undefined)?.map
        map?.dispose?.()
      })
      renderer.dispose()
      host.removeChild(renderer.domElement)
      layerObjsRef.current = null
      camApiRef.current = null
    }
    // 현장 모델이나 포커스 구역이 바뀌면 다크 테마 토큰을 다시 읽어 장면을 구성한다.
  }, [focusZone, model])

  /* 카메라 보기 프리셋 — 위에서/옆에서/꽉차게/기본 */
  useEffect(() => {
    const api = camApiRef.current
    if (!preset || !api) return
    const { camera, controls, tgt, homePos, sizeW, sizeD, fitFor } = api
    switch (preset.kind) {
      case 'top': {
        // 위에서 보기 — 부지 footprint가 화면에 꽉 차는 수직 탑뷰
        const d = fitFor(sizeW, sizeD)
        camera.position.set(tgt.x, d, tgt.z + 1)
        break
      }
      case 'side': {
        // 옆에서 보기 — 남측 저각(수평) 뷰, 가로 폭 기준으로 맞춤
        const d = fitFor(sizeW, 220)
        camera.position.set(tgt.x, tgt.y + 70, tgt.z + d)
        break
      }
      case 'fit': {
        // 꽉차게 보기 — 쿼터 각도를 유지하며 투영 범위 기준으로 맞춤
        const d = fitFor((sizeW + sizeD) * 0.72, (sizeW + sizeD) * 0.42)
        const k = d / Math.hypot(0.55, 0.5, 0.55)
        camera.position.set(tgt.x + k * 0.55, tgt.y + k * 0.5, tgt.z + k * 0.55)
        break
      }
      default: // 기본 보기
        camera.position.copy(homePos)
    }
    controls.target.copy(tgt)
    controls.update()
  }, [preset, focusZone])

  /* 자동 회전 토글 */
  useEffect(() => {
    const api = camApiRef.current
    if (!api) return
    api.controls.autoRotate = !!autoRotate
    api.controls.autoRotateSpeed = 1.1
  }, [autoRotate, focusZone])

  /* 레이어 표시 토글 — 씬 재구축 없이 visible만 갱신 */
  useEffect(() => {
    const lo = layerObjsRef.current
    if (!lo) return
    for (const k of Object.keys(lo) as LayerKey[]) {
      const on = layers?.[k] ?? true
      for (const o of lo[k]) o.visible = on
    }
  }, [layers, focusZone])

  return (
    <div ref={hostRef} className="absolute inset-0">
      {/* 나침반 — 우하단, 카메라 방위각 연동 (붉은 침 = 북) */}
      <div className="pointer-events-none absolute bottom-3 right-3 z-10">
        <Compass size={26} svgRef={compassRef} />
      </div>
    </div>
  )
}
