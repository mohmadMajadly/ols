// إدارة حساب دخول الطالب (admin/supervisor فقط، WP8): زر إنشاء حساب لمن لا حساب له
// (مع اقتراح اسم مستخدم لاتيني تلقائي)، وبطاقة تأكيد تعرض بيانات الدخول مرة واحدة فقط
// عند الإنشاء أو إعادة تعيين كلمة المرور. لمن له حساب: اسم المستخدم، حالته، وزر إعادة
// تعيين كلمة المرور (عبر مسار users القائم — لا مسارات جديدة).

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { ApiError } from '../api/client'
import type { Student } from '../api/students'
import { createStudentAccount } from '../api/students'
import { updateUser } from '../api/users'
import { generatePassword, suggestUsername } from '../lib/transliterate'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { Modal } from '../ui/Modal'
import { PasswordField } from '../ui/PasswordField'
import { TextField } from '../ui/TextField'
import { useToast } from '../ui/Toast'
import { IconCopy, IconRefresh } from '../ui/icons'

interface RevealedCredentials {
  username: string
  password: string
  mode: 'create' | 'reset'
}

async function copyToClipboard(value: string, toast: ReturnType<typeof useToast>) {
  try {
    await navigator.clipboard.writeText(value)
    toast.show('تم النسخ')
  } catch {
    toast.show('تعذّر النسخ — انسخ يدوياً', 'error')
  }
}

function CredentialsCard({ credentials }: { credentials: RevealedCredentials }) {
  const toast = useToast()
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-hibr-2" role="alert">
        انسخ البيانات وسلّمها للطالب الآن — كلمة المرور لن تظهر مرة أخرى.
      </p>
      <Card className="border-lazward-700/30 bg-lazward-100/40">
        <dl className="flex flex-col gap-2 text-sm">
          <div className="flex items-center gap-2">
            <dt className="w-28 shrink-0 text-hibr-2">اسم المستخدم</dt>
            <dd dir="ltr" className="font-time flex-1 text-start tabular-nums text-hibr">{credentials.username}</dd>
            <Button size="sm" variant="ghost" onClick={() => copyToClipboard(credentials.username, toast)}>
              <IconCopy className="h-4 w-4" />
              نسخ
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <dt className="w-28 shrink-0 text-hibr-2">كلمة المرور</dt>
            <dd dir="ltr" className="font-time flex-1 text-start tabular-nums text-hibr">{credentials.password}</dd>
            <Button size="sm" variant="ghost" onClick={() => copyToClipboard(credentials.password, toast)}>
              <IconCopy className="h-4 w-4" />
              نسخ
            </Button>
          </div>
        </dl>
      </Card>
    </div>
  )
}

export function StudentAccountActions({ student, variant = 'full' }: { student: Student; variant?: 'full' | 'compact' }) {
  const queryClient = useQueryClient()
  const toast = useToast()

  const [createOpen, setCreateOpen] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [resetPassword, setResetPassword] = useState('')
  const [usernameError, setUsernameError] = useState<string | undefined>()
  const [revealed, setRevealed] = useState<RevealedCredentials | null>(null)

  function openCreateModal() {
    setUsername(suggestUsername(student.full_name))
    setPassword(generatePassword())
    setUsernameError(undefined)
    setCreateOpen(true)
  }

  function openResetModal() {
    setResetPassword(generatePassword())
    setResetOpen(true)
  }

  const createMutation = useMutation({
    mutationFn: () => createStudentAccount(student.id, { username: username.trim(), password }),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['students'] })
      setCreateOpen(false)
      setRevealed({ username: updated.account_username ?? username.trim(), password, mode: 'create' })
      toast.show('تم إنشاء حساب الدخول')
    },
    onError: (error: unknown) => {
      const detail = error instanceof ApiError ? error.detail : 'تعذّر إنشاء الحساب، يرجى المحاولة لاحقاً'
      if (error instanceof ApiError && error.status === 409) {
        setUsernameError(detail)
      } else {
        toast.show(detail, 'error')
      }
    },
  })

  const resetMutation = useMutation({
    mutationFn: () => updateUser(student.user_id as string, { password: resetPassword }),
    onSuccess: () => {
      setResetOpen(false)
      setRevealed({ username: student.account_username ?? '', password: resetPassword, mode: 'reset' })
      toast.show('تم تعيين كلمة مرور جديدة')
    },
    onError: (error: unknown) => {
      toast.show(error instanceof ApiError ? error.detail : 'تعذّر تعيين كلمة المرور، يرجى المحاولة لاحقاً', 'error')
    },
  })

  function handleCreateSubmit() {
    setUsernameError(undefined)
    if (username.trim().length < 3) {
      setUsernameError('اسم المستخدم يجب ألا يقل عن 3 خانات')
      return
    }
    if (password.length < 8) {
      toast.show('كلمة المرور يجب ألا تقل عن 8 خانات', 'error')
      return
    }
    createMutation.mutate()
  }

  function handleResetSubmit() {
    if (resetPassword.length < 8) {
      toast.show('كلمة المرور يجب ألا تقل عن 8 خانات', 'error')
      return
    }
    resetMutation.mutate()
  }

  const buttonSize = variant === 'compact' ? 'sm' : 'md'

  return (
    <>
      {!student.account_username ? (
        variant === 'compact' ? (
          <Button size="sm" variant="secondary" onClick={openCreateModal}>
            إنشاء حساب دخول
          </Button>
        ) : (
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-hibr">حساب الدخول</p>
                <p className="text-sm text-hibr-2">لا يوجد حساب دخول لهذا الطالب بعد.</p>
              </div>
              <Button onClick={openCreateModal}>إنشاء حساب دخول</Button>
            </div>
          </Card>
        )
      ) : variant === 'compact' ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-time text-sm tabular-nums text-hibr">{student.account_username}</span>
          <Badge variant={student.account_is_active ? 'sahih' : 'neutral'}>
            {student.account_is_active ? 'نشط' : 'معطّل'}
          </Badge>
          <Button size="sm" variant="ghost" onClick={openResetModal}>
            <IconRefresh className="h-3.5 w-3.5" />
            إعادة تعيين كلمة المرور
          </Button>
        </div>
      ) : (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-hibr">حساب الدخول</p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span className="font-time text-base tabular-nums text-hibr">{student.account_username}</span>
                <Badge variant={student.account_is_active ? 'sahih' : 'neutral'}>
                  {student.account_is_active ? 'نشط' : 'معطّل'}
                </Badge>
              </div>
            </div>
            <Button variant="secondary" size={buttonSize} onClick={openResetModal}>
              <IconRefresh className="h-4 w-4" />
              إعادة تعيين كلمة المرور
            </Button>
          </div>
        </Card>
      )}

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="إنشاء حساب دخول"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>
              إلغاء
            </Button>
            <Button onClick={handleCreateSubmit} loading={createMutation.isPending}>
              إنشاء الحساب
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <TextField
            label="اسم المستخدم"
            required
            dir="ltr"
            error={usernameError}
            help="بحروف لاتينية — مقترح تلقائياً، يمكن تعديله"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
          <div>
            <PasswordField
              label="كلمة المرور"
              required
              dir="ltr"
              help="ثماني خانات على الأقل — مولَّدة تلقائياً، يمكن تعديلها"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <button
              type="button"
              onClick={() => setPassword(generatePassword())}
              className="mt-1.5 text-sm text-lazward-700 hover:underline"
            >
              توليد كلمة مرور جديدة
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        title="إعادة تعيين كلمة المرور"
        footer={
          <>
            <Button variant="secondary" onClick={() => setResetOpen(false)}>
              إلغاء
            </Button>
            <Button onClick={handleResetSubmit} loading={resetMutation.isPending}>
              حفظ
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-hibr-2">
            سيتم استبدال كلمة مرور حساب «{student.account_username}» الحالية بكلمة مرور جديدة.
          </p>
          <div>
            <PasswordField
              label="كلمة المرور الجديدة"
              required
              dir="ltr"
              help="ثماني خانات على الأقل — مولَّدة تلقائياً، يمكن تعديلها"
              value={resetPassword}
              onChange={(event) => setResetPassword(event.target.value)}
            />
            <button
              type="button"
              onClick={() => setResetPassword(generatePassword())}
              className="mt-1.5 text-sm text-lazward-700 hover:underline"
            >
              توليد كلمة مرور جديدة
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        open={Boolean(revealed)}
        onClose={() => setRevealed(null)}
        title={revealed?.mode === 'create' ? 'تم إنشاء حساب الدخول' : 'تم تعيين كلمة المرور'}
        footer={
          <Button onClick={() => setRevealed(null)}>تم الحفظ</Button>
        }
      >
        {revealed && <CredentialsCard credentials={revealed} />}
      </Modal>
    </>
  )
}
