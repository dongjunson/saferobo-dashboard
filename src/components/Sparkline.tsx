/** 고정가스검침기 카드용 경량 SVG 스파크라인 (레거시 gasChart 대응) */
export default function Sparkline({
  data,
  color,
  height = 44,
  min,
  max,
}: {
  data: number[]
  color: string
  height?: number
  min?: number
  max?: number
}) {
  const W = 200
  const H = 40
  const lo = min ?? Math.min(...data)
  const hi = max ?? Math.max(...data)
  const span = hi - lo || 1
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * W
    const y = H - 3 - ((v - lo) / span) * (H - 8)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })
  const areaPts = `0,${H} ${pts.join(' ')} ${W},${H}`
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="w-full"
      style={{ height }}
      aria-hidden
    >
      <polygon points={areaPts} fill={color} opacity={0.12} />
      <polyline
        points={pts.join(' ')}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}
