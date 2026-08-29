// مخطط خطي عام (SVG يدوي، بلا مكتبات) — سلسلة واحدة (docs/design/DIRECTION.md: سلسلة
// واحدة = لون lazward-700 بلا legend، العنوان يسمّيها). شبكة أفقية خافتة، محور y أرقام
// tabular، محور x تواريخ مختصرة، crosshair + tooltip عند المرور. يُستخدم في مسار درجات
// الطالب الآن، وقابل لإعادة الاستخدام في لوحة التحكم لاحقاً.

import { useMemo, useRef, useState } from 'react'

import { EmptyState } from '../ui/EmptyState'
import { formatAxisDate } from './chartUtils'

export interface LineChartPoint {
  x: string | Date
  y: number
  /** نص إضافي يظهر في الـ tooltip (مثل نوع الجلسة) */
  meta?: string
}

export interface LineChartProps {
  data: LineChartPoint[]
  height?: number
  yMin?: number
  yMax?: number
  /** لاحقة تُضاف لقيمة y في المحور والـ tooltip (مثال: "/100") */
  valueSuffix?: string
  emptyLabel?: string
  className?: string
}

const W = 640
const PAD_LEFT = 34
const PAD_RIGHT = 24
const PAD_TOP = 14
const GRID_LINES = 4

export function LineChart({
  data,
  height = 220,
  yMin = 0,
  yMax,
  valueSuffix = '',
  emptyLabel = 'لا بيانات كافية بعد',
  className,
}: LineChartProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)

  const padBottom = 26
  const H = height
  const innerW = W - PAD_LEFT - PAD_RIGHT
  const innerH = H - PAD_TOP - padBottom

  const resolvedMax = yMax ?? Math.max(...data.map((d) => d.y), 1)
  const resolvedMin = yMin

  const points = useMemo(
    () =>
      data.map((d, i) => {
        const xFrac = data.length > 1 ? i / (data.length - 1) : 0.5
        const yFrac = resolvedMax > resolvedMin ? (d.y - resolvedMin) / (resolvedMax - resolvedMin) : 0.5
        return {
          x: PAD_LEFT + xFrac * innerW,
          y: PAD_TOP + (1 - Math.min(1, Math.max(0, yFrac))) * innerH,
          d,
        }
      }),
    [data, resolvedMax, resolvedMin, innerW, innerH],
  )

  if (data.length === 0) {
    return <EmptyState message={emptyLabel} className={className} />
  }

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')

  const gridValues = Array.from({ length: GRID_LINES + 1 }, (_, i) => resolvedMin + ((resolvedMax - resolvedMin) * i) / GRID_LINES)

  // عيّنة تواريخ محور x — إظهار الكل إن كانت قليلة، وإلا أخذ عيّنة متباعدة كي لا تتراكب النصوص
  const labelStep = Math.max(1, Math.ceil(points.length / 6))

  function handlePointer(clientX: number) {
    const svg = svgRef.current
    if (!svg || points.length === 0) return
    const rect = svg.getBoundingClientRect()
    const fracX = (clientX - rect.left) / rect.width
    const targetX = fracX * W
    let nearest = 0
    let nearestDist = Infinity
    points.forEach((p, i) => {
      const dist = Math.abs(p.x - targetX)
      if (dist < nearestDist) {
        nearestDist = dist
        nearest = i
      }
    })
    setHoverIndex(nearest)
  }

  const hovered = hoverIndex != null ? points[hoverIndex] : null

  return (
    <div className={className}>
      <div className="relative w-full">
        {/* direction: ltr إلزامي — وإلا يرث <svg> اتجاه RTL من الصفحة فتنقلب دلالة
            text-anchor start/end ويُقصّ نص محور y عند حافة viewBox. */}
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="block w-full touch-none"
          style={{ height, direction: 'ltr' }}
          onPointerMove={(e) => handlePointer(e.clientX)}
          onPointerLeave={() => setHoverIndex(null)}
          role="img"
          aria-label="مخطط خطي"
        >
          {/* شبكة أفقية خافتة recessive */}
          {gridValues.map((v, i) => {
            const y = PAD_TOP + (1 - i / GRID_LINES) * innerH
            return (
              <g key={i}>
                <line x1={PAD_LEFT} y1={y} x2={W - PAD_RIGHT} y2={y} className="stroke-khatt" strokeWidth={1} />
                <text
                  x={PAD_LEFT - 6}
                  y={y}
                  textAnchor="end"
                  dominantBaseline="middle"
                  className="fill-hibr-3 font-time text-[10px] tabular-nums"
                >
                  {Math.round(v)}
                  {valueSuffix}
                </text>
              </g>
            )
          })}

          {/* محور x: تواريخ مختصرة */}
          {points.map((p, i) =>
            i % labelStep === 0 || i === points.length - 1 ? (
              <text
                key={i}
                x={p.x}
                y={H - 8}
                textAnchor="middle"
                className="fill-hibr-3 font-time text-[10px] tabular-nums"
              >
                {formatAxisDate(p.d.x)}
              </text>
            ) : null,
          )}

          {/* الخط — لون lazward-700 وحيد، لا legend (سلسلة واحدة يسمّيها العنوان) */}
          <path d={linePath} fill="none" className="stroke-lazward-700" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

          {/* نقاط: صغيرة دوماً، تكبر عند hover */}
          {points.map((p, i) => (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r={hoverIndex === i ? 8 : 3}
              className="fill-lazward-700"
              stroke="var(--waraq-raised)"
              strokeWidth={hoverIndex === i ? 2 : 0}
              style={{ transition: 'r 150ms ease' }}
            />
          ))}

          {hovered && (
            <line
              x1={hovered.x}
              y1={PAD_TOP}
              x2={hovered.x}
              y2={H - padBottom}
              className="stroke-hibr-3"
              strokeWidth={1}
              strokeDasharray="3 3"
            />
          )}
        </svg>

        {hovered && (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-control border border-khatt bg-waraq-raised px-2.5 py-1.5 text-sm text-hibr shadow-float"
            style={{ left: `${(hovered.x / W) * 100}%`, top: `${(hovered.y / H) * 100 - 3}%` }}
          >
            <p className="font-time tabular-nums">
              {hovered.d.y}
              {valueSuffix}
            </p>
            <p className="text-hibr-2">
              {formatAxisDate(hovered.d.x)}
              {hovered.d.meta ? ` — ${hovered.d.meta}` : ''}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
