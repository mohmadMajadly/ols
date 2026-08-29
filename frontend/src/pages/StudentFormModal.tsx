// نافذة إضافة/تعديل بيانات طالب — مستخرجة من StudentsPage لإعادة استخدامها في ملف
// الطالب (زر «تعديل البيانات») دون تكرار منطق النموذج والتحقق.

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { ApiError } from '../api/client'
import { createStudent, updateStudent } from '../api/students'
import type { Student } from '../api/students'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'
import { Select } from '../ui/Select'
import type { SelectOption } from '../ui/Select'
import { Switch } from '../ui/Switch'
import { TextArea } from '../ui/TextArea'
import { TextField } from '../ui/TextField'
import { useToast } from '../ui/Toast'

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

export function StudentFormModal({
  open,
  student,
  groupOptions,
  isTeacher,
  defaultGroupId = '',
  onClose,
  onSuccess,
}: {
  open: boolean
  /** null = وضع الإضافة، وإلا تعديل هذا الطالب */
  student: Student | null
  groupOptions: SelectOption[]
  isTeacher: boolean
  defaultGroupId?: string
  onClose: () => void
  onSuccess?: (student: Student) => void
}) {
  const queryClient = useQueryClient()
  const toast = useToast()

  const [form, setForm] = useState<StudentFormState>(() => (student ? formFromStudent(student) : emptyForm(defaultGroupId)))
  const [groupError, setGroupError] = useState<string | undefined>()

  // مزامنة النموذج عند تبدّل هدف الفتح (طالب مختلف أو وضع إضافة) — أثناء الرندر بدل
  // useEffect، بنفس نمط مزامنة الفلاتر في StudentsPage/SearchSelect.
  const openKey = `${open}|${student?.id ?? 'new'}`
  const [syncedKey, setSyncedKey] = useState(openKey)
  if (open && openKey !== syncedKey) {
    setSyncedKey(openKey)
    setForm(student ? formFromStudent(student) : emptyForm(defaultGroupId))
    setGroupError(undefined)
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
      if (student) {
        return updateStudent(student.id, { ...payload, is_active: form.is_active })
      }
      return createStudent(payload)
    },
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ['students'] })
      queryClient.invalidateQueries({ queryKey: ['groups'] })
      toast.show(student ? 'تم حفظ تعديلات الطالب' : 'تمت إضافة الطالب')
      onSuccess?.(saved)
      onClose()
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

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={student ? 'تعديل بيانات الطالب' : 'إضافة طالب'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
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
        {student && (
          <Switch
            id="student-is-active"
            checked={form.is_active}
            onChange={(checked) => setForm((current) => ({ ...current, is_active: checked }))}
            label="الطالب نشط"
          />
        )}
      </div>
    </Modal>
  )
}
