// صفحة الطلاب: شريط بحث فوري وفلتر حلقة ومفتاح إظهار غير النشطين، جدول بترقيم بسيط،
// ونافذة موحّدة للإضافة والتعديل. اسم الطالب ينقل إلى صفحة ملفه (لاحقاً).

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

import { ApiError } from '../api/client'
import { fetchGroups } from '../api/groups'
import { createStudent, fetchStudents, updateStudent } from '../api/students'
import type { Student } from '../api/students'
import { useAuth } from '../auth/AuthContext'
import { formatDualDate } from '../lib/date'
import { useDebouncedValue } from '../lib/useDebouncedValue'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'
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
import { TextArea } from '../ui/TextArea'
import { TextField } from '../ui/TextField'
import { useToast } from '../ui/Toast'
import { IconPlus } from '../ui/icons'

const PAGE_SIZE = 50

interface StudentFormState {
  full_name: string
  group_id: string
  phone: string
  guardian_phone: string
  birth_year: string
  memorization_note: string
  is_active: boolean
}

function emptyForm(defaultGroupId = ''): StudentFormState {
  return {
    full_name: '',
    group_id: defaultGroupId,
    phone: '',
    guardian_phone: '',
    birth_year: '',
    memorization_note: '',
    is_active: true,
  }
}

function formFromStudent(student: Student): StudentFormState {
  return {
    full_name: student.full_name,
    group_id: student.group_id ?? '',
    phone: student.phone ?? '',
    guardian_phone: student.guardian_phone ?? '',
    birth_year: student.birth_year ? String(student.birth_year) : '',
    memorization_note: student.memorization_note ?? '',
    is_active: student.is_active,
  }
}

export function StudentsPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const toast = useToast()
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
  const [form, setForm] = useState<StudentFormState>(emptyForm())
  const [groupError, setGroupError] = useState<string | undefined>()

  function openCreateModal() {
    setEditingStudent(null)
    setForm(emptyForm(isTeacher ? '' : groupFilter))
    setGroupError(undefined)
    setModalOpen(true)
  }

  function openEditModal(student: Student) {
    setEditingStudent(student)
    setForm(formFromStudent(student))
    setGroupError(undefined)
    setModalOpen(true)
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        full_name: form.full_name.trim(),
        group_id: form.group_id || null,
        phone: form.phone.trim() || null,
        guardian_phone: form.guardian_phone.trim() || null,
        birth_year: form.birth_year ? Number(form.birth_year) : null,
        memorization_note: form.memorization_note.trim() || null,
      }
      if (editingStudent) {
        return updateStudent(editingStudent.id, { ...payload, is_active: form.is_active })
      }
      return createStudent(payload)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['students'] })
      queryClient.invalidateQueries({ queryKey: ['groups'] })
      setModalOpen(false)
      toast.show(editingStudent ? 'تم حفظ تعديلات الطالب' : 'تمت إضافة الطالب')
    },
    onError: (error: unknown) => {
      const detail = error instanceof ApiError ? error.detail : 'تعذر الاتصال بالخادم، يرجى المحاولة لاحقاً'
      toast.show(detail, 'error')
    },
  })

  function handleSubmit() {
    setGroupError(undefined)
    if (!form.full_name.trim()) {
      toast.show('اسم الطالب مطلوب', 'error')
      return
    }
    if (isTeacher && !form.group_id) {
      setGroupError('اختيار الحلقة مطلوب')
      return
    }
    saveMutation.mutate()
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

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingStudent ? 'تعديل بيانات الطالب' : 'إضافة طالب'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              إلغاء
            </Button>
            <Button onClick={handleSubmit} loading={saveMutation.isPending}>
              حفظ
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <TextField
            label="الاسم الكامل"
            required
            value={form.full_name}
            onChange={(event) => setForm((current) => ({ ...current, full_name: event.target.value }))}
          />
          <Select
            label="الحلقة"
            placeholder={isTeacher ? undefined : 'بدون حلقة'}
            required={isTeacher}
            error={groupError}
            options={groupOptions}
            value={form.group_id}
            onChange={(event) => setForm((current) => ({ ...current, group_id: event.target.value }))}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="هاتف الطالب"
              value={form.phone}
              onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
            />
            <TextField
              label="هاتف ولي الأمر"
              value={form.guardian_phone}
              onChange={(event) => setForm((current) => ({ ...current, guardian_phone: event.target.value }))}
            />
          </div>
          <TextField
            label="سنة الميلاد"
            type="number"
            value={form.birth_year}
            onChange={(event) => setForm((current) => ({ ...current, birth_year: event.target.value }))}
          />
          <TextArea
            label="ملاحظات الحفظ"
            value={form.memorization_note}
            onChange={(event) => setForm((current) => ({ ...current, memorization_note: event.target.value }))}
          />
          {editingStudent && (
            <Switch
              id="student-is-active"
              checked={form.is_active}
              onChange={(checked) => setForm((current) => ({ ...current, is_active: checked }))}
              label="الطالب نشط"
            />
          )}
        </div>
      </Modal>
    </div>
  )
}
