// أدوات مشتركة لمكونات الرسوم البيانية اليدوية (SVG بلا مكتبات): مسار قوس مستدير من
// جهة واحدة فقط لعلامات الأعمدة، وتنسيق تاريخ مختصر لمحور x. القواعد الملزمة (محور
// واحد، شبكة خافتة، tooltips، tabular-nums) في docs/design/DIRECTION.md.

/** مستطيل بنهاية مدوّرة من جهة x الكبرى فقط (يمين المستطيل) — لعمود أفقي ينتهي هناك. */
export function roundedRectPathRight(x: number, y: number, w: number, h: number, r: number): string {
  if (w <= 0 || h <= 0) return ''
  const radius = Math.min(r, w, h / 2)
  return [
    `M${x},${y}`,
    `H${x + w - radius}`,
    `Q${x + w},${y} ${x + w},${y + radius}`,
    `V${y + h - radius}`,
    `Q${x + w},${y + h} ${x + w - radius},${y + h}`,
    `H${x}`,
    'Z',
  ].join(' ')
}

/** مستطيل بنهاية مدوّرة من جهة x الصغرى فقط (يسار المستطيل) — لعمود أفقي ينتهي هناك. */
export function roundedRectPathLeft(x: number, y: number, w: number, h: number, r: number): string {
  if (w <= 0 || h <= 0) return ''
  const radius = Math.min(r, w, h / 2)
  return [
    `M${x + radius},${y}`,
    `H${x + w}`,
    `V${y + h}`,
    `H${x + radius}`,
    `Q${x},${y + h} ${x},${y + h - radius}`,
    `V${y + radius}`,
    `Q${x},${y} ${x + radius},${y}`,
    'Z',
  ].join(' ')
}

/** مستطيل بنهاية مدوّرة من الأعلى فقط — لعمود رأسي (جهة القيمة). */
export function roundedRectPathTop(x: number, y: number, w: number, h: number, r: number): string {
  if (w <= 0 || h <= 0) return ''
  const radius = Math.min(r, w / 2, h)
  return [
    `M${x},${y + h}`,
    `V${y + radius}`,
    `Q${x},${y} ${x + radius},${y}`,
    `H${x + w - radius}`,
    `Q${x + w},${y} ${x + w},${y + radius}`,
    `V${y + h}`,
    'Z',
  ].join(' ')
}

const AXIS_DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/** تاريخ مختصر لمحور x بأرقام لاتينية بصيغة يوم/شهر (مثال: 29/08) — عرض رسومي مضغوط
 * بلا اسم شهر أجنبي وبلا أرقام هندية مختلطة عن بقية أرقام الرسوم (tabular-nums لاتينية
 * في كل مكان)، وليس عرض تاريخ سجلّي فلا يخضع لقاعدة الهجري+الميلادي المزدوجة في
 * lib/date.ts (تلك للتواريخ في النصوص والسجلات). */
export function formatAxisDate(value: string | Date): string {
  // تاريخ بلا وقت (مثل date من نقاط الرسم اليومية) يُحلَّل بمكوّناته المحلية مباشرة
  // كي لا ينزاح يوماً كاملاً عند تفسيره كـ UTC منتصف الليل في التوقيتات السالبة.
  let date: Date
  if (typeof value === 'string' && AXIS_DATE_ONLY_PATTERN.test(value)) {
    const [year, month, day] = value.split('-').map(Number)
    date = new Date(year, month - 1, day)
  } else {
    date = value instanceof Date ? value : new Date(value)
  }
  if (Number.isNaN(date.getTime())) return ''
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  return `${day}/${month}`
}
