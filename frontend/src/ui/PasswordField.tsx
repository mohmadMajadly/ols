// حقل كلمة مرور: نفس أسلوب TextField مع زر صغير لإظهار/إخفاء المحتوى. الزر أيقونة
// فقط بلا نص، ولا يُدرج ضمن ترتيب tab الطبيعي بأولوية عالية (tabIndex افتراضي).

import type { InputHTMLAttributes } from 'react'
import { useId, useState } from 'react'

import { fieldBaseClasses, fieldErrorBorderClasses, fieldErrorClasses, fieldHelpClasses, fieldLabelClasses } from './fieldStyles'
import { IconEye, IconEyeOff } from './icons'
import { cx } from './utils'

export interface PasswordFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string
  help?: string
  error?: string
}

export function PasswordField({ label, help, error, id, className, ...rest }: PasswordFieldProps) {
  const generatedId = useId()
  const fieldId = id ?? generatedId
  const describedBy = error ? `${fieldId}-error` : help ? `${fieldId}-help` : undefined
  const [visible, setVisible] = useState(false)

  return (
    <div>
      <label htmlFor={fieldId} className={fieldLabelClasses}>
        {label}
      </label>
      <div className="relative">
        <input
          id={fieldId}
          type={visible ? 'text' : 'password'}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={describedBy}
          className={cx(
            fieldBaseClasses,
            'h-10 ps-3 pe-10 text-base',
            error && fieldErrorBorderClasses,
            className,
          )}
          {...rest}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
          className="absolute inset-y-0 end-0 flex w-10 items-center justify-center text-hibr-3 hover:text-hibr-2"
        >
          {visible ? <IconEyeOff className="h-[18px] w-[18px]" /> : <IconEye className="h-[18px] w-[18px]" />}
        </button>
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
