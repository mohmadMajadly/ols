// تنسيق المدة الزمنية mm:ss لعرض مؤقت الجلسة وطوابع الملاحظات (خط mono بأرقام لاتينية).

export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

/** ساعات:دقائق لعرض إجماليات طويلة (إجمالي التلاوة المسجلة لطالب) — بلا صفر بادئ للساعات. */
export function formatHoursMinutes(ms: number): string {
  const totalMinutes = Math.max(0, Math.floor(ms / 60000))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return `${hours}:${String(minutes).padStart(2, '0')}`
}
