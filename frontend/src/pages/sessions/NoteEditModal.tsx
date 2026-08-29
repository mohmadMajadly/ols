// نافذة تعديل ملاحظة موجودة — نسخة مبسطة من منطق نموذج الملاحظة (WP4b/NoteSheetContent
// مبني للوحة السفلية أثناء الجلسة الحية؛ هنا في عالم الورق نستخدم عناصر Select/TextField
// القياسية بدل الأزرار النصية الكبيرة). PATCH /api/notes/{id}.

import { useEffect, useState } from 'react'

import type { NoteCategory, NoteField, Taxonomy } from '../../api/taxonomy'
import type { Surah } from '../../api/quran'
import type { NoteOut, NoteUpdateInput } from '../../api/notes'
import { correctionModeLabels, severityLabels } from '../../lib/sessionLabels'
import { Button } from '../../ui/Button'
import { Modal } from '../../ui/Modal'
import { Select } from '../../ui/Select'
import { TextArea } from '../../ui/TextArea'
import { TextField } from '../../ui/TextField'

export interface NoteEditFormState {
  categoryId: string
  subtypeId: string
  correctionMode: string
  severity: string
  surah: string
  ayah: string
  text: string
  extra: Record<string, unknown>
}

function formFromNote(note: NoteOut): NoteEditFormState {
  return {
    categoryId: note.category_id,
    subtypeId: note.subtype_id ?? '',
    correctionMode: note.correction_mode ?? '',
    severity: note.severity ?? '',
    surah: note.surah != null ? String(note.surah) : '',
    ayah: note.ayah != null ? String(note.ayah) : '',
    text: note.text ?? '',
    extra: note.extra ?? {},
  }
}

export function NoteEditModal({
  note,
  taxonomy,
  surahs,
  onClose,
  onSubmit,
  submitting,
}: {
  note: NoteOut | null
  taxonomy: Taxonomy
  surahs: Surah[]
  onClose: () => void
  onSubmit: (payload: NoteUpdateInput) => void
  submitting: boolean
}) {
  const [form, setForm] = useState<NoteEditFormState>(() => (note ? formFromNote(note) : formFromNote({} as NoteOut)))

  useEffect(() => {
    if (note) setForm(formFromNote(note))
  }, [note])

  if (!note) return null

  const categories: NoteCategory[] = taxonomy.categories
  const category = categories.find((c) => c.id === form.categoryId)
  const subtypeOptions = (category?.subtypes ?? []).map((s) => ({ value: s.id, label: s.name }))
  const categoryOptions = categories.map((c) => ({ value: c.id, label: c.name }))
  const surahOptions = surahs.map((s) => ({ value: String(s.number), label: `${s.number}. ${s.name}` }))
  const selectedSurah = surahs.find((s) => String(s.number) === form.surah)
  const fields: NoteField[] = taxonomy.fields

  function handleSubmit() {
    onSubmit({
      category_id: form.categoryId,
      subtype_id: form.subtypeId || null,
      correction_mode: form.correctionMode || null,
      severity: form.severity || null,
      surah: form.surah ? Number(form.surah) : null,
      ayah: form.surah && form.ayah ? Number(form.ayah) : null,
      text: form.text.trim() || null,
      extra: form.extra,
    })
  }

  return (
    <Modal
      open={Boolean(note)}
      onClose={onClose}
      title="تعديل الملاحظة"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            إلغاء
          </Button>
          <Button onClick={handleSubmit} loading={submitting}>
            حفظ
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Select
          label="الفئة"
          options={categoryOptions}
          value={form.categoryId}
          onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value, subtypeId: '' }))}
        />

        {subtypeOptions.length > 0 && (
          <Select
            label="النوع الفرعي"
            placeholder="بدون تحديد"
            options={subtypeOptions}
            value={form.subtypeId}
            onChange={(e) => setForm((f) => ({ ...f, subtypeId: e.target.value }))}
          />
        )}

        <div className="grid grid-cols-2 gap-3">
          <Select
            label="طريقة التصحيح"
            placeholder="بدون تحديد"
            options={Object.entries(correctionModeLabels).map(([value, label]) => ({ value, label }))}
            value={form.correctionMode}
            onChange={(e) => setForm((f) => ({ ...f, correctionMode: e.target.value }))}
          />
          <Select
            label="الشدة"
            placeholder="بدون تحديد"
            options={Object.entries(severityLabels).map(([value, label]) => ({ value, label }))}
            value={form.severity}
            onChange={(e) => setForm((f) => ({ ...f, severity: e.target.value }))}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Select
            label="السورة (اختياري)"
            placeholder="بدون تحديد"
            options={surahOptions}
            value={form.surah}
            onChange={(e) => setForm((f) => ({ ...f, surah: e.target.value, ayah: '' }))}
          />
          <TextField
            label="الآية"
            type="number"
            min={1}
            max={selectedSurah?.ayah_count}
            disabled={!form.surah}
            value={form.ayah}
            onChange={(e) => setForm((f) => ({ ...f, ayah: e.target.value }))}
          />
        </div>

        <TextArea
          label="ملاحظة نصية"
          rows={3}
          value={form.text}
          onChange={(e) => setForm((f) => ({ ...f, text: e.target.value }))}
        />

        {fields.length > 0 && (
          <div className="flex flex-col gap-4 border-t border-khatt pt-4">
            {fields.map((field) => {
              const raw = form.extra[field.id]
              if (field.field_type === 'select') {
                return (
                  <Select
                    key={field.id}
                    label={field.name}
                    placeholder="بدون تحديد"
                    options={(field.options ?? []).map((o) => ({ value: o, label: o }))}
                    value={typeof raw === 'string' ? raw : ''}
                    onChange={(e) => setForm((f) => ({ ...f, extra: { ...f.extra, [field.id]: e.target.value } }))}
                  />
                )
              }
              if (field.field_type === 'number') {
                return (
                  <TextField
                    key={field.id}
                    label={field.name}
                    type="number"
                    value={typeof raw === 'number' ? raw : ''}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        extra: { ...f.extra, [field.id]: e.target.value ? Number(e.target.value) : undefined },
                      }))
                    }
                  />
                )
              }
              return (
                <TextField
                  key={field.id}
                  label={field.name}
                  value={typeof raw === 'string' ? raw : ''}
                  onChange={(e) => setForm((f) => ({ ...f, extra: { ...f.extra, [field.id]: e.target.value } }))}
                />
              )
            })}
          </div>
        )}
      </div>
    </Modal>
  )
}
