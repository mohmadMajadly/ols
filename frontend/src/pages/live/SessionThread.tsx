// خيط الجلسة — التوقيع البصري الأساسي للمنصة (DIRECTION.md §5): شريط أفقي رفيع يمثل
// الزمن من 0 إلى الآن، عليه خرزات دائرية صغيرة بلون فئة كل ملاحظة، تسقط بحركة قصيرة
// (≤200ms، مُعطَّلة تلقائياً مع reduced-motion عبر القاعدة العامة) عند الإضافة. اتجاه
// الزمن LTR دوماً (خط زمني تقليدي) بصرف النظر عن اتجاه الصفحة RTL.

import { useRef, useState } from 'react'

import { formatDuration } from '../../lib/formatDuration'
import { noteSolidDotClass } from '../../lib/noteColors'
import { cx } from '../../ui/utils'

export interface ThreadNote {
  id: string
  timestamp_ms: number
  color: string
  categoryName: string
  pending?: boolean
}

export function SessionThread({ notes, elapsedMs }: { notes: ThreadNote[]; elapsedMs: number }) {
  const [tooltipId, setTooltipId] = useState<string | null>(null)
  const pressTimer = useRef<number | null>(null)
  const total = Math.max(elapsedMs, 1000)

  function clearPressTimer() {
    if (pressTimer.current !== null) {
      window.clearTimeout(pressTimer.current)
      pressTimer.current = null
    }
  }

  return (
    <div className="w-full px-4 pb-4 pt-7" data-testid="session-thread">
      <div className="relative h-6" dir="ltr">
        <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-khatt" aria-hidden="true" />
        {notes.map((note) => {
          const pct = Math.min(100, Math.max(0, (note.timestamp_ms / total) * 100))
          return (
            <button
              key={note.id}
              type="button"
              data-testid="thread-bead"
              className={cx(
                'absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-waraq',
                noteSolidDotClass(note.color),
                note.pending && 'opacity-60',
              )}
              style={{ left: `${pct}%`, animation: 'bead-drop 200ms ease-out' }}
              onMouseEnter={() => setTooltipId(note.id)}
              onMouseLeave={() => setTooltipId((id) => (id === note.id ? null : id))}
              onTouchStart={() => {
                pressTimer.current = window.setTimeout(() => setTooltipId(note.id), 400)
              }}
              onTouchEnd={() => {
                clearPressTimer()
                window.setTimeout(() => setTooltipId((id) => (id === note.id ? null : id)), 1500)
              }}
              aria-label={`${note.categoryName} — ${formatDuration(note.timestamp_ms)}`}
            >
              {tooltipId === note.id && (
                <span
                  dir="rtl"
                  className="pointer-events-none absolute bottom-full start-1/2 z-10 mb-2 -translate-x-1/2 whitespace-nowrap rounded-control border border-khatt bg-waraq-raised px-2 py-1 text-xs text-hibr shadow-float"
                >
                  {note.categoryName} · {formatDuration(note.timestamp_ms)}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
