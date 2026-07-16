import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import {
  assessZoneRisks,
  gasDetectors,
  gasSeverity,
  gateways,
  liveWorkers,
  mapBeacons,
  tunnelEntrances,
  utilityTunnels,
  workerFloor,
  workerPosition,
  zones,
  type FloorId,
  type GasLevel,
} from '../data/site'

/* ── three.js 기반 3D 사업소 뷰 ──────────────────────────────────────
 * 로컬 지도 좌표(x 0-1000, y 0-640)를 three 좌표(X=x, Z=y, Y=고도)로 매핑.
 * OrbitControls로 회전·줌·팬 — 사업소 전체를 다양한 각도에서 본다.
 * 건물은 층 구분 없는 단일 볼륨(지하 보유 시 지표 아래로 연장),
 * 건물 클릭 시 onZoneOpen으로 상세 모달을 연다. */

const FLOOR_H = 25 // 층고 (시각화용 과장 스케일)
const LEVEL_Y: Record<FloorId, number> = { F1: 0, B1: -FLOOR_H, B2: -FLOOR_H * 2 }

const ZONE_RISK_3D = new Map(assessZoneRisks().map((r) => [r.zone, r.level]))

function parsePts(points: string): Array<[number, number]> {
  return points
    .trim()
    .split(/\s+/)
    .map((p) => p.split(',').map(Number) as [number, number])
}

function cssColor(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v.startsWith('#') ? v : fallback
}

/** 텍스트 라벨 스프라이트 (캔버스 텍스처) — 고해상도로 그리고 작게 스케일 */
function textSprite(text: string, color: string, scale = 0.2): THREE.Sprite {
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

export default function Site3D({
  focusZone,
  onZoneOpen,
}: {
  /** 단일 건물 포커스(상세 모달) — 해당 구역과 주변 요소만 렌더링 */
  focusZone?: string
  /** 건물 클릭 시 상세 열기 (메인 3D 뷰 전용) */
  onZoneOpen?: (name: string) => void
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const openRef = useRef(onZoneOpen)
  openRef.current = onZoneOpen

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

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
    if (focus) {
      const r = Math.max(bx1 - bx0, bz1 - bz0) * 1.15 + 60
      camera.position.set(tgt.x + r * 0.75, r * 0.72, tgt.z + r * 0.75)
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

    /* ── 지반 그리드 ── */
    const gridGeo = new THREE.BufferGeometry()
    const gv: number[] = []
    const step = focus ? 40 : 80
    for (let gx = Math.ceil(bx0 / step) * step; gx <= bx1; gx += step) gv.push(gx, 0, bz0, gx, 0, bz1)
    for (let gz = Math.ceil(bz0 / step) * step; gz <= bz1; gz += step) gv.push(bx0, 0, gz, bx1, 0, gz)
    gridGeo.setAttribute('position', new THREE.Float32BufferAttribute(gv, 3))
    scene.add(
      new THREE.LineSegments(
        gridGeo,
        new THREE.LineBasicMaterial({ color: col.grid, transparent: true, opacity: 0.45 }),
      ),
    )

    /* ── 건물 — 층 구분 없는 단일 볼륨 (지하 보유 시 지표 아래로 연장) ── */
    const zoneMeshes: THREE.Mesh[] = []
    for (const z of focus ? [focus] : zones) {
      const pts = parsePts(z.points)
      const xs = pts.map((p) => p[0])
      const zs = pts.map((p) => p[1])
      const w = Math.max(...xs) - Math.min(...xs)
      const d = Math.max(...zs) - Math.min(...zs)
      const cx = Math.min(...xs) + w / 2
      const cz = Math.min(...zs) + d / 2
      const risk = ZONE_RISK_3D.get(z.name) ?? 'good'
      const color = col.zone[risk]

      const bottom = Math.min(...z.floors.map((lv) => LEVEL_Y[lv]))
      const top = z.floors.includes('F1') ? FLOOR_H : 0
      const h = top - bottom
      const geo = new THREE.BoxGeometry(w, h - 1.5, d)
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
      box.position.set(cx, bottom + h / 2, cz)
      box.userData.zone = z.name
      scene.add(box)
      zoneMeshes.push(box)
      const edge = new THREE.LineSegments(
        new THREE.EdgesGeometry(geo),
        new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.85 }),
      )
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
    }

    /* ── 지하 공동구 — 층 깊이의 단순 라인 (복잡한 볼륨 대신 경로만) ── */
    const tunnelMat = new THREE.LineBasicMaterial({ color: col.tunnel, transparent: true, opacity: 0.9 })
    const shaftMat = new THREE.LineBasicMaterial({ color: col.tunnel, transparent: true, opacity: 0.55 })
    for (const t of utilityTunnels) {
      if (focus && !t.path.some(([x, z]) => inBox(x, z))) continue
      const y = LEVEL_Y[t.level] + 6
      const geo = new THREE.BufferGeometry().setFromPoints(
        t.path.map(([x, z]) => new THREE.Vector3(x, y, z)),
      )
      scene.add(new THREE.Line(geo, tunnelMat))
    }
    /* 출입구 — 지표에서 공동구 층까지 수직 라인 */
    for (const e of tunnelEntrances) {
      if (focus && !inBox(e.x, e.y)) continue
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(e.x, 0, e.y),
        new THREE.Vector3(e.x, LEVEL_Y[e.level ?? 'B1'] + 6, e.y),
      ])
      scene.add(new THREE.Line(geo, shaftMat))
    }

    /* ── 장비 마커 ── */
    const beaconGeo = new THREE.BoxGeometry(6, 6, 6)
    for (const b of mapBeacons) {
      if (focus && !inBox(b.x, b.y)) continue
      const m = new THREE.Mesh(
        beaconGeo,
        new THREE.MeshStandardMaterial({ color: col.beacon, transparent: true, opacity: 0.95 }),
      )
      m.position.set(b.x, LEVEL_Y[b.level ?? 'F1'] + 4, b.y)
      scene.add(m)
    }
    const gwGeo = new THREE.SphereGeometry(6, 20, 14)
    for (const g of gateways) {
      if (focus && !inBox(g.x, g.y)) continue
      const m = new THREE.Mesh(
        gwGeo,
        new THREE.MeshStandardMaterial({ color: col.gateway, transparent: true, opacity: 0.95 }),
      )
      m.position.set(g.x, 7, g.y)
      scene.add(m)
    }
    const gasGeo = new THREE.OctahedronGeometry(7)
    for (const g of gasDetectors) {
      if (focus && !inBox(g.x, g.y)) continue
      const m = new THREE.Mesh(
        gasGeo,
        new THREE.MeshStandardMaterial({
          color: col.gas[gasSeverity(g)],
          transparent: true,
          opacity: 0.95,
        }),
      )
      m.position.set(g.x, 8, g.y)
      scene.add(m)
    }

    /* ── 작업자 — 실시간 이동 + 이름 라벨 (+위험 링) ── */
    const t0 = performance.now()
    const workerObjs: Array<{
      g: THREE.Group
      w: (typeof liveWorkers)[number]
      ring: THREE.Mesh | null
    }> = []
    const sphereGeo = new THREE.SphereGeometry(6.5, 20, 14)
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
          new THREE.RingGeometry(9, 11, 36),
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
      const lbl = textSprite(w.name, col.label, 0.17)
      lbl.position.y = 14
      g.add(lbl)
      const [x, z] = workerPosition(w, 0)
      g.position.set(x, LEVEL_Y[wf] + 7, z)
      scene.add(g)
      workerObjs.push({ g, w, ring })
    }

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
      controls.update()
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
    }
    // 테마 전환 시에는 지도 재진입으로 색을 다시 읽는다 — 목업 수준에서 허용
  }, [focusZone])

  return <div ref={hostRef} className="absolute inset-0" />
}
