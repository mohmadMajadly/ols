// /sessions/:id — تفاصيل الجلسة: بيانات الجلسة، مشغّل صوتي بسيط، وقائمة الملاحظات
// مرتبة زمنياً بطوابعها mm:ss (خط mono). الدرجة قابلة للتعديل هنا عبر PATCH.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useParams } from 'react-router-dom'

import { ApiError } from '../../api/client'
import { fetchSession, updateSession } from '../../api/sessions'
import { fetchTaxonomy } from '../../api/taxonomy'
import { formatDualDate } from '../../lib/date'
import { formatDuration } from '../../lib/formatDuration'
import { noteBadgeVariant } from '../../lib/noteColors'
import {
  attendanceLabels,
  correctionModeLabels,
  sessionStatusLabels,
  sessionTypeLabels,
  severityLabels,
} from '../../lib/sessionLabels'
import { AyahChip } from '../../ui/AyahChip'
import { Badge } from '../../ui/Badge'
import type { BadgeVariant } from '../../ui/Badge'
import { Button } from '../../ui/Button'
import { Card } from '../../ui/Card'
import { EmptyState } from '../../ui/EmptyState'
import { fieldBaseClasses } from '../../ui/fieldStyles'
import { PageHeader } from '../../ui/PageHeader'
import { Spinner } from '../../ui/Spinner'
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from '../../ui/Table'
import { useToast } from '../../ui/Toast'
import { cx } from '../../ui/utils'

const STATUS_BADGE: Record<string, BadgeVariant> = { recording: 'lazward', completed: 'sahih', cancelled: 'neutral' }

export function SessionDetailPage() {
  const { id } = useParams<{ id: string }>()
  const queryClient = useQueryClient()
  const toast = useToast()

  const sessionQuery = useQuery({
    queryKey: ['sessions', id],
    queryFn: () => fetchSession(id as string),
    enabled: Boolean(id),
  })
  const taxonomyQuery = useQuery({ queryKey: ['taxonomy'], queryFn: fetchTaxonomy })

  const categoryById = new Map((taxonomyQuery.data?.categories ?? []).map((c) => [c.id, c] as const))
  const subtypeById = new Map(
    (taxonomyQuery.data?.categories ?? []).flatMap((c) => c.subtypes.map((s) => [s.id, s] as const)),
  )

  const [editingGrade, setEditingGrade] = useState(false)
  const [gradeValue, setGradeValue] = useState('')

  const gradeMutation = useMutation({
    mutationFn: (grade: number) => updateSession(id as string, { grade }),
    onSuccess: (updated) => {
      queryClient.setQueryData(['sessions', id], updated)
      queryClient.invalidateQueries({ queryKey: ['sessions', 'list'] })
      setEditingGrade(false)
      toast.show('تم تحديث الدرجة')
    },
    onError: (error: unknown) => {
      toast.show(error instanceof ApiError ? error.detail : 'تعذّر تحديث الدرجة', 'error')
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

  function startEditGrade() {
    setGradeValue(
      session!.grade != null ? String(session!.grade) : session!.suggested_grade != null ? String(session!.suggested_grade) : '',
    )
    setEditingGrade(true)
  }

  return (
    <div>
      <PageHeader
        title={session.student_name}
        description={`${sessionTypeLabels[session.session_type]} — ${formatDualDate(session.started_at)}`}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <Card>
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
                    <AyahChip surah={String(session.range_start_surah)} ayah={session.range_start_ayah as number} />
                    <span className="text-hibr-3">—</span>
                    <AyahChip surah={String(session.range_end_surah)} ayah={session.range_end_ayah as number} />
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
              <dd className="text-hibr">{session.notes.length}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-hibr-2">الدرجة</dt>
              <dd>
                {editingGrade ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step="0.5"
                      aria-label="الدرجة"
                      value={gradeValue}
                      onChange={(event) => setGradeValue(event.target.value)}
                      className={cx(fieldBaseClasses, 'h-9 w-20 px-2 text-base')}
                    />
                    <Button
                      size="sm"
                      loading={gradeMutation.isPending}
                      onClick={() => gradeValue !== '' && gradeMutation.mutate(Number(gradeValue))}
                    >
                      حفظ
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingGrade(false)}>
                      إلغاء
                    </Button>
                  </div>
                ) : (
                  <button type="button" onClick={startEditGrade} className="text-lazward-700 hover:underline">
                    {session.grade != null
                      ? session.grade
                      : session.suggested_grade != null
                        ? `${session.suggested_grade} (مقترحة)`
                        : 'تحديد الدرجة'}
                  </button>
                )}
              </dd>
            </div>
          </dl>
        </Card>

        <Card>
          <h2 className="mb-2 text-sm font-semibold text-hibr">التسجيل الصوتي</h2>
          {session.recording?.status === 'ready' ? (
            // eslint-disable-next-line jsx-a11y/media-has-caption
            <audio controls className="w-full" src={`/api/sessions/${session.id}/audio`}>
              متصفحك لا يدعم تشغيل الصوت.
            </audio>
          ) : (
            <EmptyState message="المشغّل الصوتي قيد الإنشاء" />
          )}
          {session.summary && (
            <div className="mt-4">
              <h3 className="mb-1 text-sm font-semibold text-hibr">ملخص الجلسة</h3>
              <p className="text-sm text-hibr-2">{session.summary}</p>
            </div>
          )}
        </Card>
      </div>

      <h2 className="mb-3 font-display text-xl text-hibr">الملاحظات</h2>
      {sortedNotes.length === 0 ? (
        <EmptyState message="لا ملاحظات في هذه الجلسة" />
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>الوقت</TableHeaderCell>
              <TableHeaderCell>الفئة</TableHeaderCell>
              <TableHeaderCell>النوع الفرعي</TableHeaderCell>
              <TableHeaderCell>التصحيح</TableHeaderCell>
              <TableHeaderCell>الشدة</TableHeaderCell>
              <TableHeaderCell>الموضع</TableHeaderCell>
              <TableHeaderCell>ملاحظة</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {sortedNotes.map((note) => {
              const category = categoryById.get(note.category_id)
              const subtype = note.subtype_id ? subtypeById.get(note.subtype_id) : undefined
              return (
                <TableRow key={note.id}>
                  <TableCell className="font-time tabular-nums">
                    {note.timestamp_ms != null ? formatDuration(note.timestamp_ms) : '—'}
                  </TableCell>
                  <TableCell>
                    {category ? <Badge variant={noteBadgeVariant(category.color)}>{category.name}</Badge> : '—'}
                  </TableCell>
                  <TableCell>{subtype?.name ?? '—'}</TableCell>
                  <TableCell>{note.correction_mode ? correctionModeLabels[note.correction_mode] : '—'}</TableCell>
                  <TableCell>{note.severity ? severityLabels[note.severity] : '—'}</TableCell>
                  <TableCell>
                    {note.surah != null && note.ayah != null ? <AyahChip surah={String(note.surah)} ayah={note.ayah} /> : '—'}
                  </TableCell>
                  <TableCell className="max-w-[220px] truncate" title={note.text ?? undefined}>
                    {note.text ?? '—'}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
