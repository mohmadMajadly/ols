// لوحة سفلية منزلقة (bottom sheet) — نظير Modal لكنها ترتكز على أسفل الشاشة وتنزلق
// صعوداً عند الفتح. تُستخدم في شاشة الجلسة الحية لتدوين الملاحظة الموقوتة: مساحة أوسع
// وأسهل بلمسة إبهام واحدة من نافذة مركزية. نفس منطق حبس التركيز وEsc والنقر خارجاً كـModal.

import type { ReactNode } from 'react'
import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

import { IconClose } from './icons'
import { cx } from './utils'

export interface BottomSheetProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function BottomSheet({ open, onClose, title, children, footer }: BottomSheetProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  // onClose غالباً دالة سهمية تتجدد مع كل إعادة رسم للصفحة الأم؛ نثبتها في ref حتى لا
  // يُعاد تشغيل تأثير مصيدة التركيز مع كل حرف يُكتب في حقول اللوحة (نص حر/حقول مخصصة) —
  // نفس الإصلاح المطبَّق في Modal.tsx.
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    if (!open) return

    const previouslyFocused = document.activeElement as HTMLElement | null
    const panel = panelRef.current
    const focusables = Array.from(panel?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? [])
    // التركيز الأولي: أول عنصر بعد زر الإغلاق (أول حقل عادةً)، لا الزر نفسه
    const initial = focusables.find((el) => el.getAttribute('aria-label') !== 'إغلاق')
    ;(initial ?? panel)?.focus()

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab' || !panel) return

      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      previouslyFocused?.focus()
    }
  }, [open])

  if (!open) return null

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ background: 'rgb(20 28 63 / 0.45)' }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sheet-title"
        tabIndex={-1}
        className={cx(
          'flex max-h-[85vh] w-full flex-col overflow-hidden rounded-t-card',
          'border-x border-t border-khatt bg-waraq-raised shadow-float outline-none sm:mx-auto sm:max-w-[480px]',
        )}
        style={{ animation: 'sheet-in 200ms ease-out' }}
      >
        <div className="flex items-start justify-between gap-3 border-b border-khatt px-5 py-4">
          <h2 id="sheet-title" className="font-ui text-lg font-semibold text-hibr">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="-m-1 rounded-control p-1 text-hibr-3 hover:bg-lazward-100/40 hover:text-hibr-2"
          >
            <IconClose className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 text-hibr">{children}</div>

        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-khatt px-5 py-4">{footer}</div>
        )}
      </div>
    </div>,
    document.body,
  )
}
