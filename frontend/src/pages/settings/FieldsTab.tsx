// تبويب «الحقول المخصصة»: جدول الحقول التي تظهر في نموذج الملاحظة أثناء الجلسة.
// نفس اعتبار GET /api/taxonomy (نشط فقط) المذكور في TaxonomyTab.tsx — نحتفظ محلياً
// بآخر نسخة معروفة من كل حقل عبر دمج استجابات النداءات كي لا يختفي حقل عُطِّل للتو.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'

import type { NoteField, NoteFieldType } from '../../api/taxonomy'
import { createField, fetchTaxonomyWithInactive, updateField } from '../../api/taxonomy'
import { ApiError } from '../../api/client'
import { Button } from '../../ui/Button'
import { Spinner } from '../../ui/Spinner'
import {
  Table,
  TableBody,
  TableCell,
  TableEmptyRow,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '../../ui/Table'
import { Switch } from '../../ui/Switch'
import { useToast } from '../../ui/Toast'
import { IconArrowDown, IconArrowUp, IconChevronDown, IconPlus } from '../../ui/icons'
import { InlineEditText } from './InlineEditText'
import { OptionChips } from './OptionChips'

const FIELD_TYPE_LABELS: Record<NoteFieldType, string> = {
  text: 'نص',
  number: 'رقم',
  select: 'قائمة اختيار',
}

const FIELD_TYPE_OPTIONS = (Object.keys(FIELD_TYPE_LABELS) as NoteFieldType[]).map((value) => ({
  value,
  label: FIELD_TYPE_LABELS[value],
}))

export function FieldsTab() {
  const queryClient = useQueryClient()
  const toast = useToast()

  const taxonomyQuery = useQuery({
    queryKey: ['taxonomy', 'all'],
    queryFn: fetchTaxonomyWithInactive,
  })

  const [fieldsMap, setFieldsMap] = useState<Record<string, NoteField>>({})

  useEffect(() => {
    if (!taxonomyQuery.data) return
    setFieldsMap((prev) => {
      const next = { ...prev }
      for (const field of taxonomyQuery.data.fields) next[field.id] = field
      return next
    })
  }, [taxonomyQuery.data])

  function mergeField(field: NoteField) {
    setFieldsMap((prev) => ({ ...prev, [field.id]: field }))
  }

  const fields = Object.values(fieldsMap).sort((a, b) => a.sort_order - b.sort_order)

  function reportError(error: unknown) {
    const detail = error instanceof ApiError ? error.detail : 'تعذر الاتصال بالخادم، يرجى المحاولة لاحقاً'
    toast.show(detail, 'error')
  }

  const [busyFieldId, setBusyFieldId] = useState<string | null>(null)

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      setBusyFieldId(id)
      return updateField(id, { is_active })
    },
    onSuccess: (field) => {
      mergeField(field)
      queryClient.invalidateQueries({ queryKey: ['taxonomy'] })
    },
    onError: reportError,
    onSettled: () => setBusyFieldId(null),
  })

  const reorderMutation = useMutation({
    mutationFn: async ({ a, b }: { a: NoteField; b: NoteField }) => {
      setBusyFieldId(a.id)
      const [updatedA, updatedB] = await Promise.all([
        updateField(a.id, { sort_order: b.sort_order }),
        updateField(b.id, { sort_order: a.sort_order }),
      ])
      return [updatedA, updatedB]
    },
    onSuccess: ([updatedA, updatedB]) => {
      mergeField(updatedA)
      mergeField(updatedB)
      queryClient.invalidateQueries({ queryKey: ['taxonomy'] })
    },
    onError: reportError,
    onSettled: () => setBusyFieldId(null),
  })

  const renameMutation = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      setBusyFieldId(id)
      return updateField(id, { name })
    },
    onSuccess: (field) => {
      mergeField(field)
      queryClient.invalidateQueries({ queryKey: ['taxonomy'] })
    },
    onError: reportError,
    onSettled: () => setBusyFieldId(null),
  })

  const optionsMutation = useMutation({
    mutationFn: async ({ id, options }: { id: string; options: string[] }) => {
      setBusyFieldId(id)
      return updateField(id, { options })
    },
    onSuccess: (field) => {
      mergeField(field)
      queryClient.invalidateQueries({ queryKey: ['taxonomy'] })
    },
    onError: reportError,
    onSettled: () => setBusyFieldId(null),
  })

  // ---- إضافة حقل ----
  const [addOpen, setAddOpen] = useState(false)
  const [name, setName] = useState('')
  const [fieldType, setFieldType] = useState<NoteFieldType>('text')
  const [options, setOptions] = useState<string[]>([])
  const nameInputRef = useRef<HTMLInputElement>(null)

  function openAddRow() {
    setAddOpen(true)
    window.setTimeout(() => nameInputRef.current?.focus(), 0)
  }

  function closeAddRow() {
    setAddOpen(false)
    setName('')
    setFieldType('text')
    setOptions([])
  }

  const createFieldMutation = useMutation({
    mutationFn: () =>
      createField({
        name: name.trim(),
        field_type: fieldType,
        options: fieldType === 'select' ? options : null,
        sort_order: fields.length,
      }),
    onSuccess: (field) => {
      mergeField(field)
      queryClient.invalidateQueries({ queryKey: ['taxonomy'] })
      // الاسم والخيارات تُفرغ فوراً والصف يبقى مفتوحاً للإدخال التالي — روح الإكسل
      setName('')
      setOptions([])
      window.setTimeout(() => nameInputRef.current?.focus(), 0)
    },
    onError: reportError,
  })

  function submitAddRow() {
    if (!name.trim()) return
    createFieldMutation.mutate()
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-hibr-2">تظهر هذه الحقول في نموذج الملاحظة أثناء الجلسة.</p>
        {!addOpen && (
          <Button onClick={openAddRow}>
            <IconPlus className="h-4 w-4" />
            أضف حقلاً
          </Button>
        )}
      </div>

      {taxonomyQuery.isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner size={28} tone="lazward" />
        </div>
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>الاسم</TableHeaderCell>
              <TableHeaderCell>النوع</TableHeaderCell>
              <TableHeaderCell>الخيارات</TableHeaderCell>
              <TableHeaderCell>الحالة</TableHeaderCell>
              <TableHeaderCell>الترتيب</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {addOpen && (
              <TableRow>
                <TableCell>
                  <input
                    ref={nameInputRef}
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        submitAddRow()
                      } else if (event.key === 'Escape') {
                        event.preventDefault()
                        closeAddRow()
                      }
                    }}
                    placeholder="اسم الحقل..."
                    className="h-9 w-full min-w-[140px] rounded-control border border-lazward-700 bg-waraq-raised px-2.5 text-base text-hibr placeholder:text-hibr-3 outline-none"
                  />
                </TableCell>
                <TableCell>
                  <div className="relative w-fit">
                    <select
                      value={fieldType}
                      onChange={(event) => setFieldType(event.target.value as NoteFieldType)}
                      aria-label="نوع الحقل"
                      className="h-9 appearance-none rounded-control border border-khatt bg-waraq-raised ps-2.5 pe-8 text-base text-hibr outline-none focus:border-lazward-700"
                    >
                      {FIELD_TYPE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <IconChevronDown className="pointer-events-none absolute inset-y-0 end-2 my-auto h-4 w-4 text-hibr-3" />
                  </div>
                </TableCell>
                <TableCell>
                  {fieldType === 'select' ? (
                    <OptionChips options={options} onChange={setOptions} />
                  ) : (
                    <span className="text-sm text-hibr-3">—</span>
                  )}
                </TableCell>
                <TableCell colSpan={2}>
                  <div className="flex items-center gap-2">
                    <Button size="sm" onClick={submitAddRow} loading={createFieldMutation.isPending}>
                      إضافة
                    </Button>
                    <Button size="sm" variant="ghost" onClick={closeAddRow}>
                      إغلاق
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            )}

            {fields.length === 0 && !addOpen ? (
              <TableEmptyRow
                colSpan={5}
                message="لا حقول مخصصة بعد — أضف أول حقل"
                action={<Button size="sm" onClick={openAddRow}>أضف حقلاً</Button>}
              />
            ) : (
              fields.map((field, index) => (
                <TableRow key={field.id}>
                  <TableCell>
                    <InlineEditText
                      value={field.name}
                      saving={busyFieldId === field.id}
                      onSave={(next) => renameMutation.mutate({ id: field.id, name: next })}
                    />
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm text-hibr-2">
                    {FIELD_TYPE_LABELS[field.field_type]}
                  </TableCell>
                  <TableCell>
                    {field.field_type === 'select' ? (
                      <OptionChips
                        options={field.options ?? []}
                        saving={busyFieldId === field.id}
                        onChange={(next) => optionsMutation.mutate({ id: field.id, options: next })}
                      />
                    ) : (
                      <span className="text-sm text-hibr-3">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={field.is_active}
                      disabled={busyFieldId === field.id}
                      onChange={(is_active) => toggleActiveMutation.mutate({ id: field.id, is_active })}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-0.5">
                      <button
                        type="button"
                        disabled={index === 0 || busyFieldId === field.id}
                        onClick={() => {
                          const prev = fields[index - 1]
                          if (prev) reorderMutation.mutate({ a: field, b: prev })
                        }}
                        aria-label="نقل الحقل لأعلى"
                        className="rounded-control p-1.5 text-hibr-3 hover:bg-lazward-100/40 hover:text-hibr disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
                      >
                        <IconArrowUp className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        disabled={index === fields.length - 1 || busyFieldId === field.id}
                        onClick={() => {
                          const next = fields[index + 1]
                          if (next) reorderMutation.mutate({ a: field, b: next })
                        }}
                        aria-label="نقل الحقل لأسفل"
                        className="rounded-control p-1.5 text-hibr-3 hover:bg-lazward-100/40 hover:text-hibr disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
                      >
                        <IconArrowDown className="h-4 w-4" />
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
