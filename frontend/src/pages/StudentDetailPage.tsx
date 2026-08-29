// ملف الطالب الكامل — رأس ببيانات الطالب وأزرار سريعة، بطاقات إحصائية، مسار الدرجات
// وتوزيع الأخطاء (مكوّنات الرسوم العامة من charts/)، أكثر الأخطاء تكراراً، مواضع متكررة
// تستحق مراجعة، وسجل جلسات الطالب. يستبدل الـ placeholder المؤقت السابق.

import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { fetchGroups } from '../api/groups'
import { fetchSurahs } from '../api/quran'
import type { SessionType } from '../api/sessions'
import { fetchSessions } from '../api/sessions'
import { fetchStudent, fetchStudentStats } from '../api/students'
import { useAuth } from '../auth/AuthContext'
import { formatDualDate } from '../lib/date'
import { buildSurahNameMap } from '../lib/surahName'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { EmptyState } from '../ui/EmptyState'
import { PageHeader } from '../ui/PageHeader'
import { Spinner } from '../ui/Spinner'
import { StudentAccountActions } from './StudentAccountActions'
import { StudentFormModal } from './StudentFormModal'
import { StudentProfileContent } from './StudentProfileContent'

export function StudentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const isTeacher = user?.role === 'teacher'

  const studentQuery = useQuery({
    queryKey: ['students', id],
    queryFn: () => fetchStudent(id as string),
    enabled: Boolean(id),
  })
  const statsQuery = useQuery({
    queryKey: ['students', id, 'stats'],
    queryFn: () => fetchStudentStats(id as string),
    enabled: Boolean(id),
  })
  const groupsQuery = useQuery({ queryKey: ['groups', { include_inactive: true }], queryFn: () => fetchGroups({ include_inactive: true }) })
  const surahsQuery = useQuery({ queryKey: ['quran', 'surahs'], queryFn: fetchSurahs, staleTime: Infinity })

  const [sessionTypeFilter, setSessionTypeFilter] = useState('')
  const sessionsQuery = useQuery({
    queryKey: ['sessions', 'list', { student_id: id, session_type: sessionTypeFilter || undefined }],
    queryFn: () =>
      fetchSessions({ student_id: id, session_type: (sessionTypeFilter || undefined) as SessionType | undefined, limit: 100 }),
    enabled: Boolean(id),
  })

  const [editModalOpen, setEditModalOpen] = useState(false)

  const surahNames = buildSurahNameMap(surahsQuery.data ?? [])
  const groupName = useMemo(() => {
    const group = (groupsQuery.data ?? []).find((g) => g.id === studentQuery.data?.group_id)
    return group?.name ?? null
  }, [groupsQuery.data, studentQuery.data?.group_id])

  if (studentQuery.isLoading || !id) {
    return (
      <div className="flex justify-center py-16">
        <Spinner size={28} tone="lazward" />
      </div>
    )
  }

  const student = studentQuery.data
  if (!student) {
    return (
      <div>
        <PageHeader title="الطالب" />
        <EmptyState message="تعذّر العثور على هذا الطالب" />
      </div>
    )
  }

  const stats = statsQuery.data
  const isAccountManager = user?.role === 'admin' || user?.role === 'supervisor'

  const description = [
    groupName ?? 'بدون حلقة',
    `سنة الميلاد ${student.birth_year ?? '—'}`,
    `التحق ${formatDualDate(student.joined_at)}`,
  ].join(' · ')

  return (
    <div>
      <PageHeader
        title={student.full_name}
        description={description}
        actions={
          <>
            <Badge variant={student.is_active ? 'sahih' : 'neutral'}>{student.is_active ? 'نشط' : 'معطّل'}</Badge>
            <Button variant="secondary" onClick={() => setEditModalOpen(true)}>
              تعديل البيانات
            </Button>
            <Button onClick={() => navigate(`/sessions?student_id=${student.id}`)}>بدء جلسة تسميع</Button>
          </>
        }
      />

      {isAccountManager && (
        <div className="mb-6">
          <StudentAccountActions student={student} variant="full" />
        </div>
      )}

      <StudentProfileContent
        stats={stats}
        statsLoading={statsQuery.isLoading}
        sessions={sessionsQuery.data}
        sessionsLoading={sessionsQuery.isLoading}
        surahNames={surahNames}
        sessionTypeFilter={sessionTypeFilter}
        onSessionTypeFilterChange={setSessionTypeFilter}
        onSessionClick={(sessionId) => navigate(`/sessions/${sessionId}`)}
        onStartSession={() => navigate(`/sessions?student_id=${student.id}`)}
      />

      <StudentFormModal
        open={editModalOpen}
        student={student}
        groupOptions={(groupsQuery.data ?? []).map((g) => ({ value: g.id, label: g.name }))}
        isTeacher={isTeacher}
        onClose={() => setEditModalOpen(false)}
      />
    </div>
  )
}
