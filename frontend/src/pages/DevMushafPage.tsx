// صفحة تحقق بصري مؤقتة (WP9a): تعرض صفحة من صفحات مصحف المدينة الـ604 بخطها
// الخاص (QPC V2)، سطراً-بسطر خاماً بلا أي تصميم نهائي (ذلك WP9b). الغرض
// الوحيد: مقارنة عينية بالعين المجرّدة مع صور مصحف المدينة المطبوع.
// Route غير محمي، يظهر فقط في DEV (مثل /dev/ui) — راجع routes.tsx.

import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'

import { apiClient, ApiError } from '../api/client'

interface MushafWord {
  surah: number
  ayah: number
  word: number
  text_uthmani: string
  glyph: string
  is_ayah_marker: boolean
}

interface MushafLine {
  line: number
  type: 'surah_name' | 'basmala' | 'ayah'
  surah?: number | null
  centered: boolean
  words: MushafWord[]
}

interface MushafPage {
  page: number
  lines: MushafLine[]
}

const TOTAL_PAGES = 604
// خط عام (لا رموز خاصة) لعرض أسطر البسملة/اسم السورة، التي لا تُرسَم برموز
// خط الصفحة (راجع تعليق مصدر الخطوط في scripts/fetch-mushaf-assets.mjs).
const UTHMANIC_FAMILY = 'uthmanic-hafs'
const UTHMANIC_URL = '/fonts/qpc-v2/uthmanic-hafs.woff2'

export function DevMushafPage() {
  const params = useParams<{ page: string }>()
  const pageNumber = Number(params.page)
  const [data, setData] = useState<MushafPage | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fontReady, setFontReady] = useState(false)

  const [surahNames, setSurahNames] = useState<Record<number, string>>({})

  const valid = Number.isInteger(pageNumber) && pageNumber >= 1 && pageNumber <= TOTAL_PAGES
  const nnn = String(pageNumber).padStart(3, '0')
  const fontFamily = `qpc-page-${nnn}`
  const fontUrl = `/fonts/qpc-v2/p${nnn}.woff2`

  useEffect(() => {
    apiClient
      .get<{ number: number; name: string }[]>('/quran/surahs')
      .then((surahs) => {
        setSurahNames(Object.fromEntries(surahs.map((s) => [s.number, s.name])))
      })
      .catch(() => {
        /* ثانوي لعرض التحقق البصري فقط — يظهر رقم السورة إن تعذّر */
      })
  }, [])

  useEffect(() => {
    setData(null)
    setError(null)
    setFontReady(false)
    if (!valid) return

    apiClient
      .get<MushafPage>(`/mushaf/pages/${pageNumber}`)
      .then(setData)
      .catch((err: unknown) => {
        if (err instanceof ApiError) {
          setError(err.status === 401 ? 'سجّل الدخول أولاً من /login بحساب طاقم، ثم عد لهذا الرابط.' : err.detail)
        } else {
          setError('خطأ غير متوقع')
        }
      })

    const face = new FontFace(fontFamily, `url(${fontUrl})`)
    const needsUthmanic = !document.fonts.check(`16px ${UTHMANIC_FAMILY}`)
    const loaders = [face.load()]
    if (needsUthmanic) {
      loaders.push(new FontFace(UTHMANIC_FAMILY, `url(${UTHMANIC_URL})`).load())
    }
    Promise.all(loaders)
      .then((loaded) => {
        loaded.forEach((f) => document.fonts.add(f))
        setFontReady(true)
      })
      .catch(() => {
        // لا تمنع عرض النص إن تعذّر تحميل الخط (مثلاً لم تُجلب الخطوط بعد)
        setFontReady(true)
      })
  }, [pageNumber, valid, fontFamily, fontUrl])

  if (!valid) {
    return (
      <div dir="rtl" className="p-8 font-sans text-hibr">
        رقم صفحة غير صحيح — يجب أن يكون بين 1 و{TOTAL_PAGES}.
      </div>
    )
  }

  return (
    <div dir="rtl" className="min-h-screen bg-waraq p-6 font-sans text-hibr">
      <div className="mb-4 flex items-center justify-between text-sm text-hibr/70">
        <span>
          صفحة {pageNumber} / {TOTAL_PAGES} — تحقق بصري خام (WP9a، بلا تصميم نهائي)
        </span>
        <div className="flex gap-3">
          {pageNumber > 1 && <a href={`/dev/mushaf/${pageNumber - 1}`}>← السابقة</a>}
          {pageNumber < TOTAL_PAGES && <a href={`/dev/mushaf/${pageNumber + 1}`}>التالية →</a>}
        </div>
      </div>

      {error && <div className="mb-4 rounded border border-red-400 bg-red-50 p-3 text-red-700">{error}</div>}

      {data && (
        <div
          className="mx-auto flex max-w-3xl flex-col gap-1 rounded border border-khatt bg-white p-8"
          style={{ opacity: fontReady ? 1 : 0 }}
        >
          {data.lines.map((line) => (
            <div key={line.line} className="flex items-baseline justify-center gap-2 text-center" style={{ minHeight: '2.6rem' }}>
              {line.type === 'surah_name' && (
                <span
                  className="rounded bg-lazward-700/10 px-3 py-1 text-lg text-lazward-700"
                  style={{ fontFamily: `${UTHMANIC_FAMILY}, serif` }}
                >
                  سورة {line.surah ? (surahNames[line.surah] ?? line.surah) : ''}
                </span>
              )}
              {line.type === 'basmala' && (
                <span style={{ fontFamily: `${UTHMANIC_FAMILY}, serif`, fontSize: '2rem', lineHeight: 1.6 }}>
                  بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ
                </span>
              )}
              {line.type === 'ayah' && (
                <span style={{ fontFamily: `${fontFamily}, serif`, fontSize: '1.9rem', lineHeight: 2 }} lang="ar">
                  {line.words.map((w, i) => (
                    <span key={i}>{w.glyph}</span>
                  ))}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
