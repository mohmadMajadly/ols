// /me — بوابة الطالب: نفس مكوّنات ملف الطالب (StudentProfileContent) بقراءة فقط، بلا أي
// زر تعديل أو بدء جلسة. تُستخدم بيانات /students/me و/students/me/stats حصراً — لا
// تمرَّر أي معرّف طالب من العنوان، فلا مجال لطلب بيانات طالب آخر من هذه الصفحة.

import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { fetchSurahs } from '../api/quran'
import type { SessionType } from '../api/sessions'
import { fetchSessions } from '../api/sessions'
import { fetchMyStudent, fetchMyStudentStats } from '../api/students'
import { formatDualDate } from '../lib/date'
import { buildSurahNameMap } from '../lib/surahName'
import { EmptyState } from '../ui/EmptyState'
import { PageHeader } from '../ui/PageHeader'
import { Spinner } from '../ui/Spinner'
import { StudentProfileContent } from './StudentProfileContent'

export function StudentPortalPage() {
  const navigate = useNavigate()

  const studentQuery = useQuery({ queryKey: ['students', 'me'], queryFn: fetchMyStudent })
  const statsQuery = useQuery({
    queryKey: ['students', 'me', 'stats'],
    queryFn: fetchMyStudentStats,
    enabled: Boolean(studentQuery.data),
  })
  const surahsQuery = useQuery({ queryKey: ['quran', 'surahs'], queryFn: fetchSurahs, staleTime: Infinity })

  const [sessionTypeFilter, setSessionTypeFilter] = useState('')
  const sessionsQuery = useQuery({
    queryKey: ['sessions', 'list', 'me', { session_type: sessionTypeFilter || undefined }],
    queryFn: () => fetchSessions({ session_type: (sessionTypeFilter || undefined) as SessionType | undefined, limit: 100 }),
    enabled: Boolean(studentQuery.data),
  })

  const surahNames = buildSurahNameMap(surahsQuery.data ?? [])

  if (studentQuery.isLoading) {
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
        <PageHeader title="صفحتي" />
        <EmptyState message="لا يوجد سجل طالب مربوط بحسابك — يرجى مراجعة إدارة الحلقة" />
      </div>
    )
  }

  const description = [`رقم القيد منذ ${formatDualDate(student.joined_at)}`].join(' · ')

  return (
    <div>
      <PageHeader title={`مرحباً، ${student.full_name}`} description={description} />

      <StudentProfileContent
        stats={statsQuery.data}
        statsLoading={statsQuery.isLoading}
        sessions={sessionsQuery.data}
        sessionsLoading={sessionsQuery.isLoading}
        surahNames={surahNames}
        sessionTypeFilter={sessionTypeFilter}
        onSessionTypeFilterChange={setSessionTypeFilter}
        onSessionClick={(sessionId) => navigate(`/me/sessions/${sessionId}`)}
        readOnly
        titles={{
          gradesTrend: 'درجاتك',
          errorsByCategory: 'أخطاؤك حسب التصنيف',
          topMistakes: 'أكثر ما تستحق مراجعته',
          repeatedMistakes: 'مواضع تستحق مراجعتك',
          sessionsHeading: 'سجل جلساتك',
        }}
      />
    </div>
  )
}
