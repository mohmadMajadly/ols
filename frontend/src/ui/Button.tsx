// زر الإجراء الأساسي في النظام. أربعة أنواع دلالية بلا تدرجات لونية وبلا ظلال ثقيلة،
// وحجمان. حالة التحميل تعرض مؤشر دوران صغيراً بدل الأيقونة/بجانب النص وتعطّل الزر.

import type { ButtonHTMLAttributes, ReactNode } from 'react'

import { Spinner } from './Spinner'
import { cx } from './utils'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'md' | 'sm'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  children: ReactNode
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-lazward-700 text-nur border border-lazward-700 hover:bg-lazward-800 hover:border-lazward-800',
  secondary: 'bg-waraq-raised text-hibr border border-khatt hover:bg-lazward-100/40',
  ghost: 'bg-transparent text-hibr-2 border border-transparent hover:bg-lazward-100/40 hover:text-hibr',
  danger: 'bg-transparent text-khata-hifz border border-transparent hover:bg-khata-hifz/10',
}

const sizeClasses: Record<ButtonSize, string> = {
  md: 'h-10 px-4 text-base gap-2',
  sm: 'h-8 px-3 text-sm gap-1.5',
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(
        'inline-flex items-center justify-center whitespace-nowrap rounded-control font-medium transition-colors duration-150',
        'disabled:cursor-not-allowed disabled:opacity-50',
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...rest}
    >
      {loading && <Spinner size={size === 'sm' ? 14 : 16} tone={variant === 'primary' ? 'nur' : 'current'} />}
      {children}
    </button>
  )
}
