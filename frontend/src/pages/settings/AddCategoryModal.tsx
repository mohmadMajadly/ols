// نافذة إضافة فئة ملاحظات جديدة: الاسم + لون من الستة الدلالية فقط (دوائر مُختارة
// بأسمائها العربية) — لا color picker حر إطلاقاً (DIRECTION §2/§9).

import { useState } from 'react'

import type { NoteColorKey } from '../../lib/noteColors'
import { noteSolidDotClass } from '../../lib/noteColors'
import { NOTE_COLOR_OPTIONS } from '../../api/taxonomy'
import { Button } from '../../ui/Button'
import { Modal } from '../../ui/Modal'
import { TextField } from '../../ui/TextField'
import { cx } from '../../ui/utils'

export function AddCategoryModal({
  open,
  onClose,
  onSubmit,
  submitting,
}: {
  open: boolean
  onClose: () => void
  onSubmit: (name: string, color: NoteColorKey) => void
  submitting: boolean
}) {
  const [name, setName] = useState('')
  const [color, setColor] = useState<NoteColorKey>('neutral')
  const [error, setError] = useState<string | undefined>()

  function handleClose() {
    setName('')
    setColor('neutral')
    setError(undefined)
    onClose()
  }

  function handleSubmit() {
    if (!name.trim()) {
      setError('اسم الفئة مطلوب')
      return
    }
    onSubmit(name.trim(), color)
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="إضافة فئة ملاحظات"
      footer={
        <>
          <Button variant="secondary" onClick={handleClose}>
            إلغاء
          </Button>
          <Button onClick={handleSubmit} loading={submitting}>
            إضافة
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <TextField
          label="اسم الفئة"
          required
          error={error}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <div>
          <p className="mb-1.5 block text-sm font-medium text-hibr">اللون</p>
          <div className="flex flex-wrap gap-2">
            {NOTE_COLOR_OPTIONS.map((option) => {
              const active = option.value === color
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setColor(option.value)}
                  aria-pressed={active}
                  className={cx(
                    'flex items-center gap-2 rounded-control border px-2.5 py-1.5 text-sm transition-colors duration-150',
                    active ? 'border-lazward-700 bg-lazward-100 text-lazward-700' : 'border-khatt text-hibr-2 hover:bg-lazward-100/40',
                  )}
                >
                  <span className={cx('h-3.5 w-3.5 rounded-full', noteSolidDotClass(option.value))} aria-hidden="true" />
                  {option.label}
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </Modal>
  )
}
