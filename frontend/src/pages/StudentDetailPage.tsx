// صفحة ملف الطالب — عنصر نائب مؤقت: تعرض اسم الطالب في الترويسة وحالة فارغة تشير
// إلى أن الملف الكامل (سبقيات، تقدّم الحفظ...) حزمة لاحقة.

import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'

import { fetchStudent } from '../api/students'
import { EmptyState } from '../ui/EmptyState'
import { PageHeader } from '../ui/PageHeader'
import { Spinner } from '../ui/Spinner'

export function StudentDetailPage() {
  const { id } = useParams<{ id: string }>()

  const studentQuery = useQuery({
    queryKey: ['students', id],
    queryFn: () => fetchStudent(id as string),
    enabled: Boolean(id),
  })

  if (studentQuery.isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner size={28} tone="lazward" />
      </div>
    )
  }

  const student = studentQuery.data

  return (
    <div>
      <PageHeader title={student?.full_name ?? 'الطالب'} description="ملف الطالب" />
      <EmptyState message="ملف الطالب قيد الإنشاء" />
    </div>
  )
}
