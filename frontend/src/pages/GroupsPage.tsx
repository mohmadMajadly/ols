// صفحة الحلقات: جدول الحلقات مع اسم المعلم وعدد الطلاب والحالة، ونافذة موحّدة
// للإضافة والتعديل. النقر على صف ينقل إلى قائمة طلاب تلك الحلقة.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { createGroup, fetchGroups, updateGroup } from '../api/groups'
import type { Group } from '../api/groups'
import { fetchUsers } from '../api/users'
import { ApiError } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { formatDualDate } from '../lib/date'
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

const GROUPS_QUERY_KEY = ['groups', { include_inactive: true }]

interface GroupFormState {
  name: string
  description: string
  teacher_id: string
  is_active: boolean
}

function emptyForm(): GroupFormState {
  return { name: '', description: '', teacher_id: '', is_active: true }
}

function formFromGroup(group: Group): GroupFormState {
  return {
    name: group.name,
    description: group.description ?? '',
    teacher_id: group.teacher_id ?? '',
    is_active: group.is_active,
  }
}

export function GroupsPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const toast = useToast()

  const canManage = user?.role === 'admin' || user?.role === 'supervisor'
  const canListTeachers = user?.role === 'admin' || user?.role === 'supervisor'

  const groupsQuery = useQuery({
    queryKey: GROUPS_QUERY_KEY,
    queryFn: () => fetchGroups({ include_inactive: true }),
  })

  const teachersQuery = useQuery({
    queryKey: ['users', { role: 'teacher' }],
    queryFn: () => fetchUsers({ role: 'teacher' }),
    enabled: canListTeachers,
  })

  const teacherNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const teacher of teachersQuery.data ?? []) map.set(teacher.id, teacher.full_name)
    return map
  }, [teachersQuery.data])

  function teacherName(teacherId: string | null): string {
    if (!teacherId) return '—'
    if (canListTeachers) return teacherNameById.get(teacherId) ?? '—'
    if (user && user.id === teacherId) return user.full_name
    return '—'
  }

  const [modalOpen, setModalOpen] = useState(false)
  const [editingGroup, setEditingGroup] = useState<Group | null>(null)
  const [form, setForm] = useState<GroupFormState>(emptyForm())
  const [nameError, setNameError] = useState<string | undefined>()

  function openCreateModal() {
    setEditingGroup(null)
    setForm(emptyForm())
    setNameError(undefined)
    setModalOpen(true)
  }

  function openEditModal(group: Group) {
    setEditingGroup(group)
    setForm(formFromGroup(group))
    setNameError(undefined)
    setModalOpen(true)
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        teacher_id: form.teacher_id || null,
      }
      if (editingGroup) {
        return updateGroup(editingGroup.id, { ...payload, is_active: form.is_active })
      }
      return createGroup(payload)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] })
      setModalOpen(false)
      toast.show(editingGroup ? 'تم حفظ تعديلات الحلقة' : 'تمت إضافة الحلقة')
    },
    onError: (error: unknown) => {
      const detail = error instanceof ApiError ? error.detail : 'تعذر الاتصال بالخادم، يرجى المحاولة لاحقاً'
      if (error instanceof ApiError && error.status === 409) {
        setNameError(detail)
        return
      }
      toast.show(detail, 'error')
    },
  })

  function handleSubmit() {
    setNameError(undefined)
    if (!form.name.trim()) {
      setNameError('اسم الحلقة مطلوب')
      return
    }
    saveMutation.mutate()
  }

  const teacherOptions = (teachersQuery.data ?? []).map((teacher) => ({
    value: teacher.id,
    label: teacher.full_name,
  }))

  const groups = groupsQuery.data ?? []

  return (
    <div>
      <PageHeader
        title="الحلقات"
        description="حلقات التحفيظ والمعلمون المسؤولون عنها"
        actions={
          canManage ? (
            <Button onClick={openCreateModal}>
              <IconPlus className="h-4 w-4" />
              إضافة حلقة
            </Button>
          ) : undefined
        }
      />

      {groupsQuery.isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner size={28} tone="lazward" />
        </div>
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>اسم الحلقة</TableHeaderCell>
              <TableHeaderCell>المعلم</TableHeaderCell>
              <TableHeaderCell>عدد الطلاب</TableHeaderCell>
              <TableHeaderCell>الحالة</TableHeaderCell>
              <TableHeaderCell>تاريخ الإنشاء</TableHeaderCell>
              {canManage && <TableHeaderCell><span className="sr-only">إجراءات</span></TableHeaderCell>}
            </TableRow>
          </TableHead>
          <TableBody>
            {groups.length === 0 ? (
              <TableEmptyRow
                colSpan={canManage ? 6 : 5}
                message="لا حلقات بعد — أضف أول حلقة"
                action={canManage ? <Button size="sm" onClick={openCreateModal}>إضافة حلقة</Button> : undefined}
              />
            ) : (
              groups.map((group) => (
                <TableRow
                  key={group.id}
                  className="cursor-pointer"
                  onClick={() => navigate(`/students?group_id=${group.id}`)}
                >
                  <TableCell className="font-medium">{group.name}</TableCell>
                  <TableCell>{teacherName(group.teacher_id)}</TableCell>
                  <TableCell>{group.students_count}</TableCell>
                  <TableCell>
                    <Badge variant={group.is_active ? 'sahih' : 'neutral'}>
                      {group.is_active ? 'نشطة' : 'معطّلة'}
                    </Badge>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm text-hibr-2">
                    {formatDualDate(group.created_at)}
                  </TableCell>
                  {canManage && (
                    <TableCell onClick={(event) => event.stopPropagation()}>
                      <Button size="sm" variant="ghost" onClick={() => openEditModal(group)}>
                        تعديل
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingGroup ? 'تعديل الحلقة' : 'إضافة حلقة'}
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
            label="اسم الحلقة"
            required
            value={form.name}
            error={nameError}
            onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
          />
          <TextArea
            label="الوصف"
            value={form.description}
            onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
          />
          <Select
            label="المعلم"
            placeholder="بدون معلم"
            options={teacherOptions}
            value={form.teacher_id}
            disabled={!canListTeachers}
            onChange={(event) => setForm((current) => ({ ...current, teacher_id: event.target.value }))}
          />
          {editingGroup && (
            <Switch
              id="group-is-active"
              checked={form.is_active}
              onChange={(checked) => setForm((current) => ({ ...current, is_active: checked }))}
              label="الحلقة نشطة"
            />
          )}
        </div>
      </Modal>
    </div>
  )
}
