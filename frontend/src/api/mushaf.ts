// وظائف نداء واجهة المصحف — تخطيط الصفحة الواحدة (604 صفحة) وتحديد صفحة موضع (سورة:آية).
// بيانات ثابتة لا تتغير أبداً بعد النشر — يُخزَّن الاستدعاء بـstaleTime لا نهائي في المستهلِك.

import { apiClient } from './client'

export interface MushafWord {
  surah: number
  ayah: number
  /** ترتيب الكلمة داخل الآية (يشمل رمز رأس الآية كـ"كلمة" أخيرة إن is_ayah_marker). */
  word: number
  text_uthmani: string
  /** المحرف/الرمز الذي يُرسم بخط الصفحة QPC الخاص (glyph مفرد لكل كلمة). */
  glyph: string
  is_ayah_marker: boolean
}

export type MushafLineType = 'surah_name' | 'basmala' | 'ayah'

export interface MushafLine {
  line: number
  type: MushafLineType
  surah?: number | null
  /** true لسطر يُعرض متمركزاً (اسم سورة/بسملة/سطر آيات قصير) بدل التوزيع بمحاذاة الطرفين. */
  centered: boolean
  words: MushafWord[]
}

export interface MushafPageData {
  page: number
  lines: MushafLine[]
}

export interface MushafPageFor {
  surah: number
  ayah: number
  page: number
  line: number
}

export const MUSHAF_TOTAL_PAGES = 604

export function fetchMushafPage(page: number): Promise<MushafPageData> {
  return apiClient.get<MushafPageData>(`/mushaf/pages/${page}`)
}

export function fetchMushafPageFor(surah: number, ayah: number): Promise<MushafPageFor> {
  return apiClient.get<MushafPageFor>(`/mushaf/page-for?surah=${surah}&ayah=${ayah}`)
}
