import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import {
  FLOOR_H,
  beaconModel,
  cssColor,
  doorModel,
  entranceShaft,
  gasDetectorModel,
  gatewayModel,
  geofenceZone,
  stairFlights,
  textSprite,
  tunnelMaterials,
  tunnelSegment,
} from './three-utils'
import { FENCE_COLOR, shapeOutline, symbolDef, type BElement } from '../data/builder'
import { Compass } from './TileLayer'

/* ── 맵 빌더 3D 미리보기 ─────────────────────────────────────────────
 * 2D 캔버스에서 그린 요소를 실시간으로 볼륨 렌더링한다.
 * 렌더러·카메라는 1회 생성하고, 요소 변경 시 콘텐츠 그룹만 재구축 —
 * 드래그 중에도 미리보기가 즉시 따라온다. */

const BUILDING_COLOR = '#8b5cf6'

function disposeDeep(root: THREE.Object3D) {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh
    mesh.geometry?.dispose?.()
    const m = mesh.material as THREE.Material | THREE.Material[] | undefined
    if (Array.isArray(m)) m.forEach((x) => x.dispose())
    else m?.dispose?.()
    const map = (m as THREE.SpriteMaterial | undefined)?.map
    map?.dispose?.()
  })
}

/** level(1=지상1층, -1=지하1층)의 바닥 고도 */
function levelBaseY(level: number): number {
  return level > 0 ? (level - 1) * FLOOR_H : level * FLOOR_H
}

export default function Builder3D({ elements }: { elements: BElement[] }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const compassRef = useRef<SVGSVGElement>(null)
  const apiRef = useRef<{ group: THREE.Group; labelColor: string; pageColor: string } | null>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const pageCol = cssColor('--page', '#0f172a')
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(pageCol)
    scene.fog = new THREE.Fog(pageCol, 2200, 4200)

    const camera = new THREE.PerspectiveCamera(45, 1, 1, 10000)
    camera.position.set(1150, 560, 1180)

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio))
    host.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.set(500, -10, 320)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.maxDistance = 3200
    controls.minDistance = 120
    controls.maxPolarAngle = Math.PI * 0.62

    scene.add(new THREE.AmbientLight(0xffffff, 1.4))
    const sun = new THREE.DirectionalLight(0xffffff, 1.6)
    sun.position.set(600, 900, -300)
    scene.add(sun)

    /* 지반 그리드 — 경계 없이 안개 너머까지 넓게 (무한 지평 느낌) */
    const gridGeo = new THREE.BufferGeometry()
    const gv: number[] = []
    for (let gx = -3400; gx <= 4400; gx += 80) gv.push(gx, 0, -3400, gx, 0, 4400)
    for (let gz = -3400; gz <= 4400; gz += 80) gv.push(-3400, 0, gz, 4400, 0, gz)
    gridGeo.setAttribute('position', new THREE.Float32BufferAttribute(gv, 3))
    scene.add(
      new THREE.LineSegments(
        gridGeo,
        new THREE.LineBasicMaterial({ color: '#334155', transparent: true, opacity: 0.45 }),
      ),
    )

    const group = new THREE.Group()
    scene.add(group)
    apiRef.current = {
      group,
      labelColor: cssColor('--text-secondary', '#cbd5e1'),
      pageColor: pageCol,
    }

    let raf = 0
    const animate = () => {
      raf = requestAnimationFrame(animate)
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
      const w = host.clientWidth || 480
      const h = host.clientHeight || 360
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
      controls.dispose()
      disposeDeep(scene)
      renderer.dispose()
      host.removeChild(renderer.domElement)
      apiRef.current = null
    }
  }, [])

  /* 요소 변경 → 콘텐츠 그룹 재구축 (씬/카메라는 유지) */
  useEffect(() => {
    const api = apiRef.current
    if (!api) return
    const { group, labelColor, pageColor } = api
    disposeDeep(group)
    group.clear()

    const tunMats = tunnelMaterials(pageColor)

    for (const el of elements) {
      if (el.kind === 'building') {
        const upH = el.floorsUp * FLOOR_H
        const downH = el.floorsDown * FLOOR_H
        const h = Math.max(upH + downH, 4)
        const cx = el.x + el.w / 2
        const cz = el.y + el.h / 2
        const cy = (upH - downH) / 2

        /* 다각형 또는 회전된 오브젝트는 외곽선(회전 반영)을 압출 단면으로 사용 */
        const polyShape =
          (el.shape === 'poly' && el.pts) || (el.rot ?? 0) !== 0
            ? new THREE.Shape(shapeOutline(el).map(([px, py]) => new THREE.Vector2(px, py)))
            : null
        let geo: THREE.BufferGeometry
        if (polyShape) {
          geo = new THREE.ExtrudeGeometry(polyShape, { depth: h - 1.5, bevelEnabled: false })
          geo.rotateX(Math.PI / 2) // 단면 XY → 지면 XZ, 압출은 -Y(아래)
        } else if (el.shape === 'ellipse') {
          geo = new THREE.CylinderGeometry(0.5, 0.5, h - 1.5, 40)
        } else {
          geo = new THREE.BoxGeometry(el.w, h - 1.5, el.h)
        }
        const mesh = new THREE.Mesh(
          geo,
          new THREE.MeshStandardMaterial({
            color: BUILDING_COLOR,
            transparent: true,
            opacity: 0.32,
            roughness: 0.85,
            depthWrite: false,
          }),
        )
        if (el.shape === 'ellipse') mesh.scale.set(el.w, 1, el.h)
        if (polyShape) mesh.position.set(0, upH - 0.75, 0)
        else mesh.position.set(cx, cy, cz)
        group.add(mesh)

        const edge = new THREE.LineSegments(
          new THREE.EdgesGeometry(geo, polyShape ? 25 : el.shape === 'ellipse' ? 30 : 1),
          new THREE.LineBasicMaterial({ color: BUILDING_COLOR, transparent: true, opacity: 0.85 }),
        )
        edge.scale.copy(mesh.scale)
        edge.position.copy(mesh.position)
        group.add(edge)

        /* 내부 층 경계판 */
        const plateMat = new THREE.MeshBasicMaterial({
          color: BUILDING_COLOR,
          transparent: true,
          opacity: 0.09,
          side: THREE.DoubleSide,
          depthWrite: false,
        })
        const plateLine = new THREE.LineBasicMaterial({
          color: BUILDING_COLOR,
          transparent: true,
          opacity: 0.35,
        })
        for (let yy = -downH + FLOOR_H; yy <= upH - FLOOR_H + 0.01; yy += FLOOR_H) {
          if (polyShape) {
            const pg = new THREE.ShapeGeometry(polyShape)
            pg.rotateX(Math.PI / 2)
            const plate = new THREE.Mesh(pg, plateMat)
            plate.position.set(0, yy, 0)
            group.add(plate)
          } else if (el.shape === 'rect') {
            const pg = new THREE.PlaneGeometry(el.w - 2, el.h - 2)
            const plate = new THREE.Mesh(pg, plateMat)
            plate.rotation.x = -Math.PI / 2
            plate.position.set(cx, yy, cz)
            group.add(plate)
            const pe = new THREE.LineSegments(new THREE.EdgesGeometry(pg), plateLine)
            pe.rotation.x = -Math.PI / 2
            pe.position.copy(plate.position)
            group.add(pe)
          } else {
            const pg = new THREE.CircleGeometry(0.5, 40)
            const plate = new THREE.Mesh(pg, plateMat)
            plate.rotation.x = -Math.PI / 2
            plate.scale.set(el.w - 2, el.h - 2, 1)
            plate.position.set(cx, yy, cz)
            group.add(plate)
          }
        }

        const lbl = textSprite(el.name, labelColor, 0.2)
        lbl.position.set(cx, upH + 12, cz)
        group.add(lbl)
      } else if (el.kind === 'tunnel') {
        /* 지하 공동구 — 대시보드(Site3D)와 동일한 공용 세그먼트 팩토리 */
        const yBase = levelBaseY(el.level) + 1
        for (let i = 0; i < el.path.length - 1; i++) {
          const [x0, z0] = el.path[i]
          const [x1, z1] = el.path[i + 1]
          const len = Math.hypot(x1 - x0, z1 - z0)
          if (len < 1) continue
          const seg = tunnelSegment(len, tunMats, el.width ?? 18)
          seg.position.set((x0 + x1) / 2, yBase + (i % 7) * 0.03, (z0 + z1) / 2)
          seg.rotation.y = -Math.atan2(z1 - z0, x1 - x0)
          group.add(seg)
        }
      } else if (el.kind === 'fence') {
        /* 지오펜스 — 실체 없는 가상 영역(점선 루프/기둥), 대시보드와 동일 팩토리 */
        const baseY = levelBaseY(el.level)
        const cx = el.x + el.w / 2
        const cz = el.y + el.h / 2
        const zone = geofenceZone(shapeOutline(el, 36), FENCE_COLOR)
        zone.position.y = baseY
        group.add(zone)
        const lbl = textSprite(el.name, FENCE_COLOR, 0.13)
        lbl.position.set(cx, baseY + FLOOR_H + 4, cz)
        group.add(lbl)
      } else if (el.kind === 'room') {
        /* 작업영역(Room) — 대시보드와 동일: 층 바닥 위 구획선 (직각/타원/다각형) */
        const ry = levelBaseY(el.level) + 0.4
        const loop = shapeOutline(el, 24).map(([px, py]) => new THREE.Vector3(px, ry, py))
        loop.push(loop[0].clone())
        const line = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(loop),
          new THREE.LineBasicMaterial({ color: '#334155', transparent: true, opacity: 0.85 }),
        )
        group.add(line)
      } else {
        /* 심볼 — 대시보드(Site3D)와 동일한 장비 모델 사용 */
        const baseY = levelBaseY(el.level)
        if (el.type === 'beacon') {
          const grp = beaconModel()
          grp.position.set(el.x, baseY + 1.4, el.y)
          group.add(grp)
        } else if (el.type === 'gateway') {
          const grp = gatewayModel()
          grp.position.set(el.x, baseY, el.y)
          group.add(grp)
        } else if (el.type === 'gas') {
          const grp = gasDetectorModel('#f59e0b')
          grp.position.set(el.x, baseY, el.y)
          group.add(grp)
        } else if (el.type === 'stairs') {
          /* 시작층→도착층 구간 플라이트 · 폭·회전 반영 */
          const to = el.toLevel ?? -1
          const grp = stairFlights(
            levelBaseY(Math.min(el.level, to)),
            levelBaseY(Math.max(el.level, to)),
          )
          grp.scale.x = (el.width ?? 34) / 34
          grp.rotation.y = (-(el.rot ?? 0) * Math.PI) / 180
          grp.position.set(el.x, 0, el.y)
          group.add(grp)
        } else if (el.type === 'entrance') {
          const shaft = entranceShaft(Math.min(baseY, -FLOOR_H))
          shaft.position.set(el.x, 0, el.y)
          group.add(shaft)
        } else if (el.type === 'door') {
          /* 출입구 — 문틀 모델 (폭·벽면 방향 반영, 2D 개구부 심볼과 대응) */
          const door = doorModel(el.width ?? 12)
          door.rotation.y = (-(el.rot ?? 0) * Math.PI) / 180
          door.position.set(el.x, baseY, el.y)
          group.add(door)
        } else {
          /* 기타 설비 — 대시보드 facilities 마커와 동일 */
          const d = symbolDef(el.type)
          const marker = new THREE.Mesh(
            new THREE.BoxGeometry(5.5, 5.5, 5.5),
            new THREE.MeshStandardMaterial({ color: d.color, roughness: 0.5 }),
          )
          marker.position.set(el.x, baseY + 2.8, el.y)
          group.add(marker)
          const lbl = textSprite(el.name, labelColor, 0.09)
          lbl.position.set(el.x, baseY + 12, el.y)
          group.add(lbl)
        }
      }
    }
  }, [elements])

  return (
    <div ref={hostRef} className="absolute inset-0">
      {/* 나침반 — 우하단, 카메라 방위각 연동 (붉은 침 = 북) */}
      <div className="pointer-events-none absolute bottom-3 right-3 z-10">
        <Compass size={26} svgRef={compassRef} />
      </div>
    </div>
  )
}
