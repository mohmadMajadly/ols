// وظيفة نداء واجهة السور — قائمة مرجعية ثابتة (رقم/اسم/عدد آيات) لبناء اختيارات النطاق.

import { apiClient } from './client'

export interface Surah {
  number: number
  name: string
  ayah_count: number
}

export function fetchSurahs(): Promise<Surah[]> {
  return apiClient.get<Surah[]>('/quran/surahs')
}
