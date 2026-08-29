// صفحة تصفح المصحف المستقلة (/mushaf) — متاحة للطاقم وللطالب معاً (بيانات مصحف عامة غير
// حساسة). تنقل كامل: أسهم سابق/تالي بالاتجاه الصحيح RTL (التالي جهة اليسار)، إدخال رقم
// صفحة مباشر، قفز «إلى موضع» (سورة + آية عبر page-for)، لوحة مفاتيح (أسهم يمين/يسار)،
// وسحب باللمس على الموبايل. تتذكّر آخر صفحة زارها المستخدم على هذا الجهاز (localStorage).

import { useQuery } from '@tanstack/react-query'
import { type FormEvent, useEffect, useRef, useState } from 'react'

import { fetchMushafPageFor, MUSHAF_TOTAL_PAGES } from '../api/mushaf'
import { fetchSurahs } from '../api/quran'
import { getLastMushafPage, setLastMushafPage } from '../mushaf/lastPage'
import type { MushafControlHandle } from '../mushaf/MushafPage'
import { MushafPage } from '../mushaf/MushafPage'
import { Button } from '../ui/Button'
import { IconChevronLeft, IconChevronRight } from '../ui/icons'
import { PageHeader } from '../ui/PageHeader'
import { Select } from '../ui/Select'
import { TextField } from '../ui/TextField'

const SWIPE_THRESHOLD_PX = 48

export function MushafBrowsePage() {
  const controlRef = useRef<MushafControlHandle>(null)
  const [page, setPage] = useState(() => getLastMushafPage())
  const [pageInput, setPageInput] = useState(() => String(getLastMushafPage()))
  const [jumpSurah, setJumpSurah] = useState('')
  const [jumpAyah, setJumpAyah] = useState('')
  const [jumpError, setJumpError] = useState<string | null>(null)
  const [jumping, setJumping] = useState(false)
  const touchStartX = useRef<number | null>(null)

  const surahsQuery = useQuery({ queryKey: ['quran', 'surahs'], queryFn: fetchSurahs, staleTime: Infinity })

  function goTo(n: number) {
    controlRef.current?.goToPage(n)
  }

  function handlePageChange(n: number) {
    setPage(n)
    setPageInput(String(n))
    setLastMushafPage(n)
  }

  function commitPageInput() {
    const n = Number(pageInput)
    if (Number.isInteger(n) && n >= 1 && n <= MUSHAF_TOTAL_PAGES) goTo(n)
    else setPageInput(String(page))
  }

  function handlePageInputSubmit(event: FormEvent) {
    event.preventDefault()
    commitPageInput()
  }

  async function handleJump(event: FormEvent) {
    event.preventDefault()
    const surah = Number(jumpSurah)
    const ayah = Number(jumpAyah)
    if (!surah || !ayah) return
    setJumpError(null)
    setJumping(true)
    try {
      const result = await fetchMushafPageFor(surah, ayah)
      goTo(result.page)
    } catch {
      setJumpError('تعذّر تحديد صفحة هذا الموضع')
    } finally {
      setJumping(false)
    }
  }

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      const tag = (event.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
      // RTL: السهم الأيسر = جهة التالي (أعمق في المصحف)، الأيمن = جهة السابق.
      if (event.key === 'ArrowLeft') goTo(page + 1)
      else if (event.key === 'ArrowRight') goTo(page - 1)
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [page])

  const selectedSurah = surahsQuery.data?.find((s) => String(s.number) === jumpSurah)

  return (
    <div>
      <PageHeader title="المصحف" description="تصفّح صفحات مصحف المدينة الـ604 (رواية حفص عن عاصم)" />

      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => goTo(page - 1)} disabled={page <= 1}>
            <IconChevronRight className="h-4 w-4" />
            السابقة
          </Button>
          <form onSubmit={handlePageInputSubmit} className="w-20">
            <TextField
              label="الصفحة"
              inputMode="numeric"
              value={pageInput}
              onChange={(event) => setPageInput(event.target.value)}
              onBlur={commitPageInput}
              className="text-center font-time tabular-nums"
            />
          </form>
          <Button variant="secondary" size="sm" onClick={() => goTo(page + 1)} disabled={page >= MUSHAF_TOTAL_PAGES}>
            التالية
            <IconChevronLeft className="h-4 w-4" />
          </Button>
        </div>

        <form onSubmit={handleJump} className="flex flex-wrap items-end gap-2">
          <Select
            label="اذهب إلى موضع — سورة"
            placeholder="اختر سورة"
            options={(surahsQuery.data ?? []).map((s) => ({ value: String(s.number), label: s.name }))}
            value={jumpSurah}
            onChange={(event) => {
              setJumpSurah(event.target.value)
              setJumpAyah('')
            }}
            className="w-44"
          />
          <TextField
            label="آية"
            inputMode="numeric"
            value={jumpAyah}
            onChange={(event) => setJumpAyah(event.target.value)}
            min={1}
            max={selectedSurah?.ayah_count}
            className="w-20 text-center font-time tabular-nums"
          />
          <Button type="submit" variant="secondary" size="sm" loading={jumping} disabled={!jumpSurah || !jumpAyah}>
            اذهب
          </Button>
        </form>
      </div>

      {jumpError && <p className="mb-4 text-sm text-khata-hifz">{jumpError}</p>}

      <div
        onTouchStart={(event) => {
          touchStartX.current = event.touches[0]?.clientX ?? null
        }}
        onTouchEnd={(event) => {
          if (touchStartX.current == null) return
          const endX = event.changedTouches[0]?.clientX ?? touchStartX.current
          const dx = endX - touchStartX.current
          touchStartX.current = null
          if (Math.abs(dx) < SWIPE_THRESHOLD_PX) return
          // سحب لليسار (dx سالب) = جهة التالي؛ لليمين = جهة السابق.
          if (dx < 0) goTo(page + 1)
          else goTo(page - 1)
        }}
      >
        <MushafPage ref={controlRef} initialPage={page} onPageChange={handlePageChange} />
      </div>
    </div>
  )
}
