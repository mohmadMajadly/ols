// حساب حجم خط موحّد للصفحة كلها بحيث يملأ أعرض سطر "آيات" غير متمركز عرض الإطار تقريباً —
// هذا ما يجعل باقي الأسطر (الأقصر) تتوزّع بمحاذاة الطرفين (flex space-between) بفراغات
// طبيعية بينها بدل أن تبدو ضيقة أو فارغة، تماماً كالمصحف المطبوع. كل كلمة في بيانات الصفحة
// محرف واحد مُشكَّل مسبقاً (glyph)، فجمع عرضها الطبيعي بلا أي تباعد إضافي يعطي "العرض
// المضغوط" لسطر كامل؛ نقيس بـcanvas (أرخص من قياس DOM ولا يسبب إعادة تخطيط).

import type { MushafLine } from '../api/mushaf'

const MEASURE_BASE_PX = 100
const MIN_FONT_PX = 14
const MAX_FONT_PX = 56
// نسبة من عرض الإطار يُسمح لأعرض سطر بالوصول إليها — تُبقي هامش تنفّس بسيطاً حتى على أكثف سطر.
const FILL_RATIO = 0.92
// كل كلمة (WordSpan) تحمل px-0.5 (2px على كل جهة) لخلفية التظليل — بكسلات ثابتة لا تتحجّم
// مع حجم الخط، فيجب طرحها من ميزانية العرض المتاحة صراحة (لا تدخل في قياس canvas للنص نفسه)
// وإلا يتجاوز أعرض سطر حافة الإطار فعلياً رغم أن الحساب النظري بالـglyph وحده يبدو مضبوطاً.
const WORD_FIXED_PADDING_PX = 4

let sharedCtx: CanvasRenderingContext2D | null | undefined

function getMeasureContext(): CanvasRenderingContext2D | null {
  if (sharedCtx !== undefined) return sharedCtx
  if (typeof document === 'undefined') {
    sharedCtx = null
    return sharedCtx
  }
  const canvas = document.createElement('canvas')
  sharedCtx = canvas.getContext('2d')
  return sharedCtx
}

interface LineMeasurement {
  glyphWidth: number
  wordCount: number
}

function measureLine(ctx: CanvasRenderingContext2D, line: MushafLine): LineMeasurement {
  let width = 0
  for (const word of line.words) width += ctx.measureText(word.glyph).width
  return { glyphWidth: width, wordCount: line.words.length }
}

// نسبة ارتفاع السطر المسموح أن يشغلها جسم الحرف فعلياً (البقية فراغ سطري طبيعي بين الأسطر)
// — تمنع الخط من التصادم رأسياً مع السطر التالي في صفحات قليلة الأسطر (1 و2: 8 أسطر فقط
// لكن بمساحة الإطار نفسها، فيصير كل سطر أطول ارتفاعاً وأعرض كلماتٍ في آن).
const LINE_HEIGHT_USE_RATIO = 0.62

/**
 * يحسب حجم الخط (px) الذي يجعل أعرض سطر آيات "ممتلئ" (غير مركّز) يشغل تقريباً كامل عرض
 * الإطار المُعطى، بشرط ألا يتجاوز ارتفاع السطر الواحد المتاح (عدد الأسطر/ارتفاع الإطار).
 * إن لم يوجد سطر ممتلئ (صفحة كلها أسطر قصيرة/متمركزة) يُستخدم أعرض سطر متوفر أياً كان.
 */
export function computeFitFontSize(
  lines: MushafLine[],
  family: string,
  containerWidthPx: number,
  containerHeightPx: number,
  lineCount: number,
): number | null {
  const ctx = getMeasureContext()
  if (!ctx || containerWidthPx <= 0) return null

  ctx.font = `${MEASURE_BASE_PX}px "${family}"`

  let widestFull: LineMeasurement | null = null
  let widestAny: LineMeasurement | null = null
  for (const line of lines) {
    if (line.type !== 'ayah' || line.words.length === 0) continue
    const m = measureLine(ctx, line)
    if (!widestAny || m.glyphWidth > widestAny.glyphWidth) widestAny = m
    if (!line.centered && (!widestFull || m.glyphWidth > widestFull.glyphWidth)) widestFull = m
  }

  const reference = widestFull ?? widestAny
  if (!reference || reference.glyphWidth <= 0) return null

  // ميزانية العرض المتاحة للمحارف نفسها بعد طرح التباعد الثابت لكل كلمات ذلك السطر (لا يتحجّم
  // مع مقياس الخط، فيُطرح خارج نسبة القياس لا داخلها).
  const availableForGlyphs = containerWidthPx * FILL_RATIO - reference.wordCount * WORD_FIXED_PADDING_PX
  const scale = Math.max(availableForGlyphs, 0) / reference.glyphWidth
  const sizeByWidth = MEASURE_BASE_PX * scale

  const sizeByHeight =
    containerHeightPx > 0 && lineCount > 0
      ? (containerHeightPx / lineCount) * LINE_HEIGHT_USE_RATIO
      : Number.POSITIVE_INFINITY

  const size = Math.min(sizeByWidth, sizeByHeight)
  return Math.min(MAX_FONT_PX, Math.max(MIN_FONT_PX, size))
}
