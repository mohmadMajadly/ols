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

const axisDateFormatter = new Intl.DateTimeFormat('en-GB', { month: 'short', day: 'numeric' })

/** تاريخ مختصر لمحور x (مثال: 12 Aug) — عرض رسومي وليس عرض تاريخ سجلّي، فلا يخضع
 * لقاعدة الهجري+الميلادي المزدوجة في lib/date.ts (تلك للتواريخ في النصوص والسجلات). */
export function formatAxisDate(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return axisDateFormatter.format(date)
}
