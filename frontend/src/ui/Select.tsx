// قائمة اختيار (select) أصلية معاد تنسيقها بستايل موحّد مع سهم SVG. السهم يقع في نهاية
// الحقل منطقياً (end-*) فيتبع اتجاه RTL تلقائياً دون أي قيمة يسار/يمين ثابتة.

import type { SelectHTMLAttributes } from 'react'
import { useId } from 'react'

import { fieldBaseClasses, fieldErrorBorderClasses, fieldErrorClasses, fieldHelpClasses, fieldLabelClasses } from './fieldStyles'
import { IconChevronDown } from './icons'
import { cx } from './utils'

export interface SelectOption {
  value: string
  label: string
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children'> {
  label: string
  options: SelectOption[]
  placeholder?: string
  help?: string
  error?: string
}

export function Select({ label, options, placeholder, help, error, id, className, value, defaultValue, ...rest }: SelectProps) {
  const generatedId = useId()
  const fieldId = id ?? generatedId
  const describedBy = error ? `${fieldId}-error` : help ? `${fieldId}-help` : undefined
  // دعم الاستخدام غير المتحكَّم به (defaultValue/بلا شيء) والمتحكَّم به (value) معاً
  // بلا تحذير React — لا نمرر defaultValue إطلاقاً حين تُستخدم value.
  const uncontrolledDefaultValue = value === undefined ? (defaultValue ?? (placeholder ? '' : undefined)) : undefined

  return (
    <div>
      <label htmlFor={fieldId} className={fieldLabelClasses}>
        {label}
      </label>
      <div className="relative">
        <select
          id={fieldId}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={describedBy}
          value={value}
          defaultValue={uncontrolledDefaultValue}
          className={cx(
            fieldBaseClasses,
            'h-10 appearance-none ps-3 pe-9 text-base',
            error && fieldErrorBorderClasses,
            className,
          )}
          {...rest}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <IconChevronDown className="pointer-events-none absolute inset-y-0 end-3 my-auto h-4 w-4 text-hibr-3" />
      </div>
      {error ? (
        <p id={`${fieldId}-error`} role="alert" className={fieldErrorClasses}>
          {error}
        </p>
      ) : help ? (
        <p id={`${fieldId}-help`} className={fieldHelpClasses}>
          {help}
        </p>
      ) : null}
    </div>
  )
}
