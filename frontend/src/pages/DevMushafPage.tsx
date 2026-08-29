// صفحة تحقق تطويرية (DEV فقط، مثل /dev/ui) — WP9b: تستضيف MushafPage النهائي وتعرض أزرار
// لتجربة التظليل البرمجي (آية/كلمة عشوائية أو موضع محدد) والتنقل، للتحقق الذاتي البصري
// والبرمجي عبر Playwright. لا استخدام حقيقي لها — الاستهلاك الفعلي عبر /mushaf ولوحة
// المصحف داخل الجلسة الحية. تُعرِّض window.__mushafControl في DEV فقط لتمكين Playwright من
// نداء goToPage/highlight/clearHighlight مباشرة بلا محاكاة نقرات.

import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'

import { fetchMushafPage, MUSHAF_TOTAL_PAGES } from '../api/mushaf'
import type { MushafControlHandle } from '../mushaf/MushafPage'
import { MushafPage } from '../mushaf/MushafPage'
import { Button } from '../ui/Button'

declare global {
  interface Window {
    __mushafControl?: MushafControlHandle
  }
}

export function DevMushafPage() {
  const params = useParams<{ page: string }>()
  const requestedPage = Number(params.page)
  const valid = Number.isInteger(requestedPage) && requestedPage >= 1 && requestedPage <= MUSHAF_TOTAL_PAGES

  const controlRef = useRef<MushafControlHandle>(null)
  const [currentPage, setCurrentPage] = useState(valid ? requestedPage : 1)
  const [lastAction, setLastAction] = useState<string | null>(null)

  useEffect(() => {
    if (import.meta.env.DEV) {
      window.__mushafControl = controlRef.current ?? undefined
    }
    return () => {
      if (import.meta.env.DEV) window.__mushafControl = undefined
    }
  }, [])

  const dataQuery = useQuery({
    queryKey: ['mushaf', 'page', currentPage],
    queryFn: () => fetchMushafPage(currentPage),
    staleTime: Infinity,
    enabled: valid,
  })

  const words = useMemo(() => dataQuery.data?.lines.flatMap((line) => line.words) ?? [], [dataQuery.data])

  function highlightRandomAyah() {
    if (words.length === 0) return
    const w = words[Math.floor(Math.random() * words.length)]
    controlRef.current?.highlight({ surah: w.surah, ayah: w.ayah })
    setLastAction(`تظليل آية: ${w.surah}:${w.ayah}`)
  }

  function highlightRandomWord() {
    if (words.length === 0) return
    const w = words[Math.floor(Math.random() * words.length)]
    controlRef.current?.highlight({ surah: w.surah, ayah: w.ayah, word: w.word })
    setLastAction(`تظليل كلمة: ${w.surah}:${w.ayah} #${w.word}`)
  }

  if (!valid) {
    return (
      <div dir="rtl" className="p-8 font-sans text-hibr">
        رقم صفحة غير صحيح — يجب أن يكون بين 1 و{MUSHAF_TOTAL_PAGES}.
      </div>
    )
  }

  return (
    <div dir="rtl" className="min-h-screen bg-waraq p-6 font-sans text-hibr">
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-hibr-2">
          <span>تحقق تطويري (WP9b) — MushafPage النهائي بأزرار تجريب تظليل برمجي</span>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => controlRef.current?.goToPage(currentPage - 1)}>
              ← صفحة سابقة
            </Button>
            <Button size="sm" variant="secondary" onClick={() => controlRef.current?.goToPage(currentPage + 1)}>
              صفحة تالية →
            </Button>
            <Button size="sm" onClick={highlightRandomAyah} data-testid="dev-highlight-ayah">
              ظلّل آية عشوائية
            </Button>
            <Button size="sm" onClick={highlightRandomWord} data-testid="dev-highlight-word">
              ظلّل كلمة عشوائية
            </Button>
            <Button size="sm" variant="ghost" onClick={() => controlRef.current?.clearHighlight()} data-testid="dev-clear-highlight">
              امسح التظليل
            </Button>
          </div>
        </div>
        {lastAction && (
          <p className="text-sm text-lazward-700" data-testid="dev-last-action">
            {lastAction}
          </p>
        )}
        <MushafPage ref={controlRef} initialPage={currentPage} onPageChange={setCurrentPage} />
      </div>
    </div>
  )
}
