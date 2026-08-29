// شاشة الجلسة الحية — عالم الورق كسائر التطبيق (قرار المستخدم 2026-08-29؛ هويتها
// الخاصة: التذهيب — هالة التلاوة الذهبية على الورق). ملء الشاشة، بلا AppShell.
// أهم شاشة في المنتج:
// المعلم يضغط زر تصنيف فتُلتقط اللحظة الزمنية فوراً (captureTimestamp في نفس معالج
// النقرة، قبل فتح اللوحة السفلية) ثم يدوّن تفاصيلها بلا استعجال. المحرك (recorderEngine
// وuseSessionRecorder) يُستهلك كما هو — كل رفع/إنهاء/إلغاء يمر حصراً عبره.

import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'

import type { MushafWord } from '../../api/mushaf'
import { fetchMushafPageFor } from '../../api/mushaf'
import { ApiError } from '../../api/client'
import { createNote } from '../../api/notes'
import { fetchSurahs } from '../../api/quran'
import type { Attendance, SessionDetail } from '../../api/sessions'
import { fetchActiveSession, fetchSession } from '../../api/sessions'
import type { NoteCategory } from '../../api/taxonomy'
import { fetchTaxonomy } from '../../api/taxonomy'
import { fetchExpectedWords } from '../../api/tracking'
import { formatDuration } from '../../lib/formatDuration'
import { useMediaQuery } from '../../lib/useMediaQuery'
import { notePaperAccentClasses } from '../../lib/noteColors'
import { attendanceLabels, sessionTypeLabels } from '../../lib/sessionLabels'
import type { MushafControlHandle } from '../../mushaf/MushafPage'
import type { TrackingPosition, TrackingStatus } from '../../session/trackingClient'
import { TrackingClient } from '../../session/trackingClient'
import { useSessionRecorder } from '../../session/useSessionRecorder'
import { AyahChip } from '../../ui/AyahChip'
import { BottomSheet } from '../../ui/BottomSheet'
import { Button } from '../../ui/Button'
import { IconAlertCircle, IconBook, IconMic, IconTracking } from '../../ui/icons'
import { Modal } from '../../ui/Modal'
import { Select } from '../../ui/Select'
import { Spinner } from '../../ui/Spinner'
import { TextArea } from '../../ui/TextArea'
import { useToast } from '../../ui/Toast'
import { cx } from '../../ui/utils'
import { MushafPanel } from './MushafPanel'
import type { NoteFormState } from './NoteSheetContent'
import { NoteSheetContent } from './NoteSheetContent'
import { RecitationHalo } from './RecitationHalo'
import type { ThreadNote } from './SessionThread'
import { SessionThread } from './SessionThread'

function AcquiringScreen({ studentName }: { studentName?: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-waraq px-6 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-dhahab/60">
        <IconMic className="h-7 w-7 text-dhahab" />
      </span>
      <p className="font-display text-xl text-hibr">بانتظار إذن الميكروفون</p>
      <p className="max-w-xs text-sm text-hibr-2">
        يرجى السماح لهذا المتصفح باستخدام الميكروفون من نافذة الإذن الظاهرة لبدء تسجيل جلسة{' '}
        {studentName ? `«${studentName}»` : ''}. إن لم تظهر نافذة الإذن، تحقق من إعدادات الموقع في المتصفح.
      </p>
      <Spinner tone="lazward" size={26} />
    </div>
  )
}

function ErrorScreen({ message, onBack }: { message: string | null; onBack: () => void }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-waraq px-6 text-center">
      <IconAlertCircle className="h-10 w-10 text-khata-hifz" />
      <p className="font-display text-xl text-hibr">تعذّر إكمال الجلسة</p>
      <p className="max-w-sm text-sm text-hibr-2">{message ?? 'حدث خطأ غير متوقع، يرجى المحاولة مرة أخرى'}</p>
      <Button variant="secondary" onClick={onBack}>
        عودة إلى سجل الجلسات
      </Button>
    </div>
  )
}

export function LiveSessionPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const toast = useToast()
  const recorder = useSessionRecorder()
  const {
    snapshot,
    level,
    elapsedMs,
    spectrumRef,
    start,
    finalize,
    cancel,
    captureTimestamp,
    getMediaStream,
  } = recorder

  const [sessionInfo, setSessionInfo] = useState<SessionDetail | null>(null)
  const [threadNotes, setThreadNotes] = useState<ThreadNote[]>([])

  const [activeCategory, setActiveCategory] = useState<NoteCategory | null>(null)
  const [noteForm, setNoteForm] = useState<NoteFormState | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)

  const [finishOpen, setFinishOpen] = useState(false)
  const [finishSummary, setFinishSummary] = useState('')
  const [finishAttendance, setFinishAttendance] = useState<Attendance>('hadir')
  const [cancelOpen, setCancelOpen] = useState(false)

  // لوحة المصحف (WP9b §3): عمود جانبي على الشاشات الواسعة، تمدّد فوق منطقة الأزرار على
  // الموبايل — isWide يختار مكان عرض نسخة اللوحة الوحيدة (لا نُركّب نسختين معاً أبداً).
  const [mushafOpen, setMushafOpen] = useState(false)
  const isWide = useMediaQuery('(min-width: 1024px)')
  const mushafControlRef = useRef<MushafControlHandle | null>(null)

  // التتبع الصوتي الآني (WP9c) — ميزة مساعدة قابلة للإطفاء بالكامل؛ فشلها لا يظهر
  // كخطأ جلسة أبداً ولا يمسّ التسجيل (recorder أعلاه يبقى المسار المستقل الوحيد).
  const [trackingOn, setTrackingOn] = useState(false)
  const [trackingStatus, setTrackingStatus] = useState<TrackingStatus>('stopped')
  const [pendingResetWord, setPendingResetWord] = useState<MushafWord | null>(null)
  const trackingClientRef = useRef<TrackingClient | null>(null)

  // مفتاح مستقل عن ['sessions','active'] المستخدم في SessionsPage عمداً: تلك الصفحة
  // قد تكون خزّنت {session: null} قبل إنشاء الجلسة (زر «بدء جلسة تسميع» ينتقل هنا فوراً
  // بعد الإنشاء)، ومشاركة المفتاح تُعيد تلك القيمة القديمة فوراً قبل انتهاء إعادة الجلب.
  const activeQuery = useQuery({ queryKey: ['sessions', 'active', 'live'], queryFn: fetchActiveSession })
  const taxonomyQuery = useQuery({ queryKey: ['taxonomy'], queryFn: fetchTaxonomy })
  const surahsQuery = useQuery({ queryKey: ['quran', 'surahs'], queryFn: fetchSurahs })

  const categoryById = useMemo(() => {
    const map = new Map<string, NoteCategory>()
    for (const category of taxonomyQuery.data?.categories ?? []) map.set(category.id, category)
    return map
  }, [taxonomyQuery.data])

  const surahNameByNumber = useMemo(() => {
    const map = new Map<number, string>()
    for (const surah of surahsQuery.data ?? []) map.set(surah.number, surah.name)
    return map
  }, [surahsQuery.data])

  // بدء المحرك مرة واحدة فقط: إما جلسة جديدة أُنشئت للتو (uploaded={}) أو استئناف
  // جلسة قيد التسجيل (segment = أعلى segment مرفوع + 1، priorChunks = مجموع الفهارس).
  const startedRef = useRef(false)
  useEffect(() => {
    if (startedRef.current) return
    if (activeQuery.isLoading || !activeQuery.data) return
    const session = activeQuery.data.session
    if (!session) {
      // قد تكون هذه قيمة مخزَّنة قديمة (قبل إنشاء الجلسة) في طريقها لإعادة الجلب —
      // لا نستنتج «لا توجد جلسة نشطة» إلا بعد استقرار الاستعلام فعلياً.
      if (activeQuery.isFetching) return
      toast.show('لا توجد جلسة نشطة — ابدأ جلسة جديدة من سجل الجلسات', 'error')
      navigate('/sessions', { replace: true })
      return
    }
    startedRef.current = true
    setSessionInfo(session)

    const uploaded = activeQuery.data.uploaded
    const segmentNumbers = Object.keys(uploaded).map(Number)
    const segment = segmentNumbers.length > 0 ? Math.max(...segmentNumbers) + 1 : 0
    const priorChunks = Object.values(uploaded).reduce((sum, indices) => sum + indices.length, 0)
    void start({ sessionId: session.id, segment, priorChunks, priorUploaded: uploaded })
    // يعمل مرة واحدة فقط عند توفر بيانات الجلسة النشطة — startedRef يمنع التكرار.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeQuery.data, activeQuery.isLoading, activeQuery.isFetching])

  // بذر خيط الجلسة بالملاحظات الموجودة سلفاً عند الاستئناف (بعد توفر ألوان التصنيفات)
  const seededRef = useRef(false)
  useEffect(() => {
    if (seededRef.current || !sessionInfo || taxonomyQuery.isLoading) return
    seededRef.current = true
    const initial: ThreadNote[] = sessionInfo.notes
      .filter((note) => note.timestamp_ms !== null)
      .map((note) => {
        const category = categoryById.get(note.category_id)
        return {
          id: note.id,
          timestamp_ms: note.timestamp_ms as number,
          color: category?.color ?? 'neutral',
          categoryName: category?.name ?? '',
        }
      })
    setThreadNotes(initial)
  }, [sessionInfo, taxonomyQuery.isLoading, categoryById])

  function stopTracking() {
    trackingClientRef.current?.stop()
    trackingClientRef.current = null
    setTrackingOn(false)
    setTrackingStatus('stopped')
    setPendingResetWord(null)
  }

  // إيقاف تلقائي هادئ للتتبع عند إغلاق المصحف أو خروج الجلسة من حالة recording —
  // التسجيل نفسه (recorder) لا علاقة له بهذا إطلاقاً ويستمر بمعزل تام.
  useEffect(() => {
    if (!mushafOpen) stopTracking()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mushafOpen])

  useEffect(() => {
    if (snapshot.phase !== 'recording') stopTracking()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot.phase])

  useEffect(() => {
    return () => trackingClientRef.current?.stop()
  }, [])

  async function handleTrackingPosition(pos: TrackingPosition) {
    mushafControlRef.current?.highlight({ surah: pos.surah, ayah: pos.ayah, word: pos.word })
    const currentPage = mushafControlRef.current?.getPage()
    try {
      const location = await queryClient.fetchQuery({
        queryKey: ['mushaf', 'page-for', pos.surah, pos.ayah],
        queryFn: () => fetchMushafPageFor(pos.surah, pos.ayah),
        staleTime: Infinity,
      })
      if (currentPage != null && location.page !== currentPage) {
        mushafControlRef.current?.goToPage(location.page)
      }
    } catch {
      // فشل نادر في تحديد الصفحة — التظليل نفسه يبقى صحيحاً على الصفحة الحالية
    }
  }

  function handleToggleTracking() {
    if (trackingOn) {
      stopTracking()
      return
    }
    if (!sessionInfo) return
    // التفرع القرائي على تيار ميكروفون المحرك نفسه — لا ميكروفون ثانٍ أبداً
    const stream = getMediaStream()
    if (!stream) {
      toast.show('تعذر الوصول إلى صوت الجلسة لتشغيل التتبع — حدّث الصفحة وأعد المحاولة', 'error')
      return
    }
    const client = new TrackingClient(
      sessionInfo.id,
      stream,
      {
        onStatusChange: setTrackingStatus,
        onPosition: (pos) => void handleTrackingPosition(pos),
        onError: (message) => {
          setTrackingOn(false)
          toast.show(message, 'error')
        },
      },
      () => fetchExpectedWords(sessionInfo.id),
    )
    trackingClientRef.current = client
    setTrackingOn(true)
    void client.start()
  }

  function handleMushafWordClick(word: MushafWord) {
    if (word.is_ayah_marker) return
    setPendingResetWord(word)
  }

  function handleConfirmResetWord() {
    if (!pendingResetWord) return
    trackingClientRef.current?.resetToWord(pendingResetWord)
    setPendingResetWord(null)
  }

  // عند نجاح الإنهاء: اجلب الدرجة المقترحة للـToast ثم انتقل لصفحة التفاصيل
  const finishedNavigatedRef = useRef(false)
  useEffect(() => {
    if (snapshot.phase !== 'finished' || !sessionInfo || finishedNavigatedRef.current) return
    finishedNavigatedRef.current = true
    ;(async () => {
      let gradeText = '—'
      try {
        const detail = await fetchSession(sessionInfo.id)
        gradeText = detail.suggested_grade != null ? String(detail.suggested_grade) : '—'
      } catch {
        // تجاهل: الرسالة الافتراضية كافية
      }
      queryClient.invalidateQueries({ queryKey: ['sessions'] })
      toast.show(`تم حفظ الجلسة — الدرجة المقترحة: ${gradeText}`)
      navigate(`/sessions/${sessionInfo.id}`, { replace: true })
    })()
  }, [snapshot.phase, sessionInfo, navigate, queryClient, toast])

  function handleCategoryPress(category: NoteCategory) {
    // ═══ اللحظة المقدسة: الطابع الزمني يُلتقط هنا، فوراً، قبل أي شيء آخر ═══
    const capturedMs = captureTimestamp()
    setActiveCategory(category)
    setNoteForm({
      categoryId: category.id,
      capturedMs,
      subtypeId: null,
      correctionMode: 'tanbih',
      severity: null,
      surah: sessionInfo?.range_start_surah ?? null,
      ayah: sessionInfo?.range_start_ayah ?? null,
      text: '',
      extra: {},
    })
    setSheetOpen(true)
  }

  async function persistNote(form: NoteFormState, category: NoteCategory, beadId: string) {
    if (!sessionInfo) return
    try {
      const created = await createNote(sessionInfo.id, {
        timestamp_ms: form.capturedMs,
        category_id: form.categoryId,
        subtype_id: form.subtypeId,
        correction_mode: form.correctionMode,
        severity: form.severity,
        surah: form.surah,
        ayah: form.ayah,
        text: form.text.trim() || null,
        extra: form.extra,
      })
      setThreadNotes((current) => current.map((n) => (n.id === beadId ? { ...n, id: created.id, pending: false } : n)))
    } catch (error) {
      setThreadNotes((current) => current.filter((n) => n.id !== beadId))
      const detail = error instanceof ApiError ? error.detail : 'تعذّر حفظ الملاحظة — أعد المحاولة'
      toast.show(detail, 'error')
      setActiveCategory(category)
      setNoteForm(form)
      setSheetOpen(true)
    }
  }

  function handleSaveNote() {
    if (!noteForm || !activeCategory) return
    const beadId = `pending-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const form = noteForm
    const category = activeCategory
    setThreadNotes((current) => [
      ...current,
      { id: beadId, timestamp_ms: form.capturedMs, color: category.color, categoryName: category.name, pending: true },
    ])
    setSheetOpen(false)
    void persistNote(form, category, beadId)
  }

  async function handleConfirmFinish() {
    setFinishOpen(false)
    try {
      await finalize({ summary: finishSummary.trim() || undefined, attendance: finishAttendance })
    } catch {
      toast.show('تعذّر بدء إنهاء الجلسة', 'error')
    }
  }

  async function handleConfirmCancel() {
    setCancelOpen(false)
    await cancel()
    toast.show('تم إلغاء الجلسة')
    navigate('/sessions', { replace: true })
  }

  if (!sessionInfo) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-waraq">
        <Spinner tone="lazward" size={28} />
      </div>
    )
  }

  if (snapshot.phase === 'idle' || snapshot.phase === 'acquiring') {
    return <AcquiringScreen studentName={sessionInfo.student_name} />
  }

  if (snapshot.phase === 'error') {
    return <ErrorScreen message={snapshot.fatalError} onBack={() => navigate('/sessions', { replace: true })} />
  }

  if (snapshot.phase === 'cancelled') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-waraq">
        <Spinner tone="lazward" size={28} />
      </div>
    )
  }

  const isRecording = snapshot.phase === 'recording'
  const isFinishing = snapshot.phase === 'finalizing' || snapshot.phase === 'finished'
  const categories = taxonomyQuery.data?.categories ?? []

  const statusText = isFinishing
    ? `بقي ${snapshot.pendingUploads} مقطعاً`
    : snapshot.uploadStalled
      ? 'انقطع الاتصال — تتم إعادة المحاولة'
      : 'الرفع مستمر ✓'

  const hasRange = sessionInfo.range_start_surah != null && sessionInfo.range_end_surah != null

  // نسخة لوحة مصحف واحدة فقط في الشجرة مهما كان العرض — إما جانبية (واسعة) أو ممتدة فوق
  // منطقة الأزرار (موبايل)، أبداً كلاهما معاً (لا نُركّب MushafPage مرتين بحالتين متضاربتين).
  const showDesktopMushaf = mushafOpen && isWide
  const showMobileMushaf = mushafOpen && !isWide

  const trackingStatusLabel =
    trackingStatus === 'connecting'
      ? 'جارٍ تجهيز التتبع…'
      : trackingStatus === 'active'
        ? 'التتبع نشط'
        : trackingStatus === 'paused'
          ? 'التتبع متوقف مؤقتاً — التسجيل مستمر'
          : null

  const trackingBar =
    trackingOn && trackingStatusLabel ? (
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-control border border-khatt bg-waraq-raised px-3 py-1.5 text-xs">
        <span className="flex items-center gap-1.5 text-hibr-2">
          {trackingStatus === 'connecting' && <Spinner tone="lazward" size={12} />}
          {trackingStatus === 'active' && <span className="h-1.5 w-1.5 rounded-full bg-sahih" />}
          {trackingStatus === 'paused' && <span className="h-1.5 w-1.5 rounded-full bg-khata-hifz" />}
          {trackingStatusLabel}
        </span>
        {pendingResetWord && (
          <span className="flex items-center gap-1.5">
            <span className="text-hibr-3">أرجِع المؤشر إلى هنا؟</span>
            <button
              type="button"
              onClick={handleConfirmResetWord}
              className="rounded-control border border-dhahab/60 bg-dhahab/10 px-2 py-0.5 text-dhahab hover:bg-dhahab/20"
            >
              تأكيد
            </button>
            <button
              type="button"
              onClick={() => setPendingResetWord(null)}
              className="text-hibr-3 hover:text-hibr"
            >
              إلغاء
            </button>
          </span>
        )}
      </div>
    ) : null

  return (
    <div className={cx('flex min-h-screen flex-col bg-waraq', showDesktopMushaf && 'lg:flex-row')}>
      <div className={cx('flex flex-1 flex-col', showDesktopMushaf && 'lg:overflow-y-auto')}>
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col">
          <header className="flex items-start justify-between gap-3 px-4 pt-6">
            <div className="min-w-0">
              <h1 className="truncate font-display text-2xl text-hibr">{sessionInfo.student_name}</h1>
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-hibr-2">
                <span>{sessionTypeLabels[sessionInfo.session_type]}</span>
                {hasRange && (
                  <>
                    <AyahChip
                      surah={surahNameByNumber.get(sessionInfo.range_start_surah as number) ?? String(sessionInfo.range_start_surah)}
                      ayah={sessionInfo.range_start_ayah as number}
                    />
                    <span className="text-hibr-3">—</span>
                    <AyahChip
                      surah={surahNameByNumber.get(sessionInfo.range_end_surah as number) ?? String(sessionInfo.range_end_surah)}
                      ayah={sessionInfo.range_end_ayah as number}
                    />
                  </>
                )}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => setMushafOpen((open) => !open)}
                aria-pressed={mushafOpen}
                data-testid="toggle-mushaf"
                className={cx(
                  'flex h-9 items-center gap-1.5 rounded-control border px-3 text-sm transition-colors duration-150',
                  mushafOpen
                    ? 'border-dhahab/60 bg-dhahab/10 text-dhahab'
                    : 'border-khatt text-hibr-2 hover:bg-lazward-100/40 hover:text-hibr',
                )}
              >
                <IconBook className="h-4 w-4" />
                المصحف
              </button>
              {/* الزر ظاهر دائماً (اكتشافية) — التعطيل مع سبب واضح بدل الإخفاء الصامت */}
              {
                <button
                  type="button"
                  onClick={handleToggleTracking}
                  disabled={!hasRange || !mushafOpen || !isRecording}
                  aria-pressed={trackingOn}
                  data-testid="toggle-tracking"
                  title={
                    !hasRange
                      ? 'حدد نطاق الآيات عند بدء الجلسة (من سورة وآية إلى سورة وآية) لتفعيل التتبع'
                      : !mushafOpen
                        ? 'افتح المصحف أولاً لتفعيل التتبع'
                        : undefined
                  }
                  className={cx(
                    'flex h-9 items-center gap-1.5 rounded-control border px-3 text-sm transition-colors duration-150 disabled:opacity-40',
                    trackingOn
                      ? 'border-dhahab/60 bg-dhahab/10 text-dhahab'
                      : 'border-khatt text-hibr-2 hover:bg-lazward-100/40 hover:text-hibr',
                  )}
                >
                  <IconTracking className="h-4 w-4" />
                  التتبع
                </button>
              }
              {isRecording && (
                <button
                  type="button"
                  onClick={() => setCancelOpen(true)}
                  className="shrink-0 rounded-control px-2.5 py-1.5 text-sm text-hibr-3 hover:bg-lazward-100/40 hover:text-hibr"
                >
                  إلغاء
                </button>
              )}
            </div>
          </header>

          <div className="flex flex-col items-center justify-center gap-3 px-4 py-8">
            <RecitationHalo
              elapsedMs={elapsedMs}
              level={isRecording ? level : 0}
              spectrumRef={spectrumRef}
            />
            <p className="text-sm text-hibr-2" role="status">
              {statusText}
            </p>
          </div>

          {showMobileMushaf ? (
            // موبايل مع فتح المصحف: اللوحة تحل محل شبكة الملاحظات وخيط الجلسة (توفيراً
            // للمساحة)، والمؤقت أعلاه يبقى ظاهراً كما هو، وشريط مضغوط تحت اللوحة يبقي
            // المؤقت وملاحظة سريعة بمتناول اليد (DIRECTION §3 — هذه شاشة اللمس الأساسية).
            <div className="flex flex-1 flex-col px-4">
              {trackingBar}
              <MushafPanel
                rangeStartSurah={sessionInfo.range_start_surah}
                rangeStartAyah={sessionInfo.range_start_ayah}
                onClose={() => setMushafOpen(false)}
                onControlReady={(handle) => {
                  mushafControlRef.current = handle
                }}
                onWordClick={trackingOn ? handleMushafWordClick : undefined}
                className="flex flex-1 flex-col"
              />

              <div className="mt-2 flex min-w-0 items-center gap-2 border-t border-khatt pt-2">
                <span className="shrink-0 font-time text-sm tabular-nums text-hibr-2">{formatDuration(elapsedMs)}</span>
                <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1">
                  {categories.map((category) => (
                    <button
                      key={category.id}
                      type="button"
                      disabled={!isRecording}
                      onClick={() => handleCategoryPress(category)}
                      data-testid="note-category-button"
                      data-category={category.key ?? category.id}
                      className={cx(
                        'flex h-11 shrink-0 items-center justify-center whitespace-nowrap rounded-control border bg-waraq-raised px-3 text-sm font-medium transition-colors duration-150 disabled:opacity-40',
                        notePaperAccentClasses(category.color),
                      )}
                    >
                      {category.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="px-4">
                {taxonomyQuery.isLoading ? (
                  <div className="flex justify-center py-4">
                    <Spinner tone="lazward" />
                  </div>
                ) : (
                  <div
                    className={cx(
                      'grid grid-cols-2 gap-3 sm:grid-cols-3',
                      !isRecording && 'pointer-events-none opacity-40',
                    )}
                  >
                    {categories.map((category) => (
                      <button
                        key={category.id}
                        type="button"
                        disabled={!isRecording}
                        onClick={() => handleCategoryPress(category)}
                        data-testid="note-category-button"
                        data-category={category.key ?? category.id}
                        className={cx(
                          'flex h-14 items-center justify-center rounded-control border bg-waraq-raised px-2 text-center text-sm font-medium leading-tight transition-colors duration-150',
                          notePaperAccentClasses(category.color),
                        )}
                      >
                        {category.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex-1" />

              <SessionThread notes={threadNotes} elapsedMs={elapsedMs} />
            </>
          )}

          <div className="px-4 pb-6 pt-2">
            {isFinishing ? (
              <Button variant="secondary" className="w-full" loading disabled>
                جارٍ حفظ الجلسة…
              </Button>
            ) : (
              <Button variant="secondary" className="w-full" onClick={() => setFinishOpen(true)}>
                أنهِ الجلسة
              </Button>
            )}
          </div>
        </div>
      </div>

      {showDesktopMushaf && (
        <div className="hidden border-s border-khatt bg-waraq-raised/60 lg:flex lg:w-[420px] lg:shrink-0 lg:flex-col lg:overflow-y-auto lg:p-4">
          {trackingBar}
          <MushafPanel
            rangeStartSurah={sessionInfo.range_start_surah}
            rangeStartAyah={sessionInfo.range_start_ayah}
            onClose={() => setMushafOpen(false)}
            onControlReady={(handle) => {
              mushafControlRef.current = handle
            }}
            onWordClick={trackingOn ? handleMushafWordClick : undefined}
            className="flex flex-1 flex-col"
          />
        </div>
      )}

      <BottomSheet
        open={sheetOpen && Boolean(activeCategory && noteForm)}
        onClose={() => setSheetOpen(false)}
        title={activeCategory?.name ?? 'ملاحظة'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setSheetOpen(false)}>
              إلغاء
            </Button>
            <Button onClick={handleSaveNote}>احفظ الملاحظة</Button>
          </>
        }
      >
        {activeCategory && noteForm && (
          <NoteSheetContent
            category={activeCategory}
            value={noteForm}
            onChange={setNoteForm}
            surahs={surahsQuery.data ?? []}
            fields={taxonomyQuery.data?.fields ?? []}
          />
        )}
      </BottomSheet>

      <Modal
        open={finishOpen}
        onClose={() => setFinishOpen(false)}
        title="إنهاء الجلسة"
        footer={
          <>
            <Button variant="secondary" onClick={() => setFinishOpen(false)}>
              تراجع
            </Button>
            <Button onClick={handleConfirmFinish}>أنهِ الجلسة</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Select
            label="تأكيد الحضور"
            options={[
              { value: 'hadir', label: attendanceLabels.hadir },
              { value: 'mutaakhir', label: attendanceLabels.mutaakhir },
              { value: 'ghaib', label: attendanceLabels.ghaib },
            ]}
            value={finishAttendance}
            onChange={(event) => setFinishAttendance(event.target.value as Attendance)}
          />
          <TextArea
            label="ملخص الجلسة (اختياري)"
            value={finishSummary}
            onChange={(event) => setFinishSummary(event.target.value)}
            rows={3}
          />
        </div>
      </Modal>

      <Modal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="إلغاء الجلسة"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCancelOpen(false)}>
              تراجع
            </Button>
            <Button variant="secondary" onClick={handleConfirmCancel}>
              إلغاء الجلسة نهائياً
            </Button>
          </>
        }
      >
        <p className="text-hibr">سيُحذف تسجيل هذه الجلسة نهائياً ولا يمكن التراجع عن ذلك — هل أنت متأكد؟</p>
      </Modal>
    </div>
  )
}
