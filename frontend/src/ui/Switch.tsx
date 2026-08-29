// مفتاح تبديل ثنائي (تفعيل/تعطيل): مسار بعرض ثابت وحبة دائرية تنزلق بين طرفيه.
// يستخدم خصائص CSS المنطقية (inset-inline-start) عبر style مباشرة كي يسلك سلوكاً
// صحيحاً في RTL دون انعكاس بصري خاطئ.

import type { ButtonHTMLAttributes } from 'react'

import { cx } from './utils'

export interface SwitchProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onChange' | 'value'> {
  checked: boolean
  onChange: (checked: boolean) => void
  label?: string
}

export function Switch({ checked, onChange, label, id, className, disabled, ...rest }: SwitchProps) {
  return (
    <label
      htmlFor={id}
      className={cx('inline-flex select-none items-center gap-2.5', disabled ? 'opacity-50' : 'cursor-pointer', className)}
    >
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx(
          'relative h-6 w-[42px] shrink-0 rounded-full border transition-colors duration-150',
          checked ? 'border-lazward-700 bg-lazward-700' : 'border-khatt bg-waraq',
          disabled ? 'cursor-not-allowed' : 'cursor-pointer',
        )}
        {...rest}
      >
        <span
          aria-hidden="true"
          className="absolute top-0.5 h-[18px] w-[18px] rounded-full bg-waraq-raised transition-[inset-inline-start] duration-150"
          style={{ insetInlineStart: checked ? 'calc(100% - 20px)' : '2px' }}
        />
      </button>
      {label && <span className="text-sm text-hibr">{label}</span>}
    </label>
  )
}
