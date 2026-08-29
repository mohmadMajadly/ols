// ترويسة صفحة قياسية: عنوان بخط العرض (Amiri) ووصف اختياري، ومنطقة أزرار في الطرف
// المقابل للعنوان (تتبع اتجاه RTL تلقائياً عبر flex).

import type { ReactNode } from 'react'

export interface PageHeaderProps {
  title: string
  description?: string
  actions?: ReactNode
}

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="font-display text-2xl text-hibr">{title}</h1>
        {description && <p className="mt-1 text-sm text-hibr-2">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  )
}
