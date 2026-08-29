// شارة صغيرة بلون دلالي — تُستخدم لاحقاً لعرض الأدوار وتصنيفات أخطاء التسميع.

import type { HTMLAttributes } from 'react'

import { cx } from './utils'

export type BadgeVariant = 'neutral' | 'lazward' | 'sahih' | 'hifz' | 'tajwid' | 'dabt' | 'waqf'

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant
}

const variantClasses: Record<BadgeVariant, string> = {
  neutral: 'bg-hibr-3/15 text-hibr-2',
  lazward: 'bg-lazward-100 text-lazward-700',
  sahih: 'bg-sahih/10 text-sahih',
  hifz: 'bg-khata-hifz/10 text-khata-hifz',
  tajwid: 'bg-khata-tajwid/10 text-khata-tajwid',
  dabt: 'bg-khata-dabt/10 text-khata-dabt',
  waqf: 'bg-waqf/10 text-waqf',
}

export function Badge({ variant = 'neutral', className, children, ...rest }: BadgeProps) {
  return (
    <span
      className={cx(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-sm font-medium',
        variantClasses[variant],
        className,
      )}
      {...rest}
    >
      {children}
    </span>
  )
}
