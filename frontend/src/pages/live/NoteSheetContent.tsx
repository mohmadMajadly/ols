// محتوى اللوحة السفلية لتدوين ملاحظة موقوتة: الطابع المُلتقط (للعرض فقط)، رقاقات الأنواع
// الفرعية، طريقة التصحيح، الشدة، موضع سريع (سورة/آية)، نص حر، والحقول المخصصة. الحالة
// مرفوعة إلى الصفحة الأم (LiveSessionPage) كي يصل زر «احفظ الملاحظة» في تذييل BottomSheet
// إليها مباشرة.

import type { NoteField } from '../../api/taxonomy'
import type { NoteCategory } from '../../api/taxonomy'
import type { Surah } from '../../api/quran'
import { formatDuration } from '../../lib/formatDuration'
import { correctionModeLabels, severityLabels } from '../../lib/sessionLabels'
import { Select } from '../../ui/Select'
import { TextArea } from '../../ui/TextArea'
import { TextField } from '../../ui/TextField'
import { cx } from '../../ui/utils'

export interface NoteFormState {
  categoryId: string
  capturedMs: number
  subtypeId: string | null
  correctionMode: 'tadaruk' | 'tanbih' | 'talqin'
  severity: 'khafif' | 'mutawassit' | 'jasim' | null
  surah: number | null
  ayah: number | null
  text: string
  extra: Record<string, unknown>
}

const CORRECTION_MODES: NoteFormState['correctionMode'][] = ['tadaruk', 'tanbih', 'talqin']
const SEVERITIES: NonNullable<NoteFormState['severity']>[] = ['khafif', 'mutawassit', 'jasim']

function pillClasses(active: boolean): string {
  return cx(
    'h-9 min-w-[44px] rounded-control border px-3 text-sm font-medium transition-colors duration-150',
    active ? 'border-lazward-700 bg-lazward-100 text-lazward-700' : 'border-khatt bg-waraq-raised text-hibr-2 hover:bg-lazward-100/40',
  )
}

export function NoteSheetContent({
  category,
  value,
  onChange,
  surahs,
  fields,
}: {
  category: NoteCategory
  value: NoteFormState
  onChange: (next: NoteFormState) => void
  surahs: Surah[]
  fields: NoteField[]
}) {
  const selectedSurah = surahs.find((s) => s.number === value.surah)
  const surahOptions = surahs.map((s) => ({ value: String(s.number), label: `${s.number}. ${s.name}` }))

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between rounded-control border border-khatt bg-waraq px-3 py-2.5">
        <span className="text-sm text-hibr-2">لحظة الضغط</span>
        <span className="font-time text-lg tabular-nums text-hibr">{formatDuration(value.capturedMs)}</span>
      </div>

      {category.subtypes.length > 0 && (
        <div>
          <p className="mb-1.5 text-sm font-medium text-hibr">النوع الفرعي (اختياري)</p>
          <div className="flex flex-wrap gap-2">
            {category.subtypes.map((subtype) => {
              const active = value.subtypeId === subtype.id
              return (
                <button
                  key={subtype.id}
                  type="button"
                  onClick={() => onChange({ ...value, subtypeId: active ? null : subtype.id })}
                  className={pillClasses(active)}
                >
                  {subtype.name}
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div>
        <p className="mb-1.5 text-sm font-medium text-hibr">طريقة التصحيح</p>
        <div className="flex flex-wrap gap-2">
          {CORRECTION_MODES.map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => onChange({ ...value, correctionMode: mode })}
              className={pillClasses(value.correctionMode === mode)}
            >
              {correctionModeLabels[mode]}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-sm font-medium text-hibr">الشدة (اختياري)</p>
        <div className="flex flex-wrap gap-2">
          {SEVERITIES.map((severity) => {
            const active = value.severity === severity
            return (
              <button
                key={severity}
                type="button"
                onClick={() => onChange({ ...value, severity: active ? null : severity })}
                className={pillClasses(active)}
              >
                {severityLabels[severity]}
              </button>
            )
          })}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Select
          label="السورة (اختياري)"
          placeholder="بدون تحديد"
          options={surahOptions}
          value={value.surah ? String(value.surah) : ''}
          onChange={(event) => {
            const num = event.target.value ? Number(event.target.value) : null
            onChange({ ...value, surah: num, ayah: num ? 1 : null })
          }}
        />
        <TextField
          label="الآية"
          type="number"
          min={1}
          max={selectedSurah?.ayah_count}
          disabled={!value.surah}
          value={value.ayah ?? ''}
          onChange={(event) => onChange({ ...value, ayah: event.target.value ? Number(event.target.value) : null })}
        />
      </div>

      <TextArea
        label="ملاحظة نصية (اختياري)"
        value={value.text}
        onChange={(event) => onChange({ ...value, text: event.target.value })}
        rows={3}
      />

      {fields.length > 0 && (
        <div className="flex flex-col gap-4 border-t border-khatt pt-4">
          {fields.map((field) => {
            const raw = value.extra[field.id]
            if (field.field_type === 'select') {
              return (
                <Select
                  key={field.id}
                  label={field.name}
                  placeholder="بدون تحديد"
                  options={(field.options ?? []).map((o) => ({ value: o, label: o }))}
                  value={typeof raw === 'string' ? raw : ''}
                  onChange={(event) =>
                    onChange({ ...value, extra: { ...value.extra, [field.id]: event.target.value } })
                  }
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
                  onChange={(event) =>
                    onChange({
                      ...value,
                      extra: { ...value.extra, [field.id]: event.target.value ? Number(event.target.value) : undefined },
                    })
                  }
                />
              )
            }
            return (
              <TextField
                key={field.id}
                label={field.name}
                value={typeof raw === 'string' ? raw : ''}
                onChange={(event) => onChange({ ...value, extra: { ...value.extra, [field.id]: event.target.value } })}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}
