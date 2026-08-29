// صفحة الطلاب: شريط بحث فوري وفلتر حلقة ومفتاح إظهار غير النشطين، جدول بترقيم بسيط،
// ونافذة موحّدة للإضافة والتعديل. اسم الطالب ينقل إلى صفحة ملفه (لاحقاً).

import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

import { fetchGroups } from '../api/groups'
import { fetchStudents } from '../api/students'
import type { Student } from '../api/students'
import { useAuth } from '../auth/AuthContext'
import { formatDualDate } from '../lib/date'
import { useDebouncedValue } from '../lib/useDebouncedValue'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { PageHeader } from '../ui/PageHeader'
import { Select } from '../ui/Select'
import { Spinner } from '../ui/Spinner'
import { Switch } from '../ui/Switch'
import {
  Table,
  TableBody,
  TableCell,
  TableEmptyRow,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '../ui/Table'
import { TextField } from '../ui/TextField'
import { IconPlus } from '../ui/icons'
import { StudentFormModal } from './StudentFormModal'

const PAGE_SIZE = 50

export function StudentsPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const isTeacher = user?.role === 'teacher'

  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search, 300)
  const [groupFilter, setGroupFilter] = useState(searchParams.get('group_id') ?? '')
  const [showInactive, setShowInactive] = useState(false)
  const [page, setPage] = useState(1)

  // إعادة الصفحة إلى 1 عند تغيّر الفلاتر — يُشتق أثناء الرندر بدل useEffect (نمط
  // React الموصى به لضبط الحالة استجابةً لتغيّر مدخلات أخرى، بلا رندر إضافي).
  const filtersKey = `${debouncedSearch}|${groupFilter}|${showInactive}`
  const [appliedFiltersKey, setAppliedFiltersKey] = useState(filtersKey)
  if (filtersKey !== appliedFiltersKey) {
    setAppliedFiltersKey(filtersKey)
    setPage(1)
  }

  const groupsQuery = useQuery({
    queryKey: ['groups', { include_inactive: false }],
    queryFn: () => fetchGroups(),
  })
  const groups = groupsQuery.data ?? []

  const studentsQuery = useQuery({
    queryKey: [
      'students',
      { group_id: groupFilter || undefined, q: debouncedSearch || undefined, include_inactive: showInactive },
    ],
    queryFn: () =>
      fetchStudents({
        group_id: groupFilter || undefined,
        q: debouncedSearch || undefined,
        include_inactive: showInactive,
      }),
  })

  const groupNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const group of groupsQuery.data ?? []) map.set(group.id, group.name)
    return map
  }, [groupsQuery.data])

  const students = studentsQuery.data ?? []
  const totalPages = Math.max(1, Math.ceil(students.length / PAGE_SIZE))
  const pageStudents = students.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const [modalOpen, setModalOpen] = useState(false)
  const [editingStudent, setEditingStudent] = useState<Student | null>(null)

  function openCreateModal() {
    setEditingStudent(null)
    setModalOpen(true)
  }

  function openEditModal(student: Student) {
    setEditingStudent(student)
    setModalOpen(true)
  }

  const groupOptions = groups.map((group) => ({ value: group.id, label: group.name }))

  function handleGroupFilterChange(value: string) {
    setGroupFilter(value)
    const next = new URLSearchParams(searchParams)
    if (value) next.set('group_id', value)
    else next.delete('group_id')
    setSearchParams(next, { replace: true })
  }

  return (
    <div>
      <PageHeader
        title="الطلاب"
        description="سجل الطلاب في كل الحلقات"
        actions={
          <Button onClick={openCreateModal}>
            <IconPlus className="h-4 w-4" />
            إضافة طالب
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="w-full max-w-[260px]">
          <TextField
            label="البحث بالاسم"
            placeholder="اكتب اسم الطالب..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <div className="w-full max-w-[220px]">
          <Select
            label="الحلقة"
            placeholder="كل الحلقات"
            options={groupOptions}
            value={groupFilter}
            onChange={(event) => handleGroupFilterChange(event.target.value)}
          />
        </div>
        <div className="pb-2.5">
          <Switch checked={showInactive} onChange={setShowInactive} label="إظهار غير النشطين" />
        </div>
      </div>

      {studentsQuery.isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner size={28} tone="lazward" />
        </div>
      ) : (
        <>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>الاسم الكامل</TableHeaderCell>
                <TableHeaderCell>الحلقة</TableHeaderCell>
                <TableHeaderCell>هاتف ولي الأمر</TableHeaderCell>
                <TableHeaderCell>سنة الميلاد</TableHeaderCell>
                <TableHeaderCell>الحالة</TableHeaderCell>
                <TableHeaderCell>تاريخ الالتحاق</TableHeaderCell>
                <TableHeaderCell><span className="sr-only">إجراءات</span></TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {pageStudents.length === 0 ? (
                <TableEmptyRow
                  colSpan={7}
                  message="لا طلاب بعد — أضف أول طالب"
                  action={<Button size="sm" onClick={openCreateModal}>إضافة طالب</Button>}
                />
              ) : (
                pageStudents.map((student) => (
                  <TableRow key={student.id}>
                    <TableCell className="font-medium">
                      <button
                        type="button"
                        onClick={() => navigate(`/students/${student.id}`)}
                        className="text-start text-lazward-700 hover:underline"
                      >
                        {student.full_name}
                      </button>
                    </TableCell>
                    <TableCell>{student.group_id ? groupNameById.get(student.group_id) ?? '—' : '—'}</TableCell>
                    <TableCell className="whitespace-nowrap">{student.guardian_phone ?? '—'}</TableCell>
                    <TableCell>{student.birth_year ?? '—'}</TableCell>
                    <TableCell>
                      <Badge variant={student.is_active ? 'sahih' : 'neutral'}>
                        {student.is_active ? 'نشط' : 'معطّل'}
                      </Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-hibr-2">
                      {formatDualDate(student.joined_at)}
                    </TableCell>
                    <TableCell>
                      <Button size="sm" variant="ghost" onClick={() => openEditModal(student)}>
                        تعديل
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          {students.length > PAGE_SIZE && (
            <div className="mt-3 flex items-center justify-between text-sm text-hibr-2">
              <span>
                صفحة {page} من {totalPages} — {students.length} طالباً
              </span>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  السابق
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  التالي
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      <StudentFormModal
        open={modalOpen}
        student={editingStudent}
        groupOptions={groupOptions}
        isTeacher={isTeacher}
        defaultGroupId={isTeacher ? '' : groupFilter}
        onClose={() => setModalOpen(false)}
      />
    </div>
  )
}
