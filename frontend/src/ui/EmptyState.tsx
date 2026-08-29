// حالة فارغة: أيقونة خفيفة + جملة دعوة للفعل + زر اختياري. تُستخدم داخل الصفحات
// وداخل Table عند عدم وجود صفوف.

import type { ReactNode } from 'react'

import { IconInbox } from './icons'
import { cx } from './utils'

export interface EmptyStateProps {
  message: string
  action?: ReactNode
  className?: string
}

export function EmptyState({ message, action, className }: EmptyStateProps) {
  return (
    <div
      className={cx(
        'flex flex-col items-center justify-center gap-3 rounded-card border border-dashed border-khatt px-6 py-12 text-center',
        className,
      )}
    >
      <IconInbox className="h-9 w-9 text-hibr-3" />
      <p className="text-sm text-hibr-2">{message}</p>
      {action}
    </div>
  )
}
