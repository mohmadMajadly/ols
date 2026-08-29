// خرائط لون فئة الملاحظة (NoteColor من الخلفية: hifz/tajwid/dabt/waqf/sahih/neutral) إلى
// أصناف Tailwind الثابتة (بلا hex). خريطتان: لعالم اللازورد (نص/حد فوق خلفية داكنة) ولخرزات
// الخيط (خلفية مصمتة). أسماء الأصناف كاملة وحرفية عمداً كي يلتقطها مُحلّل Tailwind الساكن.

import type { BadgeVariant } from '../ui/Badge'

export type NoteColorKey = 'hifz' | 'tajwid' | 'dabt' | 'waqf' | 'sahih' | 'neutral'

const BADGE_VARIANT: Record<NoteColorKey, BadgeVariant> = {
  hifz: 'hifz',
  tajwid: 'tajwid',
  dabt: 'dabt',
  waqf: 'waqf',
  sahih: 'sahih',
  neutral: 'neutral',
}

/** فوق اللازورد الداكن: نص وحد بلون الفئة، خلفية lazward-800 ثابتة (يُطبَّق في المستهلك). */
const LAZWARD_ACCENT: Record<NoteColorKey, string> = {
  hifz: 'text-khata-hifz border-khata-hifz',
  tajwid: 'text-khata-tajwid border-khata-tajwid',
  dabt: 'text-khata-dabt border-khata-dabt',
  waqf: 'text-waqf border-waqf',
  sahih: 'text-sahih border-sahih',
  neutral: 'text-nur border-nur/40',
}

/** فوق الورق الفاتح (شاشة الجلسة بعد قرار 2026-08-29): نص وحد بلون الفئة على سطح مرتفع،
 * مع غسلة خفيفة من لون الفئة عند التمرير — يوازي أسلوب Badge لكن بحجم زر لمس. */
const PAPER_ACCENT: Record<NoteColorKey, string> = {
  hifz: 'text-khata-hifz border-khata-hifz/45 hover:bg-khata-hifz/5',
  tajwid: 'text-khata-tajwid border-khata-tajwid/45 hover:bg-khata-tajwid/5',
  dabt: 'text-khata-dabt border-khata-dabt/45 hover:bg-khata-dabt/5',
  waqf: 'text-waqf border-waqf/45 hover:bg-waqf/5',
  sahih: 'text-sahih border-sahih/45 hover:bg-sahih/5',
  neutral: 'text-hibr-2 border-khatt hover:bg-lazward-100/40',
}

/** خرزة مصمتة على خيط الجلسة. */
const SOLID_DOT: Record<NoteColorKey, string> = {
  hifz: 'bg-khata-hifz',
  tajwid: 'bg-khata-tajwid',
  dabt: 'bg-khata-dabt',
  waqf: 'bg-waqf',
  sahih: 'bg-sahih',
  neutral: 'bg-hibr-3',
}

/** توكن لون الرسم البياني (--chart-*) — للاستخدام في fill/style الديناميكي داخل SVG
 * (لا يمكن لـ Tailwind توليد صنف ثابت لقيمة ديناميكية، فنمرر var() كسلسلة نصية). */
const CHART_VAR: Record<NoteColorKey, string> = {
  hifz: 'var(--chart-hifz)',
  tajwid: 'var(--chart-tajwid)',
  dabt: 'var(--chart-dabt)',
  waqf: 'var(--chart-waqf)',
  sahih: 'var(--chart-sahih)',
  neutral: 'var(--hibr-3)',
}

function key(color: string): NoteColorKey {
  return (color in LAZWARD_ACCENT ? color : 'neutral') as NoteColorKey
}

export function noteBadgeVariant(color: string): BadgeVariant {
  return BADGE_VARIANT[key(color)]
}

export function noteLazwardAccentClasses(color: string): string {
  return LAZWARD_ACCENT[key(color)]
}

export function notePaperAccentClasses(color: string): string {
  return PAPER_ACCENT[key(color)]
}

export function noteSolidDotClass(color: string): string {
  return SOLID_DOT[key(color)]
}

export function noteChartColorVar(color: string): string {
  return CHART_VAR[key(color)]
}
