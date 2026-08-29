// شاشة الجلسة الحية — عالم اللازورد. ملء الشاشة، بلا AppShell. أهم شاشة في المنتج:
// المعلم يضغط زر تصنيف فتُلتقط اللحظة الزمنية فوراً (captureTimestamp في نفس معالج
// النقرة، قبل فتح اللوحة السفلية) ثم يدوّن تفاصيلها بلا استعجال. المحرك (recorderEngine
// وuseSessionRecorder) يُستهلك كما هو — كل رفع/إنهاء/إلغاء يمر حصراً عبره.

import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'

import { ApiError } from '../../api/client'
import { createNote } from '../../api/notes'
import { fetchSurahs } from '../../api/quran'
import type { Attendance, SessionDetail } from '../../api/sessions'
import { fetchActiveSession, fetchSession } from '../../api/sessions'
import type { NoteCategory } from '../../api/taxonomy'
import { fetchTaxonomy } from '../../api/taxonomy'
import { formatDuration } from '../../lib/formatDuration'
import { useMediaQuery } from '../../lib/useMediaQuery'
import { noteLazwardAccentClasses } from '../../lib/noteColors'
import { attendanceLabels, sessionTypeLabels } from '../../lib/sessionLabels'
import type { MushafControlHandle } from '../../mushaf/MushafPage'
import { useSessionRecorder } from '../../session/useSessionRecorder'
import { AyahChip } from '../../ui/AyahChip'
import { BottomSheet } from '../../ui/BottomSheet'
import { Button } from '../../ui/Button'
import { IconAlertCircle, IconBook, IconMic } from '../../ui/icons'
import { Modal } from '../../ui/Modal'
import { Select } from '../../ui/Select'
import { Spinner } from '../../ui/Spinner'
import { TextArea } from '../../ui/TextArea'
import { useToast } from '../../ui/Toast'
import { cx } from '../../ui/utils'
import { MushafPanel } from './MushafPanel'
import type { NoteFormState } from './NoteSheetContent'
import { NoteSheetContent } from './NoteSheetContent'
import { RecordingRing } from './RecordingRing'
import type { ThreadNote } from './SessionThread'
import { SessionThread } from './SessionThread'

function AcquiringScreen({ studentName }: { studentName?: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-lazward-900 px-6 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-dhahab-bright/60">
        <IconMic className="h-7 w-7 text-dhahab-bright" />
      </span>
      <p className="font-display text-xl text-nur">بانتظار إذن الميكروفون</p>
      <p className="max-w-xs text-sm text-nur/70">
        يرجى السماح لهذا المتصفح باستخدام الميكروفون من نافذة الإذن الظاهرة لبدء تسجيل جلسة{' '}
        {studentName ? `«${studentName}»` : ''}. إن لم تظهر نافذة الإذن، تحقق من إعدادات الموقع في المتصفح.
      </p>
      <Spinner tone="nur" size={26} />
    </div>
  )
}

function ErrorScreen({ message, onBack }: { message: string | null; onBack: () => void }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-lazward-900 px-6 text-center">
      <IconAlertCircle className="h-10 w-10 text-khata-hifz" />
      <p className="font-display text-xl text-nur">تعذّر إكمال الجلسة</p>
      <p className="max-w-sm text-sm text-nur/70">{message ?? 'حدث خطأ غير متوقع، يرجى المحاولة مرة أخرى'}</p>
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
  const { snapshot, level, elapsedMs, start, finalize, cancel, captureTimestamp } = recorder

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
  // نقطة ربط جاهزة لخدمة التتبع الصوتي (WP9c) — لا مستهلك لها بعد داخل هذه الحزمة.
  const mushafControlRef = useRef<MushafControlHandle | null>(null)

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
      <div className="flex min-h-screen items-center justify-center bg-lazward-900">
        <Spinner tone="nur" size={28} />
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
      <div className="flex min-h-screen items-center justify-center bg-lazward-900">
        <Spinner tone="nur" size={28} />
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

  return (
    <div className={cx('flex min-h-screen flex-col bg-lazward-900', showDesktopMushaf && 'lg:flex-row')}>
      <div className={cx('flex flex-1 flex-col', showDesktopMushaf && 'lg:overflow-y-auto')}>
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col">
          <header className="flex items-start justify-between gap-3 px-4 pt-6">
            <div className="min-w-0">
              <h1 className="truncate font-display text-2xl text-nur">{sessionInfo.student_name}</h1>
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-nur/70">
                <span>{sessionTypeLabels[sessionInfo.session_type]}</span>
                {hasRange && (
                  <>
                    <AyahChip
                      tone="lazward"
                      surah={surahNameByNumber.get(sessionInfo.range_start_surah as number) ?? String(sessionInfo.range_start_surah)}
                      ayah={sessionInfo.range_start_ayah as number}
                    />
                    <span className="text-nur/40">—</span>
                    <AyahChip
                      tone="lazward"
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
                    ? 'border-dhahab-bright/50 bg-dhahab-bright/10 text-dhahab-bright'
                    : 'border-nur/15 text-nur/70 hover:bg-nur/10 hover:text-nur',
                )}
              >
                <IconBook className="h-4 w-4" />
                المصحف
              </button>
              {isRecording && (
                <button
                  type="button"
                  onClick={() => setCancelOpen(true)}
                  className="shrink-0 rounded-control px-2.5 py-1.5 text-sm text-nur/55 hover:bg-nur/10 hover:text-nur"
                >
                  إلغاء
                </button>
              )}
            </div>
          </header>

          <div className="flex flex-col items-center justify-center gap-3 px-4 py-8">
            <RecordingRing elapsedMs={elapsedMs} level={isRecording ? level : 0} />
            <p className="text-sm text-nur/70" role="status">
              {statusText}
            </p>
          </div>

          {showMobileMushaf ? (
            // موبايل مع فتح المصحف: اللوحة تحل محل شبكة الملاحظات وخيط الجلسة (توفيراً
            // للمساحة)، والمؤقت أعلاه يبقى ظاهراً كما هو، وشريط مضغوط تحت اللوحة يبقي
            // المؤقت وملاحظة سريعة بمتناول اليد (DIRECTION §3 — هذه شاشة اللمس الأساسية).
            <div className="flex flex-1 flex-col px-4">
              <MushafPanel
                rangeStartSurah={sessionInfo.range_start_surah}
                rangeStartAyah={sessionInfo.range_start_ayah}
                onClose={() => setMushafOpen(false)}
                onControlReady={(handle) => {
                  mushafControlRef.current = handle
                }}
                className="flex flex-1 flex-col"
              />

              <div className="mt-2 flex min-w-0 items-center gap-2 border-t border-nur/10 pt-2">
                <span className="shrink-0 font-time text-sm tabular-nums text-nur/80">{formatDuration(elapsedMs)}</span>
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
                        'flex h-11 shrink-0 items-center justify-center whitespace-nowrap rounded-control border bg-lazward-800 px-3 text-sm font-medium transition-colors duration-150 disabled:opacity-40',
                        noteLazwardAccentClasses(category.color),
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
                    <Spinner tone="nur" />
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
                          'flex h-14 items-center justify-center rounded-control border bg-lazward-800 px-2 text-center text-sm font-medium leading-tight transition-colors duration-150',
                          noteLazwardAccentClasses(category.color),
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
        <div className="hidden border-s border-nur/10 bg-lazward-800/40 lg:flex lg:w-[420px] lg:shrink-0 lg:flex-col lg:overflow-y-auto lg:p-4">
          <MushafPanel
            rangeStartSurah={sessionInfo.range_start_surah}
            rangeStartAyah={sessionInfo.range_start_ayah}
            onClose={() => setMushafOpen(false)}
            onControlReady={(handle) => {
              mushafControlRef.current = handle
            }}
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
