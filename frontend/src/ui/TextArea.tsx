// حقل نص متعدد الأسطر — نفس منطق TextField مع ارتفاع أساسي أكبر وقابلية تمدد رأسية فقط.

import type { TextareaHTMLAttributes } from 'react'
import { useId } from 'react'

import { fieldBaseClasses, fieldErrorBorderClasses, fieldErrorClasses, fieldHelpClasses, fieldLabelClasses } from './fieldStyles'
import { cx } from './utils'

export interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string
  help?: string
  error?: string
}

export function TextArea({ label, help, error, id, className, rows = 4, ...rest }: TextAreaProps) {
  const generatedId = useId()
  const fieldId = id ?? generatedId
  const describedBy = error ? `${fieldId}-error` : help ? `${fieldId}-help` : undefined

  return (
    <div>
      <label htmlFor={fieldId} className={fieldLabelClasses}>
        {label}
      </label>
      <textarea
        id={fieldId}
        rows={rows}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={describedBy}
        className={cx(fieldBaseClasses, 'resize-y px-3 py-2 text-base', error && fieldErrorBorderClasses, className)}
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
