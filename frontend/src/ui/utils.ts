// أدوات صغيرة مشتركة بين مكونات نظام التصميم — بلا أي اعتماد على مكتبات خارجية.

/** يدمج أسماء أصناف CSS ويتجاهل القيم الفارغة/false. بديل محلي خفيف عن clsx. */
export function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ')
}

/** يقرأ تفضيل تقليل الحركة في المتصفح؛ يُستخدم في المكونات التي تحتاج تفرّعاً في المنطق لا في CSS فقط. */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
