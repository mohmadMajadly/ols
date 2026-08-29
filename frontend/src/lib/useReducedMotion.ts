// يقرأ ويتابع تفضيل تقليل الحركة (prefers-reduced-motion) بشكل تفاعلي — يُستخدم في
// المكونات التي تحتاج تفرّعاً في منطق JS (مثل حلقة النبض الذهبية) لا في CSS فقط.

import { useEffect, useState } from 'react'

import { prefersReducedMotion } from '../ui/utils'

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(prefersReducedMotion)

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)')
    const handler = () => setReduced(mql.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [])

  return reduced
}
