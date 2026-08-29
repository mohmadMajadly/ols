// حقل نص من سطر واحد: تسمية فوق الحقل، نص مساعدة أو رسالة خطأ تحته، وحد يتحول
// إلى لون التركيز اللازوردي. رسالة الخطأ لها أولوية على نص المساعدة.

import type { InputHTMLAttributes } from 'react'
import { useId } from 'react'

import { fieldBaseClasses, fieldErrorBorderClasses, fieldErrorClasses, fieldHelpClasses, fieldLabelClasses } from './fieldStyles'
import { cx } from './utils'

export interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  help?: string
  error?: string
}

export function TextField({ label, help, error, id, className, ...rest }: TextFieldProps) {
  const generatedId = useId()
  const fieldId = id ?? generatedId
  const describedBy = error ? `${fieldId}-error` : help ? `${fieldId}-help` : undefined

  return (
    <div>
      <label htmlFor={fieldId} className={fieldLabelClasses}>
        {label}
      </label>
      <input
        id={fieldId}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={describedBy}
        className={cx(fieldBaseClasses, 'h-10 px-3 text-base', error && fieldErrorBorderClasses, className)}
        {...rest}
      />
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
