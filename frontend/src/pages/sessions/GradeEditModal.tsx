// نافذة تعديل الدرجة النهائية وملخص الجلسة معاً — PATCH /api/sessions/{id}.

import { useEffect, useState } from 'react'

import type { SessionUpdateInput } from '../../api/sessions'
import { Button } from '../../ui/Button'
import { Modal } from '../../ui/Modal'
import { TextArea } from '../../ui/TextArea'
import { TextField } from '../../ui/TextField'

export function GradeEditModal({
  open,
  initialGrade,
  initialSummary,
  onClose,
  onSubmit,
  submitting,
}: {
  open: boolean
  initialGrade: number | null
  initialSummary: string | null
  onClose: () => void
  onSubmit: (payload: SessionUpdateInput) => void
  submitting: boolean
}) {
  const [grade, setGrade] = useState('')
  const [summary, setSummary] = useState('')

  useEffect(() => {
    if (open) {
      setGrade(initialGrade != null ? String(initialGrade) : '')
      setSummary(initialSummary ?? '')
    }
  }, [open, initialGrade, initialSummary])

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="تعديل الدرجة والملخص"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            إلغاء
          </Button>
          <Button
            loading={submitting}
            onClick={() => onSubmit({ grade: grade === '' ? null : Number(grade), summary: summary.trim() || null })}
          >
            حفظ
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <TextField
          label="الدرجة النهائية"
          type="number"
          min={0}
          max={100}
          step="0.5"
          value={grade}
          onChange={(e) => setGrade(e.target.value)}
        />
        <TextArea label="ملخص الجلسة" rows={4} value={summary} onChange={(e) => setSummary(e.target.value)} />
      </div>
    </Modal>
  )
}
