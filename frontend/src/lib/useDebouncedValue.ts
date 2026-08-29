// يعيد نسخة مؤخّرة من قيمة متغيّرة بسرعة (كنص بحث فوري) — تُحدَّث بعد توقف التغيير
// لمدة delayMs بلا استدعاء متكرر لواجهة البرمجة مع كل ضغطة مفتاح.

import { useEffect, useState } from 'react'

export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs)
    return () => window.clearTimeout(timer)
  }, [value, delayMs])

  return debounced
}
