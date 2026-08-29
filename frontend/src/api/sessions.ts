// وظائف نداء واجهة الجلسات — الإنشاء/القائمة/التفاصيل/التعديل والجلسة النشطة. رفع
// المقاطع والإنهاء والإلغاء تمر حصراً عبر RecorderEngine (session/recorderEngine.ts) —
// لا تُستدعى مساراتها من هنا إطلاقاً.

import { apiClient } from './client'
import type { NoteOut } from './notes'

export type SessionType = 'sabq' | 'sabqiyat' | 'murajaah'
export type Attendance = 'hadir' | 'mutaakhir' | 'ghaib'
export type SessionStatus = 'recording' | 'completed' | 'cancelled'

export interface RecordingOut {
  status: string
  mime_type: string
  duration_ms: number | null
  size_bytes: number | null
}

export interface SessionListItem {
  id: string
  student_id: string
  student_name: string
  teacher_id: string
  session_type: SessionType
  status: SessionStatus
  attendance: Attendance
  range_start_surah: number | null
  range_start_ayah: number | null
  range_end_surah: number | null
  range_end_ayah: number | null
  grade: number | null
  suggested_grade: number | null
  notes_count: number
  started_at: string
  ended_at: string | null
}

export interface SessionDetail {
  id: string
  student_id: string
  student_name: string
  teacher_id: string
  session_type: SessionType
  status: SessionStatus
  attendance: Attendance
  range_start_surah: number | null
  range_start_ayah: number | null
  range_end_surah: number | null
  range_end_ayah: number | null
  grade: number | null
  suggested_grade: number | null
  summary: string | null
  started_at: string
  ended_at: string | null
  recording: RecordingOut | null
  notes: NoteOut[]
}

export interface ActiveSession {
  session: SessionDetail | null
  /** {segment: [الفهارس المرفوعة]} */
  uploaded: Record<string, number[]>
}

export interface SessionCreateInput {
  student_id: string
  session_type: SessionType
  attendance?: Attendance
  range_start_surah?: number | null
  range_start_ayah?: number | null
  range_end_surah?: number | null
  range_end_ayah?: number | null
}

export interface SessionUpdateInput {
  grade?: number | null
  summary?: string | null
  attendance?: Attendance
}

export interface SessionListFilters {
  student_id?: string
  group_id?: string
  session_type?: SessionType
  from?: string
  to?: string
  limit?: number
  offset?: number
}

export function createSession(payload: SessionCreateInput): Promise<SessionDetail> {
  return apiClient.post<SessionDetail>('/sessions', payload)
}

export function fetchActiveSession(): Promise<ActiveSession> {
  return apiClient.get<ActiveSession>('/sessions/active')
}

export function fetchSessions(filters: SessionListFilters = {}): Promise<SessionListItem[]> {
  const search = new URLSearchParams()
  if (filters.student_id) search.set('student_id', filters.student_id)
  if (filters.group_id) search.set('group_id', filters.group_id)
  if (filters.session_type) search.set('session_type', filters.session_type)
  if (filters.from) search.set('from', filters.from)
  if (filters.to) search.set('to', filters.to)
  if (filters.limit) search.set('limit', String(filters.limit))
  if (filters.offset) search.set('offset', String(filters.offset))
  const qs = search.toString()
  return apiClient.get<SessionListItem[]>(`/sessions${qs ? `?${qs}` : ''}`)
}

export function fetchSession(id: string): Promise<SessionDetail> {
  return apiClient.get<SessionDetail>(`/sessions/${id}`)
}

export function updateSession(id: string, payload: SessionUpdateInput): Promise<SessionDetail> {
  return apiClient.patch<SessionDetail>(`/sessions/${id}`, payload)
}
