// رقاقة الموضع القرآني (سورة: آية) — الموضع الزخرفي الوحيد المسموح في عالم الإدارة،
// مستوحاة من علامة رأس الآية ۝: حبة دائرية الأطراف بحد ذهبي رفيع وخلفية شفافة.

import type { HTMLAttributes } from 'react'

import { cx } from './utils'

export interface AyahChipProps extends HTMLAttributes<HTMLSpanElement> {
  surah: string
  ayah: number | string
}

export function AyahChip({ surah, ayah, className, ...rest }: AyahChipProps) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-full border border-dhahab/50 bg-dhahab/[0.06] px-2.5 py-0.5 text-sm text-hibr',
        className,
      )}
      {...rest}
    >
      <span>{surah}</span>
      <span className="text-hibr-3">:</span>
      <span className="font-time tabular-nums">{ayah}</span>
    </span>
  )
}
