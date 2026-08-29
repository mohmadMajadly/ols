// سطح بطاقة بسيط: خلفية مرتفعة عن الورق، حد رفيع، بلا ظل. يُستخدم كحاوية محتوى عامة.

import type { HTMLAttributes } from 'react'

import { cx } from './utils'

export function Card({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cx('rounded-card border border-khatt bg-waraq-raised p-5', className)}
      {...rest}
    >
      {children}
    </div>
  )
}
