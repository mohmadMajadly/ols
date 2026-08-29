// كلمات نطاق الجلسة المتوقعة (WP9c) — تُستخدم محلياً لحساب فهرس "أرجِع المؤشر إلى
// هنا" (surah/ayah/word مطلوبة → position داخل المصفوفة) بدل تخمينه في خدمة asr.

import { apiClient } from './client'

export interface ExpectedWord {
  surah: number
  ayah: number
  word: number
  text: string
}

export function fetchExpectedWords(sessionId: string): Promise<ExpectedWord[]> {
  return apiClient.get<ExpectedWord[]>(`/sessions/${sessionId}/expected-words`)
}
