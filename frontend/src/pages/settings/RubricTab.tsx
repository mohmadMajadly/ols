// تبويب «سلّم التقييم» (admin فقط): قسم الأوزان الثلاثة بمؤشر مجموع حي، وقسم الخصومات
// (4 فئات × 3 طرق تصحيح). حفظ واحد للتبويب كله عبر PUT /api/rubric.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'

import type { DeductionCategory, DeductionMode, Rubric } from '../../api/rubric'
import { fetchRubric, updateRubric } from '../../api/rubric'
import { ApiError } from '../../api/client'
import { Button } from '../../ui/Button'
import { Card } from '../../ui/Card'
import { Spinner } from '../../ui/Spinner'
import { useToast } from '../../ui/Toast'
import { cx } from '../../ui/utils'

const WEIGHT_FIELDS: { key: keyof Rubric['weights']; label: string }[] = [
  { key: 'hifz', label: 'الحفظ' },
  { key: 'tajwid', label: 'التجويد' },
  { key: 'adaa', label: 'الأداء' },
]

const DEDUCTION_ROWS: { key: DeductionCategory; label: string; dotClass: string }[] = [
  { key: 'hifz', label: 'الحفظ', dotClass: 'bg-khata-hifz' },
  { key: 'tajwid', label: 'التجويد', dotClass: 'bg-khata-tajwid' },
  { key: 'dabt', label: 'الضبط', dotClass: 'bg-khata-dabt' },
  { key: 'waqf', label: 'الوقف', dotClass: 'bg-waqf' },
]

const DEDUCTION_COLS: { key: DeductionMode; label: string }[] = [
  { key: 'tadaruk', label: 'تدارك ذاتي' },
  { key: 'tanbih', label: 'تنبيه' },
  { key: 'talqin', label: 'تلقين (فُتح عليه)' },
]

function numberInputClasses(invalid?: boolean) {
  return cx(
    'h-9 w-full rounded-control border bg-waraq-raised px-2.5 font-time text-base tabular-nums text-hibr outline-none',
    invalid ? 'border-khata-hifz focus:border-khata-hifz' : 'border-khatt focus:border-lazward-700',
  )
}

export function RubricTab() {
  const queryClient = useQueryClient()
  const toast = useToast()

  const rubricQuery = useQuery({ queryKey: ['rubric'], queryFn: fetchRubric })

  const [weights, setWeights] = useState<Rubric['weights'] | null>(null)
  const [deductions, setDeductions] = useState<Rubric['deductions'] | null>(null)
  const initializedRef = useRef(false)

  useEffect(() => {
    if (rubricQuery.data && !initializedRef.current) {
      setWeights(rubricQuery.data.weights)
      setDeductions(rubricQuery.data.deductions)
      initializedRef.current = true
    }
  }, [rubricQuery.data])

  const saveMutation = useMutation({
    mutationFn: (payload: Rubric) => updateRubric(payload),
    onSuccess: (rubric) => {
      setWeights(rubric.weights)
      setDeductions(rubric.deductions)
      queryClient.invalidateQueries({ queryKey: ['rubric'] })
      toast.show('تم حفظ سلّم التقييم')
    },
    onError: (error: unknown) => {
      const detail = error instanceof ApiError ? error.detail : 'تعذر الاتصال بالخادم، يرجى المحاولة لاحقاً'
      toast.show(detail, 'error')
    },
  })

  if (rubricQuery.isLoading || !weights || !deductions) {
    return (
      <div className="flex justify-center py-16">
        <Spinner size={28} tone="lazward" />
      </div>
    )
  }

  const sum = weights.hifz + weights.tajwid + weights.adaa
  const sumValid = Math.abs(sum - 100) < 1e-9
  const hasNegative =
    Object.values(weights).some((v) => v < 0) ||
    Object.values(deductions).some((row) => Object.values(row).some((v) => v < 0))
  const canSave = sumValid && !hasNegative

  function updateWeight(key: keyof Rubric['weights'], raw: string) {
    const value = raw === '' ? 0 : Number(raw)
    setWeights((current) => (current ? { ...current, [key]: value } : current))
  }

  function updateDeduction(category: DeductionCategory, mode: DeductionMode, raw: string) {
    const value = raw === '' ? 0 : Number(raw)
    setDeductions((current) =>
      current ? { ...current, [category]: { ...current[category], [mode]: value } } : current,
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <h2 className="mb-1 font-ui text-lg font-semibold text-hibr">الأوزان</h2>
        <p className="mb-4 text-sm text-hibr-2">وزن كل معيار من الدرجة الكلية — يجب أن يساوي المجموع 100.</p>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {WEIGHT_FIELDS.map((field) => (
            <div key={field.key}>
              <label className="mb-1.5 block text-sm font-medium text-hibr" htmlFor={`weight-${field.key}`}>
                {field.label}
              </label>
              <input
                id={`weight-${field.key}`}
                type="number"
                inputMode="decimal"
                value={weights[field.key]}
                onChange={(event) => updateWeight(field.key, event.target.value)}
                className={numberInputClasses(!sumValid)}
              />
            </div>
          ))}
        </div>

        <p className={cx('mt-3 text-sm font-medium', sumValid ? 'text-sahih' : 'text-khata-hifz')}>
          المجموع: {sum.toLocaleString('ar')} {sumValid ? '' : '— يجب أن يساوي 100'}
        </p>
      </Card>

      <Card className="overflow-x-auto">
        <h2 className="mb-1 font-ui text-lg font-semibold text-hibr">الخصومات</h2>
        <p className="mb-4 text-sm text-hibr-2">قيمة الخصم من الدرجة لكل طريقة تصحيح، حسب فئة الملاحظة.</p>

        <table className="w-full min-w-[480px] border-collapse text-base">
          <thead>
            <tr className="border-b border-khatt">
              <th className="px-3 py-2 text-start text-sm font-semibold text-hibr-2">الفئة</th>
              {DEDUCTION_COLS.map((col) => (
                <th key={col.key} className="px-3 py-2 text-start text-sm font-semibold text-hibr-2">
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DEDUCTION_ROWS.map((row) => (
              <tr key={row.key} className="border-b border-khatt last:border-b-0">
                <td className="px-3 py-2.5">
                  <span className="inline-flex items-center gap-2 text-hibr">
                    <span className={cx('h-2.5 w-2.5 rounded-full', row.dotClass)} aria-hidden="true" />
                    {row.label}
                  </span>
                </td>
                {DEDUCTION_COLS.map((col) => (
                  <td key={col.key} className="px-3 py-2.5">
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.25"
                      value={deductions[row.key][col.key]}
                      onChange={(event) => updateDeduction(row.key, col.key, event.target.value)}
                      className={numberInputClasses()}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        <p className="mt-3 text-sm text-hibr-2">
          تدارك ذاتي: صحّح الطالب نفسه بلا تدخل. تنبيه: أشار المعلم للخطأ فصحّحه الطالب. تلقين: فُتح على الطالب —
          لم يستطع التصحيح فقال المعلم الصواب.
        </p>
      </Card>

      <div className="flex items-center gap-3">
        <Button onClick={() => saveMutation.mutate({ weights, deductions })} loading={saveMutation.isPending} disabled={!canSave}>
          احفظ سلّم التقييم
        </Button>
        <p className="text-sm text-hibr-2">تغيير القيم يؤثر على الجلسات القادمة فقط.</p>
      </div>
    </div>
  )
}
