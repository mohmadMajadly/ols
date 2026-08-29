// تنسيق التاريخ الميلادي والهجري معاً — كل مكان يعرض تاريخاً في الواجهة يجمع بينهما
// التزاماً بـ DIRECTION.md §7. الأرقام الميلادية لاتينية ثابتة العرض، والهجرية بالحساب
// الرسمي (أم القرى) عبر Intl المدمجة في المتصفح — بلا أي مكتبة تقويم إضافية.

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

const gregorianFormatter = new Intl.DateTimeFormat('en-CA', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

const hijriFormatter = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
})

function toDate(value: string | Date): Date {
  if (value instanceof Date) return value
  // تاريخ بلا وقت (مثل joined_at) يُحلَّل بمكوّناته المحلية مباشرة كي لا ينزاح يوماً
  // كاملاً عند تفسيره كـ UTC منتصف الليل في التوقيتات السالبة.
  if (DATE_ONLY_PATTERN.test(value)) {
    const [year, month, day] = value.split('-').map(Number)
    return new Date(year, month - 1, day)
  }
  return new Date(value)
}

/** يعيد التاريخ الميلادي والهجري معاً، مفصولين بشرطة، أو «—» إن كانت القيمة غير صالحة. */
export function formatDualDate(value: string | Date | null | undefined): string {
  if (!value) return '—'
  const date = toDate(value)
  if (Number.isNaN(date.getTime())) return '—'
  return `${gregorianFormatter.format(date)} — ${hijriFormatter.format(date)}`
}
