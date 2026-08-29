// تذكّر آخر صفحة مصحف تُصفِّح — مقبول كتفضيل جهاز (localStorage)، لا كتابة على الخادم.
// يُستخدم من صفحة التصفح المستقلة ومن لوحة المصحف داخل الجلسة الحية (احتياطاً حين لا يوجد
// نطاق للجلسة).

const KEY = 'ols-mushaf-last-page'

export function getLastMushafPage(fallback = 1): number {
  if (typeof window === 'undefined') return fallback
  const raw = window.localStorage.getItem(KEY)
  const n = raw ? Number(raw) : NaN
  return Number.isInteger(n) && n >= 1 && n <= 604 ? n : fallback
}

export function setLastMushafPage(page: number): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(KEY, String(page))
  } catch {
    // تخزين تفضيلي بحت — تجاهل فشله (وضع خاص/حصة ممتلئة)
  }
}
