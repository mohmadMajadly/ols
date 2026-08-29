// تحميل خطوط المصحف عبر FontFace API مع كاش على مستوى الوحدة (لا نحمّل الخط نفسه مرتين
// مهما تكرر تركيب/فك تركيب المكوّن أو تعدد نسخه). كل صفحة من الـ604 لها خط QPC خاص بها
// (raison d'être: المحارف حروف مصممة خصيصاً لتلك الصفحة فقط — راجع WP9a)، بالإضافة إلى خط
// عثماني عام واحد (KFGQPC Uthmanic Hafs — أصيل، من نفس أسرة QPC) يُستخدم حصراً لسطري
// البسملة الزخرفي واسم السورة، لأن خط الصفحة لا يحوي فعلياً غير محارف كلمات آياتها بالضبط
// (تحقّقنا بفحص جداول cmap: خط صفحة نموذجي لا يتجاوز عشرات المحارف، بلا حتى محرف مسافة) —
// لذا "خط الصفحة" حرفياً لا يمكنه رسم نص البسملة الحر؛ الخط العثماني العام هو الحل الصحيح
// الوحيد الذي يبقينا ضمن عائلة خطوط القرآن ولا يعرض القرآن بخط غير خطه أبداً (DIRECTION §3).

export const MUSHAF_TOTAL_PAGES = 604

export const UTHMANIC_FAMILY = 'uthmanic-hafs'
const UTHMANIC_URL = '/fonts/qpc-v2/uthmanic-hafs.woff2'

function pad(page: number): string {
  return String(page).padStart(3, '0')
}

export function pageFontFamily(page: number): string {
  return `qpc-page-${pad(page)}`
}

function pageFontUrl(page: number): string {
  return `/fonts/qpc-v2/p${pad(page)}.woff2`
}

// عائلة → وعد يُحل باسم العائلة نفسها بعد إضافتها فعلياً إلى document.fonts. مشترك بين كل
// نسخ المكوّن في الصفحة (متصفح المستخدم يحمّل كل خط صفحة مرة واحدة طوال الجلسة).
const familyPromises = new Map<string, Promise<string>>()

function loadFamily(family: string, url: string): Promise<string> {
  const cached = familyPromises.get(family)
  if (cached) return cached

  // ملاحظة مهمة: لا تستخدم document.fonts.check() كاختصار "الخط محمَّل مسبقاً" — لعائلة لم
  // تُسجَّل مطلقاً بعد، يعيد check() دوماً true (لا شيء "معلَّق" لعائلة غير معروفة أصلاً، فلا
  // يوجد ما ينتظره المتصفح)، فيتخطّى التحميل الفعلي بصمت ويظل النص يُرسم بخط بديل. الكاش
  // أعلاه (familyPromises) هو ما يمنع إعادة التحميل فعلياً، لا check().
  const promise = (async () => {
    const face = new FontFace(family, `url(${url})`)
    const loaded = await face.load()
    document.fonts.add(loaded)
    return family
  })()

  familyPromises.set(family, promise)
  return promise
}

/** يحمّل خط صفحة (1..604) ويعيد وعداً باسم عائلته بعد اكتمال التحميل فعلياً. */
export function loadPageFont(page: number): Promise<string> {
  return loadFamily(pageFontFamily(page), pageFontUrl(page))
}

/** جلب مسبق هادئ لخط صفحة مجاورة — لا ينتظره أحد ولا يُبلّغ عن فشل (مجرد تحسين أداء). */
export function prefetchPageFont(page: number): void {
  if (page < 1 || page > MUSHAF_TOTAL_PAGES) return
  loadPageFont(page).catch(() => {
    /* تجاهل: الصفحة ستُحمَّل من جديد عند الحاجة الفعلية إليها */
  })
}

export function loadUthmanicFont(): Promise<string> {
  return loadFamily(UTHMANIC_FAMILY, UTHMANIC_URL)
}
