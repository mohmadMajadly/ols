// مخطط أعمدة أفقية (SVG يدوي) — للأسماء العربية الطويلة (فئات الأخطاء وما شابه). RTL:
// الأعمدة تنمو من اليمين (docs/design/DIRECTION.md §«الشكل والبنية»). علامة رفيعة
// بارتفاع ≤24px، نهاية مدوّرة 4px من جهة القيمة فقط، لون كل عمود من توكن الفئة
// (--chart-*)، تسمية القيمة رقماً بلون الحبر (لا بلون السلسلة) عند نهاية العمود، tooltip
// لكل عمود، محور واحد (خط الأصل).

import { useState } from 'react'

import { EmptyState } from '../ui/EmptyState'
import { roundedRectPathLeft } from './chartUtils'

export interface BarChartHDatum {
  id: string
  label: string
  value: number
  /** توكن لون CSS كسلسلة نصية، مثال: var(--chart-hifz) — لا hex حرفي */
  color?: string
}

export interface BarChartHProps {
  data: BarChartHDatum[]
  emptyLabel?: string
  valueFormatter?: (v: number) => string
  className?: string
}

const W = 520
const ROW_H = 34
const BAR_H = 20
const LABEL_W = 132
const VALUE_GUTTER = 34
const RADIUS = 4

export function BarChartH({ data, emptyLabel = 'لا بيانات كافية بعد', valueFormatter, className }: BarChartHProps) {
  const [hoverId, setHoverId] = useState<string | null>(null)

  if (data.length === 0) {
    return <EmptyState message={emptyLabel} className={className} />
  }

  const maxValue = Math.max(...data.map((d) => d.value), 1)
  const barAreaRight = W - LABEL_W
  const barAreaLeft = VALUE_GUTTER
  const barAreaWidth = Math.max(0, barAreaRight - barAreaLeft)
  const H = data.length * ROW_H

  const format = valueFormatter ?? ((v: number) => String(v))
  const hoveredDatum = data.find((d) => d.id === hoverId) ?? null
  const hoveredIndex = hoveredDatum ? data.indexOf(hoveredDatum) : -1

  return (
    <div className={className}>
      <div className="relative w-full">
      {/* direction: ltr إلزامي — بلا هذا، يرث <svg> اتجاه RTL من الصفحة فتنقلب دلالة
          text-anchor start/end (end تصبح فعلياً اليسار) فيُقصّ نص التسمية عند حافة
          viewBox بدل الامتداد داخله؛ حسابات الإحداثيات هنا يدوية ومقصودة LTR دوماً. */}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block w-full"
        style={{ height: H, direction: 'ltr' }}
        role="img"
        aria-label="مخطط أعمدة أفقية"
      >
        {/* محور واحد: خط الأصل عند حافة منطقة الأعمدة اليمنى */}
        <line x1={barAreaRight} y1={0} x2={barAreaRight} y2={H} className="stroke-khatt" strokeWidth={1} />

        {data.map((d, i) => {
          const fraction = maxValue > 0 ? d.value / maxValue : 0
          const barLen = fraction * barAreaWidth
          const barX = barAreaRight - barLen
          const barY = i * ROW_H + (ROW_H - BAR_H) / 2
          const path = roundedRectPathLeft(barX, barY, barLen, BAR_H, RADIUS)
          const color = d.color ?? 'var(--lazward-700)'
          const hovered = hoverId === d.id

          return (
            <g
              key={d.id}
              onPointerEnter={() => setHoverId(d.id)}
              onPointerLeave={() => setHoverId((id) => (id === d.id ? null : id))}
            >
              {/* شريط شفاف عريض للتحويم — أسهل استهدافاً من العمود الرفيع نفسه */}
              <rect x={0} y={i * ROW_H} width={W} height={ROW_H} fill="transparent" />
              {barLen > 0 && <path d={path} style={{ fill: color, opacity: hovered ? 0.85 : 1 }} />}
              <text
                x={W - 4}
                y={barY + BAR_H / 2}
                textAnchor="end"
                dominantBaseline="middle"
                className="fill-hibr text-sm font-medium"
              >
                {d.label}
              </text>
              <text
                x={Math.max(barAreaLeft - 6, barX - 6)}
                y={barY + BAR_H / 2}
                textAnchor="end"
                dominantBaseline="middle"
                className="fill-hibr font-time text-sm tabular-nums"
              >
                {format(d.value)}
              </text>
            </g>
          )
        })}
      </svg>

        {hoveredDatum && hoveredIndex >= 0 && (
          <div
            className="pointer-events-none absolute z-10 -translate-y-1/2 whitespace-nowrap rounded-control border border-khatt bg-waraq-raised px-2.5 py-1.5 text-sm text-hibr shadow-float"
            style={{
              top: `${((hoveredIndex + 0.5) / data.length) * 100}%`,
              insetInlineEnd: `${(LABEL_W / W) * 100}%`,
              marginInlineEnd: '6px',
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
