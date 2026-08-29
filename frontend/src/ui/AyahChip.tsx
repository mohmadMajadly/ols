// رقاقة الموضع القرآني (سورة: آية) — الموضع الزخرفي الوحيد المسموح في عالم الإدارة،
// مستوحاة من علامة رأس الآية ۝: حبة دائرية الأطراف بحد ذهبي رفيع وخلفية شفافة.

import type { HTMLAttributes } from 'react'

import { cx } from './utils'

export type AyahChipTone = 'paper' | 'lazward'

export interface AyahChipProps extends HTMLAttributes<HTMLSpanElement> {
  surah: string
  ayah: number | string
  /** 'paper' (افتراضي، عالم الإدارة) أو 'lazward' (فوق خلفية اللازورد الداكنة). */
  tone?: AyahChipTone
}

const toneClasses: Record<AyahChipTone, string> = {
  paper: 'border-dhahab/50 bg-dhahab/[0.06] text-hibr',
  lazward: 'border-dhahab-bright/60 bg-dhahab-bright/[0.1] text-nur',
}

export function AyahChip({ surah, ayah, tone = 'paper', className, ...rest }: AyahChipProps) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-sm',
        toneClasses[tone],
        className,
      )}
      {...rest}
    >
      <span>{surah}</span>
      <span className={tone === 'lazward' ? 'text-nur/50' : 'text-hibr-3'}>:</span>
      <span className="font-time tabular-nums">{ayah}</span>
    </span>
  )
}
