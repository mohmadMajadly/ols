// يتابع مطابقة media query معيّن تفاعلياً (matchMedia) — نمط مطابق لـuseReducedMotion.
// يُستخدم لاختيار تخطيط لوحة المصحف داخل الجلسة الحية (عمود جانبي/تمدّد فوق الأزرار) بلا
// ازدواج نسخة المكوّن بين الحالتين.

import { useEffect, useState } from 'react'

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false,
  )

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mql = window.matchMedia(query)
    const handler = () => setMatches(mql.matches)
    handler()
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [query])

  return matches
}
