// مؤشر تحميل بسيط: دائرة SVG تدور. عند تفعيل تقليل الحركة في النظام يتحول تلقائياً
// إلى ثلاث نقاط ثابتة متدرجة الشفافية بدل الدوران (بلا أي جافاسكربت إضافي).

import { cx } from './utils'

export type SpinnerTone = 'current' | 'nur' | 'lazward'

export interface SpinnerProps {
  size?: number
  tone?: SpinnerTone
  className?: string
}

const toneClasses: Record<SpinnerTone, string> = {
  current: '',
  nur: 'text-nur',
  lazward: 'text-lazward-700',
}

export function Spinner({ size = 20, tone = 'current', className }: SpinnerProps) {
  return (
    <span
      role="status"
      aria-label="جارٍ التحميل"
      className={cx('inline-flex items-center justify-center', toneClasses[tone], className)}
      style={{ width: size, height: size }}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        className="motion-reduce:hidden animate-spin"
        style={{ width: size, height: size }}
      >
        <circle cx="12" cy="12" r="9.5" stroke="currentColor" strokeOpacity="0.2" strokeWidth="2.5" />
        <path
          d="M21.5 12a9.5 9.5 0 0 0-9.5-9.5"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </svg>
      <span className="hidden motion-reduce:flex items-center gap-[3px]" aria-hidden="true">
        <span className="h-1.5 w-1.5 rounded-full bg-current opacity-100" />
        <span className="h-1.5 w-1.5 rounded-full bg-current opacity-60" />
        <span className="h-1.5 w-1.5 rounded-full bg-current opacity-30" />
      </span>
    </span>
  )
}
