/* ── 실제 지도 타일 배경 (SVG <image>) — SiteMap·맵 빌더 공용 ─────────
 * 로컬 좌표(1unit ≈ 1.25m)를 위경도 앵커(캔버스 중심 500,320) 기준
 * Web Mercator로 변환해 타일을 깐다. viewBox 줌/팬과 자동 정합. */

export type BgKind = 'none' | 'map' | 'sat'

export interface ViewBox {
  x: number
  y: number
  w: number
  h: number
}

const WORLD = 40075016.686
const R_MERC = 6378137
export const M_PER_UNIT = 1.25

function tileUrl(kind: BgKind, z: number, x: number, y: number) {
  if (kind === 'sat')
    return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`
  const style = 'dark_all'
  return `https://${'abcd'[(x + y) % 4]}.basemaps.cartocdn.com/${style}/${z}/${x}/${y}.png`
}

/* ── 동적 축척 바 — 현재 viewBox·컨테이너 크기에서 화면 px당 실거리(m)를
 * 구해 1-2-5 스텝의 보기 좋은 거리로 스냅한다. 줌과 항상 정합. ── */
function niceDistance(maxMeters: number): number {
  const pow = 10 ** Math.floor(Math.log10(maxMeters))
  const d = maxMeters / pow
  return (d >= 5 ? 5 : d >= 2 ? 2 : 1) * pow
}

export function ScaleBar({ vb, wrap }: { vb: ViewBox; wrap: HTMLDivElement | null }) {
  const rw = wrap?.clientWidth ?? 900
  const rh = wrap?.clientHeight ?? 576
  const s = Math.min(rw / vb.w, rh / vb.h) // 화면 px / 로컬 unit (meet 보정)
  const mPerPx = M_PER_UNIT / s
  const meters = niceDistance(mPerPx * 100) // 바 최대 폭 100px
  const label = meters >= 1000 ? `${meters / 1000} km` : `${meters} m`
  return (
    <span className="flex items-end gap-1.5">
      <span
        className="inline-block h-[5px]"
        style={{
          width: meters / mPerPx,
          borderLeft: '1px solid var(--axis-line)',
          borderRight: '1px solid var(--axis-line)',
          borderBottom: '1px solid var(--axis-line)',
        }}
      />
      <span className="tabular-nums">{label}</span>
    </span>
  )
}

export default function TileLayer({
  vb,
  kind,
  screenW,
  anchor,
}: {
  vb: ViewBox
  kind: BgKind
  screenW: number
  /** 캔버스 중심(500,320)이 매핑되는 위경도 */
  anchor: { lat: number; lng: number }
}) {
  const ax = (R_MERC * anchor.lng * Math.PI) / 180
  const ay = R_MERC * Math.log(Math.tan(Math.PI / 4 + (anchor.lat * Math.PI) / 360))
  const res = (vb.w * M_PER_UNIT) / screenW // 화면 px당 미터
  const z = Math.max(3, Math.min(19, Math.round(Math.log2(WORLD / (256 * res)))))
  const n = 2 ** z
  const ts = WORLD / n // 타일 한 변(m)
  const mx0 = ax + (vb.x - 500) * M_PER_UNIT
  const mx1 = ax + (vb.x + vb.w - 500) * M_PER_UNIT
  const myTop = ay - (vb.y - 320) * M_PER_UNIT
  const myBot = ay - (vb.y + vb.h - 320) * M_PER_UNIT
  const tx0 = Math.floor((mx0 + WORLD / 2) / ts)
  const tx1 = Math.floor((mx1 + WORLD / 2) / ts)
  const ty0 = Math.floor((WORLD / 2 - myTop) / ts)
  const ty1 = Math.floor((WORLD / 2 - myBot) / ts)
  const tiles: Array<{ key: string; href: string; x: number; y: number; s: number }> = []
  for (let tx = tx0; tx <= tx1; tx++) {
    for (let ty = ty0; ty <= ty1; ty++) {
      if (tx < 0 || ty < 0 || tx >= n || ty >= n) continue
      const mercX = -WORLD / 2 + tx * ts
      const mercYtop = WORLD / 2 - ty * ts
      tiles.push({
        key: `${z}/${tx}/${ty}`,
        href: tileUrl(kind, z, tx, ty),
        x: 500 + (mercX - ax) / M_PER_UNIT,
        y: 320 + (ay - mercYtop) / M_PER_UNIT,
        s: ts / M_PER_UNIT,
      })
    }
  }
  if (tiles.length > 120) return null // 과도한 타일 요청 방지
  return (
    <g pointerEvents="none">
      {tiles.map((t) => (
        <image
          key={t.key}
          href={t.href}
          x={t.x}
          y={t.y}
          width={t.s * 1.002}
          height={t.s * 1.002}
          preserveAspectRatio="none"
          opacity={kind === 'sat' ? 0.88 : 0.92}
        />
      ))}
    </g>
  )
}
