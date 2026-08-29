// صفحة المستخدمين (admin فقط): جدول الحسابات، وإضافة/تعديل عبر نافذة موحّدة تشمل
// تغيير الدور والتفعيل/التعطيل وتعيين كلمة مرور جديدة اختيارياً.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { ApiError } from '../api/client'
import { createUser, fetchUsers, updateUser } from '../api/users'
import type { ManagedUser } from '../api/users'
import { roleLabels } from '../auth/AuthContext'
import type { UserRole } from '../auth/AuthContext'
import { formatDualDate } from '../lib/date'
import { Badge } from '../ui/Badge'
import type { BadgeVariant } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'
import { PageHeader } from '../ui/PageHeader'
import { PasswordField } from '../ui/PasswordField'
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
import { useToast } from '../ui/Toast'
import { IconPlus } from '../ui/icons'

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: 'admin', label: roleLabels.admin },
  { value: 'supervisor', label: roleLabels.supervisor },
  { value: 'teacher', label: roleLabels.teacher },
  { value: 'student', label: roleLabels.student },
]

const ROLE_BADGE_VARIANT: Record<UserRole, BadgeVariant> = {
  admin: 'lazward',
  supervisor: 'lazward',
  teacher: 'neutral',
  student: 'neutral',
}

interface UserFormState {
  username: string
  password: string
  full_name: string
  role: UserRole
  is_active: boolean
}

function emptyForm(): UserFormState {
  return { username: '', password: '', full_name: '', role: 'teacher', is_active: true }
}

function formFromUser(user: ManagedUser): UserFormState {
  return {
    username: user.username,
    password: '',
    full_name: user.full_name,
    role: user.role,
    is_active: user.is_active,
  }
}

export function UsersPage() {
  const queryClient = useQueryClient()
  const toast = useToast()

  const usersQuery = useQuery({
    queryKey: ['users', {}],
    queryFn: () => fetchUsers(),
  })
  const users = usersQuery.data ?? []

  const [modalOpen, setModalOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null)
  const [form, setForm] = useState<UserFormState>(emptyForm())
  const [fieldError, setFieldError] = useState<string | undefined>()

  function openCreateModal() {
    setEditingUser(null)
    setForm(emptyForm())
    setFieldError(undefined)
    setModalOpen(true)
  }

  function openEditModal(user: ManagedUser) {
    setEditingUser(user)
    setForm(formFromUser(user))
    setFieldError(undefined)
    setModalOpen(true)
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (editingUser) {
        return updateUser(editingUser.id, {
          full_name: form.full_name.trim(),
          role: form.role,
          is_active: form.is_active,
          password: form.password || undefined,
        })
      }
      return createUser({
        username: form.username.trim(),
        password: form.password,
        full_name: form.full_name.trim(),
        role: form.role,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      setModalOpen(false)
      toast.show(editingUser ? 'تم حفظ تعديلات المستخدم' : 'تمت إضافة المستخدم')
    },
    onError: (error: unknown) => {
      const detail = error instanceof ApiError ? error.detail : 'تعذر الاتصال بالخادم، يرجى المحاولة لاحقاً'
      toast.show(detail, 'error')
    },
  })

  function handleSubmit() {
    setFieldError(undefined)
    if (!editingUser && !form.username.trim()) {
      setFieldError('اسم المستخدم مطلوب')
      return
    }
    if (!form.full_name.trim()) {
      toast.show('الاسم الكامل مطلوب', 'error')
      return
    }
    if (!editingUser && form.password.length < 8) {
      toast.show('كلمة المرور يجب ألا تقل عن 8 خانات', 'error')
      return
    }
    if (editingUser && form.password && form.password.length < 8) {
      toast.show('كلمة المرور الجديدة يجب ألا تقل عن 8 خانات', 'error')
      return
    }
    saveMutation.mutate()
  }

  const passwordValue = form.password
  const passwordStrengthLabel =
    passwordValue.length === 0 ? '' : passwordValue.length >= 8 ? 'طول مناسب' : 'قصيرة — 8 خانات على الأقل'

  return (
    <div>
      <PageHeader
        title="المستخدمون"
        description="حسابات الدخول إلى نظام الإدارة"
        actions={
          <Button onClick={openCreateModal}>
            <IconPlus className="h-4 w-4" />
            إضافة مستخدم
          </Button>
        }
      />

      {usersQuery.isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner size={28} tone="lazward" />
        </div>
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>اسم المستخدم</TableHeaderCell>
              <TableHeaderCell>الاسم الكامل</TableHeaderCell>
              <TableHeaderCell>الدور</TableHeaderCell>
              <TableHeaderCell>الحالة</TableHeaderCell>
              <TableHeaderCell>تاريخ الإنشاء</TableHeaderCell>
              <TableHeaderCell><span className="sr-only">إجراءات</span></TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {users.length === 0 ? (
              <TableEmptyRow
                colSpan={6}
                message="لا مستخدمون بعد — أضف أول مستخدم"
                action={<Button size="sm" onClick={openCreateModal}>إضافة مستخدم</Button>}
              />
            ) : (
              users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">{user.username}</TableCell>
                  <TableCell>{user.full_name}</TableCell>
                  <TableCell>
                    <Badge variant={ROLE_BADGE_VARIANT[user.role]}>{roleLabels[user.role]}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={user.is_active ? 'sahih' : 'neutral'}>
                      {user.is_active ? 'نشط' : 'معطّل'}
                    </Badge>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm text-hibr-2">
                    {formatDualDate(user.created_at)}
                  </TableCell>
                  <TableCell>
                    <Button size="sm" variant="ghost" onClick={() => openEditModal(user)}>
                      تعديل
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingUser ? 'تعديل المستخدم' : 'إضافة مستخدم'}
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
            label="اسم المستخدم"
            required
            disabled={Boolean(editingUser)}
            error={fieldError}
            value={form.username}
            onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))}
          />
          <TextField
            label="الاسم الكامل"
            required
            value={form.full_name}
            onChange={(event) => setForm((current) => ({ ...current, full_name: event.target.value }))}
          />
          <Select
            label="الدور"
            options={ROLE_OPTIONS}
            value={form.role}
            onChange={(event) => setForm((current) => ({ ...current, role: event.target.value as UserRole }))}
          />
          <PasswordField
            label={editingUser ? 'تعيين كلمة مرور جديدة (اختياري)' : 'كلمة المرور'}
            required={!editingUser}
            help={passwordStrengthLabel || 'ثماني خانات على الأقل'}
            value={form.password}
            onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
          />
          {editingUser && (
            <Switch
              id="user-is-active"
              checked={form.is_active}
              onChange={(checked) => setForm((current) => ({ ...current, is_active: checked }))}
              label="الحساب نشط"
            />
          )}
        </div>
      </Modal>
    </div>
  )
}
