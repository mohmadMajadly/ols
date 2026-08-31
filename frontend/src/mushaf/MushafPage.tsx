// المكوّن المركزي لعرض صفحة من صفحات مصحف المدينة (604 صفحة) بدقة قريبة من المطبوع:
// نص الآيات حصراً بخط QPC الخاص بتلك الصفحة (تحميل FontFace ديناميكي، لا وميض بخط بديل
// أبداً — DIRECTION §3)، بمحاذاة طرفين تحاكي التبييض المطبعي (flex space-between، والسطر
// القصير/المفرد متمركز)، وبنية كلمات قابلة للتظليل تحمل data-surah/ayah/word لاستهلاك خدمة
// التتبع الصوتي لاحقاً (WP9c).
//
// التحكم بالكامل عبر ref إمبراطوري (goToPage/highlight/clearHighlight): المكوّن يملك حالة
// "الصفحة المعروضة" و"التظليل الجاري" داخلياً؛ من يستضيفه (صفحة التصفح، لوحة الجلسة الحية،
// ولاحقاً خدمة التعرف في WP9c) لا يحتاج امتلاك هذه الحالة بنفسه — فقط ينادي
// ref.current.goToPage(n) إلخ. onPageChange اختياري لإبلاغ المستضيف بالصفحة الحالية (لعرضها
// في شريط تنقل خارجي أو حفظها في localStorage) دون أن يتحوّل هو إلى مصدر الحقيقة.

import { useQuery } from '@tanstack/react-query'
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import { ApiError } from '../api/client'
import type { MushafLine, MushafWord } from '../api/mushaf'
import { fetchMushafPage, MUSHAF_TOTAL_PAGES } from '../api/mushaf'
import { fetchSurahs } from '../api/quran'
import { buildSurahNameMap, surahLabel } from '../lib/surahName'
import { cx } from '../ui/utils'
import { loadPageFont, loadUthmanicFont, prefetchPageFont } from './fonts'
import { computeFitFontSize, measureLineNaturalWidths } from './measure'

// أقصى فجوة مسموحة بين كلمتين نسبةً لحجم الخط — بعدها يتمركز السطر بفجوات طبيعية
// بدل التمدد المشوّه (فراغات المصحف المطبوع ~0.25-0.4em؛ نسمح بهامش تبييض بسيط فوقها).
const MAX_WORD_GAP_EM = 0.55

export interface MushafHighlight {
  surah: number
  ayah: number
  /** كلمة بعينها داخل الآية — إن غابت تُظلَّل الآية كاملة بلون أخف. */
  word?: number
}

export interface MushafControlHandle {
  goToPage: (page: number) => void
  highlight: (pos: MushafHighlight) => void
  clearHighlight: () => void
  getPage: () => number
}

export interface MushafPageProps {
  initialPage: number
  initialHighlight?: MushafHighlight | null
  onPageChange?: (page: number) => void
  onWordClick?: (word: MushafWord) => void
  className?: string
}

function clampPage(n: number): number {
  return Math.min(MUSHAF_TOTAL_PAGES, Math.max(1, Math.round(n)))
}

const SKELETON_WIDTHS = ['92%', '76%', '88%', '65%', '95%', '82%', '70%', '90%', '60%', '85%', '78%', '94%', '68%', '88%', '55%']

export const MushafPage = forwardRef<MushafControlHandle, MushafPageProps>(function MushafPage(
  { initialPage, initialHighlight = null, onPageChange, onWordClick, className },
  ref,
) {
  const [page, setPage] = useState(() => clampPage(initialPage))
  const [highlight, setHighlight] = useState<MushafHighlight | null>(initialHighlight)
  const [pageFamily, setPageFamily] = useState<string | null>(null)
  const [uthmanicFamily, setUthmanicFamily] = useState<string | null>(null)
  const [box, setBox] = useState({ width: 0, height: 0 })
  const [visible, setVisible] = useState(false)

  const containerRef = useRef<HTMLDivElement>(null)
  const pageRef = useRef(page)
  pageRef.current = page

  useImperativeHandle(
    ref,
    () => ({
      goToPage: (n: number) => setPage(clampPage(n)),
      highlight: (pos: MushafHighlight) => setHighlight(pos),
      clearHighlight: () => setHighlight(null),
      getPage: () => pageRef.current,
    }),
    [],
  )

  useEffect(() => {
    onPageChange?.(page)
    // onPageChange عمداً خارج المصفوفة: تغييره لا يستدعي إبلاغاً مكرراً — يُنادى فقط عند
    // تغيّر الصفحة فعلياً.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page])

  // خط الصفحة الحالية + جلب مسبق هادئ لجاري الصفحتين (لا ينتظره أحد، تحسين تنقّل بحت).
  useEffect(() => {
    let cancelled = false
    setPageFamily(null)
    setVisible(false)
    loadPageFont(page).then((family) => {
      if (!cancelled) setPageFamily(family)
    })
    prefetchPageFont(page - 1)
    prefetchPageFont(page + 1)
    return () => {
      cancelled = true
    }
  }, [page])

  useEffect(() => {
    let cancelled = false
    loadUthmanicFont().then((family) => {
      if (!cancelled) setUthmanicFamily(family)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const dataQuery = useQuery({
    queryKey: ['mushaf', 'page', page],
    queryFn: () => fetchMushafPage(page),
    staleTime: Infinity,
  })

  const surahsQuery = useQuery({ queryKey: ['quran', 'surahs'], queryFn: fetchSurahs, staleTime: Infinity })
  const surahNames = useMemo(() => buildSurahNameMap(surahsQuery.data ?? []), [surahsQuery.data])

  useEffect(() => {
    const el = containerRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect
      if (rect) setBox({ width: rect.width, height: rect.height })
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const lineCount = dataQuery.data?.lines.length ?? 15

  const fontSize = useMemo(() => {
    if (!dataQuery.data || !pageFamily || box.width <= 0) return null
    return computeFitFontSize(dataQuery.data.lines, pageFamily, box.width, box.height, lineCount)
  }, [dataQuery.data, pageFamily, box.width, box.height, lineCount])

  // العرض الطبيعي لكل سطر عند الحجم المختار — لكبح تمديد الفجوات في المحاذاة أدناه
  const lineNaturalWidths = useMemo(() => {
    if (!dataQuery.data || !pageFamily || !fontSize) return new Map<number, number>()
    return measureLineNaturalWidths(dataQuery.data.lines, pageFamily, fontSize)
  }, [dataQuery.data, pageFamily, fontSize])

  const ready = Boolean(dataQuery.data && pageFamily && uthmanicFamily && fontSize)

  useEffect(() => {
    if (!ready) return
    const raf = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(raf)
  }, [ready])

  const surahsOnPage = useMemo(() => {
    if (!dataQuery.data) return [] as number[]
    const seen: number[] = []
    for (const line of dataQuery.data.lines) {
      const ids = line.type === 'surah_name' && line.surah ? [line.surah] : line.words.map((w) => w.surah)
      for (const s of ids) if (!seen.includes(s)) seen.push(s)
    }
    return seen
  }, [dataQuery.data])

  const headerLabel = surahsOnPage.length > 0 ? surahsOnPage.map((s) => `سورة ${surahLabel(surahNames, s)}`).join('  —  ') : ' '

  return (
    <div dir="rtl" className={cx('flex w-full flex-col', className)}>
      <p className="mb-1.5 truncate text-center text-sm text-hibr-2">{headerLabel}</p>

      <div
        className="mx-auto w-full max-w-[560px] rounded-card border border-khatt bg-waraq-raised px-4 py-5 sm:px-7 sm:py-7"
        style={{ aspectRatio: '0.68' }}
      >
        {dataQuery.isError ? (
          <div className="flex h-full items-center justify-center text-center text-sm text-khata-hifz">
            {dataQuery.error instanceof ApiError ? dataQuery.error.detail : 'تعذّر تحميل صفحة المصحف'}
          </div>
        ) : (
          <div ref={containerRef} className="flex h-full flex-col" aria-busy={!ready}>
            {ready && dataQuery.data ? (
              <div className={cx('flex h-full flex-col transition-opacity duration-150', visible ? 'opacity-100' : 'opacity-0')}>
                {dataQuery.data.lines.map((line) => (
                  <MushafLineView
                    key={line.line}
                    line={line}
                    pageFamily={pageFamily as string}
                    uthmanicFamily={uthmanicFamily as string}
                    fontSize={fontSize as number}
                    highlight={highlight}
                    onWordClick={onWordClick}
                    surahName={line.surah ? surahLabel(surahNames, line.surah) : ''}
                    naturalWidth={lineNaturalWidths.get(line.line)}
                    containerWidth={box.width}
                  />
                ))}
              </div>
            ) : (
              Array.from({ length: lineCount }).map((_, i) => <SkeletonLine key={i} index={i} />)
            )}
          </div>
        )}
      </div>

      <p className="mt-1.5 text-center font-time text-sm tabular-nums text-hibr-3">{page}</p>
    </div>
  )
})

function SkeletonLine({ index }: { index: number }) {
  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="h-4 animate-pulse rounded-full bg-khatt" style={{ width: SKELETON_WIDTHS[index % SKELETON_WIDTHS.length] }} />
    </div>
  )
}

function MushafLineView({
  line,
  pageFamily,
  uthmanicFamily,
  fontSize,
  highlight,
  onWordClick,
  surahName,
  naturalWidth,
  containerWidth,
}: {
  line: MushafLine
  pageFamily: string
  uthmanicFamily: string
  fontSize: number
  highlight: MushafHighlight | null
  onWordClick?: (word: MushafWord) => void
  surahName: string
  naturalWidth?: number
  containerWidth: number
}) {
  if (line.type === 'surah_name') {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="flex w-full items-center justify-center rounded-control border border-dhahab/55 py-1.5">
          <span dir="rtl" lang="ar" style={{ fontFamily: `"${uthmanicFamily}"`, fontSize: fontSize * 0.6 }} className="text-hibr">
            سورة {surahName}
          </span>
        </div>
      </div>
    )
  }

  if (line.type === 'basmala') {
    return (
      <div className="flex flex-1 items-center justify-center">
        <span dir="rtl" lang="ar" style={{ fontFamily: `"${uthmanicFamily}"`, fontSize: fontSize * 0.74 }} className="text-hibr">
          بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ
        </span>
      </div>
    )
  }

  // كبح تمديد الفجوات: المحاذاة بالطرفين فقط حين تكون الفجوة الناتجة ضمن الطبيعي؛
  // السطر القصير (كأسطر الفاتحة في لوحة ضيقة) يتمركز بفجوة مضبوطة بدل التشدد المشوّه.
  const gapCount = line.words.length - 1
  const maxGapPx = fontSize * MAX_WORD_GAP_EM
  const idealGap =
    gapCount > 0 && naturalWidth != null && containerWidth > 0
      ? (containerWidth - naturalWidth) / gapCount
      : 0
  const overstretched = line.centered || gapCount === 0 || idealGap > maxGapPx

  return (
    <AyahBandLine highlight={highlight} lineWords={line.words}>
      <div
        dir="rtl"
        className={cx('flex h-full w-full items-center', overstretched ? 'justify-center' : 'justify-between')}
        style={overstretched ? { columnGap: Math.min(maxGapPx, Math.max(idealGap, fontSize * 0.25)) } : undefined}
      >
        {line.words.map((word) => (
          <WordSpan
            key={`${word.surah}-${word.ayah}-${word.word}`}
            word={word}
            family={pageFamily}
            fontSize={fontSize}
            highlight={highlight}
            onWordClick={onWordClick}
          />
        ))}
      </div>
    </AyahBandLine>
  )
}

/**
 * شريط تظليل الآية ككتلة واحدة متصلة (طلب مستخدم صريح): بدل تلوين كل كلمة على
 * حدة — ما كان يقطّع الآية بصرياً ويشتت القارئ — نقيس امتداد كلمات الآية
 * المظللة داخل السطر ونرسم خلفها شريطاً واحداً متصلاً (لكل سطر شريطه، فالآية
 * الممتدة على أسطر تظهر كأشرطة متراصة). الكلمة الجارية تحتفظ بغسلتها الذهبية فوقه.
 */
function AyahBandLine({
  highlight,
  lineWords,
  children,
}: {
  highlight: MushafHighlight | null
  lineWords: MushafWord[]
  children: React.ReactNode
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [band, setBand] = useState<{ left: number; width: number } | null>(null)

  const hasHighlightOnLine =
    highlight != null && lineWords.some((w) => w.surah === highlight.surah && w.ayah === highlight.ayah)

  useLayoutEffect(() => {
    const host = hostRef.current
    if (!host || !hasHighlightOnLine) {
      setBand(null)
      return
    }
    const spans = host.querySelectorAll<HTMLElement>('span[data-highlighted]')
    if (spans.length === 0) {
      setBand(null)
      return
    }
    const hostRect = host.getBoundingClientRect()
    let left = Number.POSITIVE_INFINITY
    let right = Number.NEGATIVE_INFINITY
    spans.forEach((span) => {
      const r = span.getBoundingClientRect()
      left = Math.min(left, r.left - hostRect.left)
      right = Math.max(right, r.right - hostRect.left)
    })
    setBand({ left: Math.max(0, left - 5), width: right - left + 10 })
  }, [hasHighlightOnLine, highlight, lineWords])

  return (
    <div ref={hostRef} className="relative flex-1">
      {band && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute rounded-[6px] bg-lazward-100/70 transition-all duration-200"
          style={{ left: band.left, width: band.width, top: '8%', height: '84%' }}
        />
      )}
      {children}
    </div>
  )
}

function WordSpan({
  word,
  family,
  fontSize,
  highlight,
  onWordClick,
}: {
  word: MushafWord
  family: string
  fontSize: number
  highlight: MushafHighlight | null
  onWordClick?: (word: MushafWord) => void
}) {
  const ayahHi = highlight != null && highlight.surah === word.surah && highlight.ayah === word.ayah
  const wordHi = ayahHi && highlight?.word != null && highlight.word === word.word
  const clickable = Boolean(onWordClick)

  return (
    <span
      data-surah={word.surah}
      data-ayah={word.ayah}
      data-word={word.word}
      data-highlighted={wordHi ? 'word' : ayahHi ? 'ayah' : undefined}
      dir="rtl"
      lang="ar"
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={clickable ? () => onWordClick?.(word) : undefined}
      onKeyDown={
        clickable
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                onWordClick?.(word)
              }
            }
          : undefined
      }
      style={{ fontFamily: `"${family}"`, fontSize }}
      className={cx(
        // relative: كي تُرسم الكلمات فوق شريط الآية المطلق (AyahBandLine)
        'relative inline-block rounded-[3px] px-0.5 leading-none text-hibr transition-colors duration-150',
        clickable && 'cursor-pointer',
        // الكلمة الجارية وحدها تحمل غسلة ذهبية؛ تظليل الآية صار شريطاً متصلاً
        // خلف السطر كله (AyahBandLine) بدل تقطيع كل كلمة على حدة
        wordHi && 'bg-dhahab/30',
      )}
    >
      {word.glyph}
    </span>
  )
}
