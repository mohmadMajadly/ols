// مخطط أعمدة رأسية (SVG يدوي) — لتوزيع الدرجات والأيام (لوحة التحكم لاحقاً). لون واحد
// lazward-700 ما لم تُمرَّر ألوان لكل عمود (توكنز --chart-* حصراً). علامة رفيعة بنهاية
// مدوّرة 4px من الأعلى فقط (جهة القيمة)، محور واحد، شبكة أفقية خافتة، tooltip لكل عمود.

import { useState } from 'react'

import { EmptyState } from '../ui/EmptyState'
import { roundedRectPathTop } from './chartUtils'

export interface BarChartVDatum {
  id: string
  label: string
  value: number
  /** توكن لون CSS كسلسلة نصية، مثال: var(--chart-hifz) — افتراضياً lazward-700 الموحّد */
  color?: string
}

export interface BarChartVProps {
  data: BarChartVDatum[]
  height?: number
  yMax?: number
  emptyLabel?: string
  valueFormatter?: (v: number) => string
  className?: string
}

const W = 520
const PAD_LEFT = 30
const PAD_RIGHT = 8
const PAD_TOP = 14
const PAD_BOTTOM = 24
const RADIUS = 4
const GRID_LINES = 3

export function BarChartV({
  data,
  height = 200,
  yMax,
  emptyLabel = 'لا بيانات كافية بعد',
  valueFormatter,
  className,
}: BarChartVProps) {
  const [hoverId, setHoverId] = useState<string | null>(null)

  if (data.length === 0) {
    return <EmptyState message={emptyLabel} className={className} />
  }

  const H = height
  const innerW = W - PAD_LEFT - PAD_RIGHT
  const innerH = H - PAD_TOP - PAD_BOTTOM
  const resolvedMax = yMax ?? Math.max(...data.map((d) => d.value), 1)
  const format = valueFormatter ?? ((v: number) => String(v))

  const slot = innerW / data.length
  const barWidth = Math.min(28, Math.max(6, slot - 6))

  const gridValues = Array.from({ length: GRID_LINES + 1 }, (_, i) => (resolvedMax * i) / GRID_LINES)

  const hoveredDatum = data.find((d) => d.id === hoverId) ?? null
  const hoveredIndex = hoveredDatum ? data.indexOf(hoveredDatum) : -1

  return (
    <div className={className}>
      <div className="relative w-full">
        {/* direction: ltr إلزامي — انظر التعليق المماثل في BarChartH/LineChart */}
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="block w-full"
          style={{ height: H, direction: 'ltr' }}
          role="img"
          aria-label="مخطط أعمدة رأسية"
        >
          {/* محور واحد: خط أساس + شبكة أفقية خافتة recessive */}
          {gridValues.map((v, i) => {
            const y = PAD_TOP + (1 - i / GRID_LINES) * innerH
            return (
              <g key={i}>
                <line x1={PAD_LEFT} y1={y} x2={W - PAD_RIGHT} y2={y} className="stroke-khatt" strokeWidth={1} />
                <text x={PAD_LEFT - 6} y={y} textAnchor="end" dominantBaseline="middle" className="fill-hibr-3 font-time text-[10px] tabular-nums">
                  {Math.round(v)}
                </text>
              </g>
            )
          })}

          {data.map((d, i) => {
            const fraction = resolvedMax > 0 ? d.value / resolvedMax : 0
            const barHeight = fraction * innerH
            const x = PAD_LEFT + i * slot + (slot - barWidth) / 2
            const y = PAD_TOP + innerH - barHeight
            const path = roundedRectPathTop(x, y, barWidth, barHeight, RADIUS)
            const color = d.color ?? 'var(--lazward-700)'
            const hovered = hoverId === d.id

            return (
              <g
                key={d.id}
                onPointerEnter={() => setHoverId(d.id)}
                onPointerLeave={() => setHoverId((id) => (id === d.id ? null : id))}
              >
                <rect x={PAD_LEFT + i * slot} y={PAD_TOP} width={slot} height={innerH} fill="transparent" />
                {barHeight > 0 && <path d={path} style={{ fill: color, opacity: hovered ? 0.85 : 1 }} />}
                <text x={x + barWidth / 2} y={H - 8} textAnchor="middle" className="fill-hibr-2 text-[11px]">
                  {d.label}
                </text>
              </g>
            )
          })}
        </svg>

        {hoveredDatum && hoveredIndex >= 0 && (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-control border border-khatt bg-waraq-raised px-2.5 py-1.5 text-sm text-hibr shadow-float"
            style={{
              left: `${((PAD_LEFT + (hoveredIndex + 0.5) * slot) / W) * 100}%`,
              top: `${((PAD_TOP + innerH * (1 - Math.min(1, hoveredDatum.value / resolvedMax))) / H) * 100 - 2}%`,
            }}
          >
            <span className="font-medium">{hoveredDatum.label}</span>{' '}
            <span className="font-time tabular-nums text-hibr-2">{format(hoveredDatum.value)}</span>
          </div>
        )}
      </div>
    </div>
  )
}
