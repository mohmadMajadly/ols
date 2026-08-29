// /sessions — سجل الجلسات (عالم الورق العادي). زر بدء جلسة تسميع (أو تنبيه جلسة جارية)،
// فلاتر (طالب/نوع/فترة)، وجدول الجلسات. النقر على صف ينقل إلى تفاصيل الجلسة.

import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import type { SessionStatus, SessionType } from '../../api/sessions'
import { fetchActiveSession, fetchSessions } from '../../api/sessions'
import { fetchStudents } from '../../api/students'
import { formatDualDate } from '../../lib/date'
import { sessionStatusLabels, sessionTypeLabels } from '../../lib/sessionLabels'
import type { BadgeVariant } from '../../ui/Badge'
import { Badge } from '../../ui/Badge'
import { AyahChip } from '../../ui/AyahChip'
import { Button } from '../../ui/Button'
import { PageHeader } from '../../ui/PageHeader'
import { Select } from '../../ui/Select'
import { Spinner } from '../../ui/Spinner'
import {
  Table,
  TableBody,
  TableCell,
  TableEmptyRow,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '../../ui/Table'
import { TextField } from '../../ui/TextField'
import { IconPlus } from '../../ui/icons'
import { ActiveSessionBanner } from './ActiveSessionBanner'
import { SessionSetupModal } from './SessionSetupModal'

const STATUS_BADGE: Record<SessionStatus, BadgeVariant> = {
  recording: 'lazward',
  completed: 'sahih',
  cancelled: 'neutral',
}

export function SessionsPage() {
  const navigate = useNavigate()

  const activeQuery = useQuery({ queryKey: ['sessions', 'active'], queryFn: fetchActiveSession })
  const studentsQuery = useQuery({ queryKey: ['students', { include_inactive: true }], queryFn: () => fetchStudents({ include_inactive: true }) })

  const [studentFilter, setStudentFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [fromFilter, setFromFilter] = useState('')
  const [toFilter, setToFilter] = useState('')
  const [setupOpen, setSetupOpen] = useState(false)

  const sessionsQuery = useQuery({
    queryKey: [
      'sessions',
      'list',
      { student_id: studentFilter || undefined, session_type: typeFilter || undefined, from: fromFilter || undefined, to: toFilter || undefined },
    ],
    queryFn: () =>
      fetchSessions({
        student_id: studentFilter || undefined,
        session_type: (typeFilter || undefined) as SessionType | undefined,
        from: fromFilter || undefined,
        to: toFilter || undefined,
        limit: 100,
      }),
  })

  const studentOptions = useMemo(
    () => (studentsQuery.data ?? []).map((s) => ({ value: s.id, label: s.full_name })),
    [studentsQuery.data],
  )
  const typeOptions = Object.entries(sessionTypeLabels).map(([value, label]) => ({ value, label }))

  const sessions = sessionsQuery.data ?? []
  const hasActiveSession = Boolean(activeQuery.data?.session)

  return (
    <div>
      <PageHeader
        title="سجل الجلسات"
        description="جلسات التسميع المسجّلة، وجدولة جلسة جديدة"
        actions={
          !hasActiveSession ? (
            <Button onClick={() => setSetupOpen(true)}>
              <IconPlus className="h-4 w-4" />
              بدء جلسة تسميع
            </Button>
          ) : undefined
        }
      />

      {activeQuery.data?.session && <ActiveSessionBanner session={activeQuery.data.session} />}

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="w-full max-w-[220px]">
          <Select
            label="الطالب"
            placeholder="كل الطلاب"
            options={studentOptions}
            value={studentFilter}
            onChange={(event) => setStudentFilter(event.target.value)}
          />
        </div>
        <div className="w-full max-w-[180px]">
          <Select
            label="النوع"
            placeholder="كل الأنواع"
            options={typeOptions}
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value)}
          />
        </div>
        <div className="w-full max-w-[150px]">
          <TextField label="من تاريخ" type="date" value={fromFilter} onChange={(event) => setFromFilter(event.target.value)} />
        </div>
        <div className="w-full max-w-[150px]">
          <TextField label="إلى تاريخ" type="date" value={toFilter} onChange={(event) => setToFilter(event.target.value)} />
        </div>
      </div>

      {sessionsQuery.isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner size={28} tone="lazward" />
        </div>
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>التاريخ</TableHeaderCell>
              <TableHeaderCell>الطالب</TableHeaderCell>
              <TableHeaderCell>النوع</TableHeaderCell>
              <TableHeaderCell>النطاق</TableHeaderCell>
              <TableHeaderCell>الملاحظات</TableHeaderCell>
              <TableHeaderCell>الدرجة</TableHeaderCell>
              <TableHeaderCell>الحالة</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {sessions.length === 0 ? (
              <TableEmptyRow
                colSpan={7}
                message="لا جلسات بعد — ابدأ أول جلسة تسميع"
                action={
                  !hasActiveSession ? (
                    <Button size="sm" onClick={() => setSetupOpen(true)}>
                      بدء جلسة تسميع
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              sessions.map((session) => {
                const hasRange = session.range_start_surah != null && session.range_end_surah != null
                const grade = session.grade ?? session.suggested_grade
                return (
                  <TableRow key={session.id} className="cursor-pointer" onClick={() => navigate(`/sessions/${session.id}`)}>
                    <TableCell className="whitespace-nowrap text-sm text-hibr-2">{formatDualDate(session.started_at)}</TableCell>
                    <TableCell className="font-medium">{session.student_name}</TableCell>
                    <TableCell>
                      <Badge variant="neutral">{sessionTypeLabels[session.session_type]}</Badge>
                    </TableCell>
                    <TableCell>
                      {hasRange ? (
                        <span className="flex items-center gap-1 whitespace-nowrap">
                          <AyahChip surah={String(session.range_start_surah)} ayah={session.range_start_ayah as number} />
                          <span className="text-hibr-3">—</span>
                          <AyahChip surah={String(session.range_end_surah)} ayah={session.range_end_ayah as number} />
                        </span>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell>{session.notes_count}</TableCell>
                    <TableCell>
                      {grade != null ? (session.grade != null ? grade : `${grade}~`) : '—'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_BADGE[session.status]}>{sessionStatusLabels[session.status]}</Badge>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      )}

      <SessionSetupModal open={setupOpen} onClose={() => setSetupOpen(false)} />
    </div>
  )
}
