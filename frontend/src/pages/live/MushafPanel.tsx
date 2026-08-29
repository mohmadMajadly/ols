// لوحة المصحف داخل شاشة الجلسة الحية (WP9b §3). يستضيفها LiveSessionPage إما كعمود جانبي
// (شاشات واسعة) أو تمدّداً فوق منطقة أزرار الملاحظات (موبايل) — الموضع الفعلي من مسؤولية
// المستضيف؛ هذا المكوّن نفسه لا يفترض شيئاً عن حاويته. تُهيَّأ من صفحة بداية نطاق الجلسة
// (page-for) إن وُجد نطاق، وإلا آخر صفحة تصفّحها المستخدم على هذا الجهاز — تُشارك نفس مفتاح
// localStorage مع صفحة /mushaf المستقلة.

import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'

import { fetchMushafPageFor } from '../../api/mushaf'
import { getLastMushafPage, setLastMushafPage } from '../../mushaf/lastPage'
import type { MushafControlHandle } from '../../mushaf/MushafPage'
import { MushafPage } from '../../mushaf/MushafPage'
import { IconChevronLeft, IconChevronRight, IconClose } from '../../ui/icons'
import { Spinner } from '../../ui/Spinner'

export interface MushafPanelProps {
  rangeStartSurah: number | null
  rangeStartAyah: number | null
  onClose: () => void
  /** يُبلَّغ بمقبض التحكم بعد جاهزيته — نقطة الربط الجاهزة لخدمة التتبع الصوتي (WP9c). */
  onControlReady?: (handle: MushafControlHandle) => void
  className?: string
}

export function MushafPanel({ rangeStartSurah, rangeStartAyah, onClose, onControlReady, className }: MushafPanelProps) {
  const [startPage, setStartPage] = useState<number | null>(null)
  const controlRef = useRef<MushafControlHandle>(null)
  const resolvedRef = useRef(false)

  const hasRange = rangeStartSurah != null && rangeStartAyah != null
  const pageForQuery = useQuery({
    queryKey: ['mushaf', 'page-for', rangeStartSurah, rangeStartAyah],
    queryFn: () => fetchMushafPageFor(rangeStartSurah as number, rangeStartAyah as number),
    enabled: hasRange,
    staleTime: Infinity,
  })

  useEffect(() => {
    if (resolvedRef.current) return
    if (hasRange) {
      if (pageForQuery.data) {
        resolvedRef.current = true
        setStartPage(pageForQuery.data.page)
      } else if (pageForQuery.isError) {
        // تعذّر تحديد صفحة النطاق (نادر) — نتراجع لآخر صفحة متصفَّحة بدل تعطيل اللوحة كلياً.
        resolvedRef.current = true
        setStartPage(getLastMushafPage())
      }
    } else {
      resolvedRef.current = true
      setStartPage(getLastMushafPage())
    }
  }, [hasRange, pageForQuery.data, pageForQuery.isError])

  function handleControlAttach(handle: MushafControlHandle | null) {
    controlRef.current = handle
    if (handle) onControlReady?.(handle)
  }

  if (startPage == null) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner tone="lazward" />
      </div>
    )
  }

  return (
    <div className={className}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => controlRef.current?.goToPage(controlRef.current.getPage() - 1)}
            aria-label="الصفحة السابقة"
            className="flex h-8 w-8 items-center justify-center rounded-control text-hibr-2 hover:bg-lazward-100/40 hover:text-hibr"
          >
            <IconChevronRight className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => controlRef.current?.goToPage(controlRef.current.getPage() + 1)}
            aria-label="الصفحة التالية"
            className="flex h-8 w-8 items-center justify-center rounded-control text-hibr-2 hover:bg-lazward-100/40 hover:text-hibr"
          >
            <IconChevronLeft className="h-4 w-4" />
          </button>
        </div>
        <span className="text-sm font-medium text-hibr">المصحف</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="إغلاق المصحف"
          className="flex h-8 w-8 items-center justify-center rounded-control text-hibr-3 hover:bg-lazward-100/40 hover:text-hibr"
        >
          <IconClose className="h-4 w-4" />
        </button>
      </div>

      <MushafPage
        ref={(handle) => handleControlAttach(handle)}
        initialPage={startPage}
        onPageChange={setLastMushafPage}
      />
    </div>
  )
}
