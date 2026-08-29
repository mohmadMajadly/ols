// يحوّل رقم سورة إلى اسمها بالاعتماد على قائمة GET /api/quran/surahs — تُستخدم لعرض
// رقاقات الموضع القرآني باسم السورة بدل رقمها (تعديل مطلوب من مراجعة المدير).

import type { Surah } from '../api/quran'

export function buildSurahNameMap(surahs: Surah[]): Map<number, string> {
  return new Map(surahs.map((s) => [s.number, s.name] as const))
}

/** اسم السورة إن وُجد في الخريطة، وإلا الرقم نفسه نصاً (حتى لا تُترك الرقاقة فارغة قبل تحميل القائمة). */
export function surahLabel(names: Map<number, string>, surah: number): string {
  return names.get(surah) ?? String(surah)
}
