// /sessions/:id — تفاصيل الجلسة: بيانات الجلسة، المشغّل الموجي (التوقيع البصري الأساسي
// للمنصة، DIRECTION.md §5)، وقائمة الملاحظات مرتبة زمنياً قابلة للتعديل/الحذف. الدرجة
// والملخص قابلان للتعديل هنا عبر PATCH.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { ApiError } from '../../api/client'
import type { NoteUpdateInput } from '../../api/notes'
import { deleteNote, updateNote } from '../../api/notes'
import { fetchSurahs } from '../../api/quran'
import type { SessionUpdateInput } from '../../api/sessions'
import { fetchSession, updateSession } from '../../api/sessions'
import { fetchTaxonomy } from '../../api/taxonomy'
import { formatDualDate } from '../../lib/date'
import { formatDuration } from '../../lib/formatDuration'
import { noteBadgeVariant, noteChartColorVar, noteSolidDotClass } from '../../lib/noteColors'
import {
  attendanceLabels,
  correctionModeLabels,
  sessionStatusLabels,
  sessionTypeLabels,
  severityLabels,
} from '../../lib/sessionLabels'
import { buildSurahNameMap, surahLabel } from '../../lib/surahName'
import { AyahChip } from '../../ui/AyahChip'
import { Badge } from '../../ui/Badge'
import type { BadgeVariant } from '../../ui/Badge'
import { Button } from '../../ui/Button'
import { Card } from '../../ui/Card'
import { EmptyState } from '../../ui/EmptyState'
import { Modal } from '../../ui/Modal'
import { PageHeader } from '../../ui/PageHeader'
import { Spinner } from '../../ui/Spinner'
import { useToast } from '../../ui/Toast'
import { cx, prefersReducedMotion } from '../../ui/utils'
import { GradeEditModal } from './GradeEditModal'
import { NoteEditModal } from './NoteEditModal'
import type { WaveformBead, WaveformPlayerHandle } from './WaveformPlayer'
import { WaveformPlayer } from './WaveformPlayer'

const STATUS_BADGE: Record<string, BadgeVariant> = { recording: 'lazward', completed: 'sahih', cancelled: 'neutral' }

const HIGHLIGHT_MS = 1600

export interface SessionDetailPageProps {
  /** بوابة الطالب (WP8، /me/sessions/:id): بلا أي زر تعديل/حذف — قراءة فقط بالكامل. */
  readOnly?: boolean
}

export function SessionDetailPage({ readOnly = false }: SessionDetailPageProps) {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const toast = useToast()

  const sessionQuery = useQuery({
    queryKey: ['sessions', id],
    queryFn: () => fetchSession(id as string),
    enabled: Boolean(id),
  })
  // /api/taxonomy ممنوع على دور student (WP8 — يبقى 403 عمداً، لا استثناء أمني هنا)،
  // فلا تُطلب في بوابة الطالب: الملاحظات تُعرض حينها بلا شارة/لون تصنيف (تدهور رشيق
  // موثّق في تقرير WP8) بدل إطلاق طلب مرفوض دوماً.
  const taxonomyQuery = useQuery({ queryKey: ['taxonomy'], queryFn: fetchTaxonomy, enabled: !readOnly })
  const surahsQuery = useQuery({ queryKey: ['quran', 'surahs'], queryFn: fetchSurahs, staleTime: Infinity })

  const categoryById = new Map((taxonomyQuery.data?.categories ?? []).map((c) => [c.id, c] as const))
  const subtypeById = new Map(
    (taxonomyQuery.data?.categories ?? []).flatMap((c) => c.subtypes.map((s) => [s.id, s] as const)),
  )
  const fieldById = new Map((taxonomyQuery.data?.fields ?? []).map((f) => [f.id, f] as const))
  const surahNames = buildSurahNameMap(surahsQuery.data ?? [])

  const playerRef = useRef<WaveformPlayerHandle>(null)
  const noteRefs = useRef<Map<string, HTMLLIElement>>(new Map())
  const highlightTimer = useRef<number | null>(null)

  const [highlightedNoteId, setHighlightedNoteId] = useState<string | null>(null)
  const [gradeModalOpen, setGradeModalOpen] = useState(false)
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [deletingNoteId, setDeletingNoteId] = useState<string | null>(null)

  const gradeMutation = useMutation({
    mutationFn: (payload: SessionUpdateInput) => updateSession(id as string, payload),
    onSuccess: (updated) => {
      queryClient.setQueryData(['sessions', id], updated)
      queryClient.invalidateQueries({ queryKey: ['sessions', 'list'] })
      setGradeModalOpen(false)
      toast.show('تم حفظ التقييم')
    },
    onError: (error: unknown) => {
      toast.show(error instanceof ApiError ? error.detail : 'تعذّر حفظ التقييم', 'error')
    },
  })

  const noteUpdateMutation = useMutation({
    mutationFn: ({ noteId, payload }: { noteId: string; payload: NoteUpdateInput }) => updateNote(noteId, payload),
    onSuccess: (updated) => {
      queryClient.setQueryData(['sessions', id], (current: typeof sessionQuery.data) =>
        current ? { ...current, notes: current.notes.map((n) => (n.id === updated.id ? updated : n)) } : current,
      )
      setEditingNoteId(null)
      toast.show('تم حفظ الملاحظة')
    },
    onError: (error: unknown) => {
      toast.show(error instanceof ApiError ? error.detail : 'تعذّر حفظ الملاحظة', 'error')
    },
  })

  const noteDeleteMutation = useMutation({
    mutationFn: (noteId: string) => deleteNote(noteId),
    onSuccess: (_void, noteId) => {
      queryClient.setQueryData(['sessions', id], (current: typeof sessionQuery.data) =>
        current ? { ...current, notes: current.notes.filter((n) => n.id !== noteId) } : current,
      )
      setDeletingNoteId(null)
      toast.show('تم حذف الملاحظة')
    },
    onError: (error: unknown) => {
      toast.show(error instanceof ApiError ? error.detail : 'تعذّر حذف الملاحظة', 'error')
    },
  })

  if (!id || sessionQuery.isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner size={28} tone="lazward" />
      </div>
    )
  }

  const session = sessionQuery.data
  if (!session) {
    return (
      <div>
        <PageHeader title="الجلسة" />
        <EmptyState message="تعذّر العثور على هذه الجلسة" />
      </div>
    )
  }

  const hasRange = session.range_start_surah != null && session.range_end_surah != null
  const sortedNotes = [...session.notes].sort((a, b) => (a.timestamp_ms ?? -1) - (b.timestamp_ms ?? -1))
  const editingNote = editingNoteId ? (session.notes.find((n) => n.id === editingNoteId) ?? null) : null
  const deletingNote = deletingNoteId ? (session.notes.find((n) => n.id === deletingNoteId) ?? null) : null

  const beads: WaveformBead[] = sortedNotes
    .filter((n) => n.timestamp_ms != null)
    .map((n) => {
      const category = categoryById.get(n.category_id)
      return {
        id: n.id,
        timestampMs: n.timestamp_ms as number,
        color: noteChartColorVar(category?.color ?? 'neutral'),
        label: category?.name ?? 'ملاحظة',
      }
    })

  function handleBeadClick(noteId: string) {
    setHighlightedNoteId(noteId)
    const el = noteRefs.current.get(noteId)
    el?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'center' })
    if (highlightTimer.current != null) window.clearTimeout(highlightTimer.current)
    highlightTimer.current = window.setTimeout(() => setHighlightedNoteId((current) => (current === noteId ? null : current)), HIGHLIGHT_MS)
  }

  function renderRecordingArea() {
    if (session!.attendance === 'ghaib') {
      return <EmptyState message="الطالب غائب في هذه الجلسة — لا تسجيل صوتي" />
    }
    const recording = session!.recording
    if (!recording) {
      return <EmptyState message="لا تسجيل صوتي لهذه الجلسة" />
    }
    if (recording.status === 'uploading') {
      return <EmptyState message="التسجيل قيد المعالجة، يرجى المحاولة لاحقاً" />
    }
    if (recording.status === 'failed') {
      return <EmptyState message="تعذّرت معالجة التسجيل الصوتي لهذه الجلسة" />
    }
    if (recording.status !== 'ready' || recording.duration_ms == null) {
      return <EmptyState message="المشغّل الصوتي غير متاح حالياً" />
    }
    return (
      <WaveformPlayer
        ref={playerRef}
        sessionId={session!.id}
        waveform={recording.waveform}
        durationMs={recording.duration_ms}
        beads={beads}
        onBeadClick={handleBeadClick}
      />
    )
  }

  return (
    <div>
      <PageHeader
        title={session.student_name}
        description={`${sessionTypeLabels[session.session_type]} — ${formatDualDate(session.started_at)}`}
        actions={
          readOnly ? (
            <Button variant="secondary" onClick={() => navigate('/me')}>
              صفحتي
            </Button>
          ) : (
            <Button variant="secondary" onClick={() => navigate(`/students/${session.student_id}`)}>
              ملف الطالب
            </Button>
          )
        }
      />

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-hibr">بطاقة الجلسة</h2>
          <dl className="flex flex-col gap-3 text-sm">
            <div className="flex items-center justify-between">
              <dt className="text-hibr-2">الحالة</dt>
              <dd>
                <Badge variant={STATUS_BADGE[session.status]}>{sessionStatusLabels[session.status]}</Badge>
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-hibr-2">الحضور</dt>
              <dd className="text-hibr">{attendanceLabels[session.attendance]}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-hibr-2">النطاق</dt>
              <dd>
                {hasRange ? (
                  <span className="flex items-center gap-1">
                    <AyahChip
                      surah={surahLabel(surahNames, session.range_start_surah as number)}
                      ayah={session.range_start_ayah as number}
                    />
                    <span className="text-hibr-3">—</span>
                    <AyahChip
                      surah={surahLabel(surahNames, session.range_end_surah as number)}
                      ayah={session.range_end_ayah as number}
                    />
                  </span>
                ) : (
                  '—'
                )}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-hibr-2">المدة</dt>
              <dd className="font-time tabular-nums text-hibr">
                {session.recording?.duration_ms != null ? formatDuration(session.recording.duration_ms) : '—'}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-hibr-2">عدد الملاحظات</dt>
              <dd className="font-time tabular-nums text-hibr">{session.notes.length}</dd>
            </div>
          </dl>
        </Card>

        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-hibr">بطاقة التقييم</h2>
            {!readOnly && session.status === 'completed' && (
              <Button size="sm" variant="ghost" onClick={() => setGradeModalOpen(true)}>
                تعديل
              </Button>
            )}
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-time text-3xl tabular-nums text-hibr">
              {session.grade ?? session.suggested_grade ?? '—'}
            </span>
            <span className="text-sm text-hibr-2">من 100</span>
          </div>
          {session.grade != null && session.suggested_grade != null && session.grade !== session.suggested_grade && (
            <p className="mt-1 text-sm text-hibr-2">المقترحة: {session.suggested_grade}</p>
          )}
          {session.summary && (
            <div className="mt-4 border-t border-khatt pt-3">
              <h3 className="mb-1 text-sm font-semibold text-hibr">ملخص الجلسة</h3>
              <p className="text-sm text-hibr-2">{session.summary}</p>
            </div>
          )}
        </Card>
      </div>

      <Card className="mb-6" data-testid="recording-card">
        <h2 className="mb-4 font-display text-xl text-hibr">التسجيل الصوتي</h2>
        {renderRecordingArea()}
      </Card>

      <h2 className="mb-3 font-display text-xl text-hibr">الملاحظات</h2>
      {sortedNotes.length === 0 ? (
        <EmptyState message="لا ملاحظات في هذه الجلسة" />
      ) : (
        <ul className="flex flex-col rounded-card border border-khatt bg-waraq-raised">
          {sortedNotes.map((note) => {
            const category = categoryById.get(note.category_id)
            const subtype = note.subtype_id ? subtypeById.get(note.subtype_id) : undefined
            const extraEntries = Object.entries(note.extra ?? {}).filter(
              ([, v]) => v !== undefined && v !== null && v !== '',
            )
            return (
              <li
                key={note.id}
                ref={(el) => {
                  if (el) noteRefs.current.set(note.id, el)
                  else noteRefs.current.delete(note.id)
                }}
                data-testid="note-row"
                data-note-id={note.id}
                className={cx(
                  'flex flex-col gap-2 border-b border-khatt px-4 py-3 transition-colors duration-700 last:border-b-0',
                  highlightedNoteId === note.id && 'bg-lazward-100',
                )}
              >
                <div className="flex flex-wrap items-center gap-2">
                  {note.timestamp_ms != null ? (
                    <button
                      type="button"
                      onClick={() => playerRef.current?.seekMs(note.timestamp_ms as number)}
                      className="font-time text-sm tabular-nums text-lazward-700 hover:underline"
                    >
                      {formatDuration(note.timestamp_ms)}
                    </button>
                  ) : (
                    <span className="font-time text-sm tabular-nums text-hibr-3">—</span>
                  )}
                  <span className={cx('h-2 w-2 rounded-full', noteSolidDotClass(category?.color ?? 'neutral'))} aria-hidden="true" />
                  {category && <Badge variant={noteBadgeVariant(category.color)}>{category.name}</Badge>}
                  {subtype && <span className="text-sm text-hibr-2">{subtype.name}</span>}
                  {note.correction_mode && <Badge variant="neutral">{correctionModeLabels[note.correction_mode]}</Badge>}
                  {note.severity && <Badge variant="neutral">{severityLabels[note.severity]}</Badge>}
                  {note.surah != null && note.ayah != null && (
                    <AyahChip surah={surahLabel(surahNames, note.surah)} ayah={note.ayah} />
                  )}
                  {!readOnly && (
                    <div className="ms-auto flex items-center gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setEditingNoteId(note.id)}>
                        تعديل
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setDeletingNoteId(note.id)}>
                        حذف
                      </Button>
                    </div>
                  )}
                </div>
                {note.text && <p className="text-sm text-hibr">{note.text}</p>}
                {extraEntries.length > 0 && (
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-hibr-2">
                    {extraEntries.map(([fieldId, value]) => {
                      const field = fieldById.get(fieldId)
                      if (!field) return null
                      return (
                        <span key={fieldId}>
                          {field.name}: <span className="text-hibr">{String(value)}</span>
                        </span>
                      )
                    })}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {taxonomyQuery.data && (
        <NoteEditModal
          note={editingNote}
          taxonomy={taxonomyQuery.data}
          surahs={surahsQuery.data ?? []}
          onClose={() => setEditingNoteId(null)}
          submitting={noteUpdateMutation.isPending}
          onSubmit={(payload) => editingNoteId && noteUpdateMutation.mutate({ noteId: editingNoteId, payload })}
        />
      )}

      <GradeEditModal
        open={gradeModalOpen}
        initialGrade={session.grade}
        initialSummary={session.summary}
        submitting={gradeMutation.isPending}
        onClose={() => setGradeModalOpen(false)}
        onSubmit={(payload) => gradeMutation.mutate(payload)}
      />

      <Modal
        open={Boolean(deletingNote)}
        onClose={() => setDeletingNoteId(null)}
        title="حذف الملاحظة"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeletingNoteId(null)}>
              إلغاء
            </Button>
            <Button
              variant="danger"
              loading={noteDeleteMutation.isPending}
              onClick={() => deletingNoteId && noteDeleteMutation.mutate(deletingNoteId)}
            >
              حذف الملاحظة
            </Button>
          </>
        }
      >
        <p className="text-hibr-2">لا يمكن التراجع عن حذف هذه الملاحظة. هل تريد المتابعة؟</p>
      </Modal>
    </div>
  )
}
