// وظيفة نداء واجهة الملاحظات — إنشاء ملاحظة موقوتة على جلسة (لحظة الضغط لا لحظة الحفظ).

import { apiClient } from './client'

export interface NoteOut {
  id: string
  session_id: string
  timestamp_ms: number | null
  category_id: string
  subtype_id: string | null
  severity: string | null
  correction_mode: string | null
  surah: number | null
  ayah: number | null
  text: string | null
  extra: Record<string, unknown>
  created_by: string
  created_at: string
}

export interface NoteCreateInput {
  timestamp_ms?: number | null
  category_id: string
  subtype_id?: string | null
  severity?: string | null
  correction_mode?: string | null
  surah?: number | null
  ayah?: number | null
  text?: string | null
  extra?: Record<string, unknown>
}

export interface NoteUpdateInput {
  timestamp_ms?: number | null
  category_id?: string
  subtype_id?: string | null
  severity?: string | null
  correction_mode?: string | null
  surah?: number | null
  ayah?: number | null
  text?: string | null
  extra?: Record<string, unknown>
}

export function createNote(sessionId: string, payload: NoteCreateInput): Promise<NoteOut> {
  return apiClient.post<NoteOut>(`/sessions/${sessionId}/notes`, payload)
}

export function updateNote(id: string, payload: NoteUpdateInput): Promise<NoteOut> {
  return apiClient.patch<NoteOut>(`/notes/${id}`, payload)
}

export function deleteNote(id: string): Promise<void> {
  return apiClient.delete<void>(`/notes/${id}`)
}
