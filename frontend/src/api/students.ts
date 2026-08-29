// وظائف نداء واجهة الطلاب — أنواع البيانات وبناء مسارات الاستعلام فقط، بلا منطق واجهة.

import { apiClient } from './client'

export interface Student {
  id: string
  full_name: string
  group_id: string | null
  user_id: string | null
  phone: string | null
  guardian_phone: string | null
  birth_year: number | null
  joined_at: string
  memorization_note: string | null
  is_active: boolean
  created_at: string
  /** اسم مستخدم حساب دخول الطالب المربوط إن وُجد (WP8) — null إن لم يُنشأ بعد. */
  account_username: string | null
  /** حالة تفعيل الحساب المربوط — null إن لم يوجد حساب. */
  account_is_active: boolean | null
}

export interface StudentCreateInput {
  full_name: string
  group_id?: string | null
  phone?: string | null
  guardian_phone?: string | null
  birth_year?: number | null
  memorization_note?: string | null
}

export interface StudentUpdateInput {
  full_name?: string
  group_id?: string | null
  phone?: string | null
  guardian_phone?: string | null
  birth_year?: number | null
  memorization_note?: string | null
  is_active?: boolean
}

export interface StudentFilters {
  group_id?: string
  q?: string
  include_inactive?: boolean
}

export function fetchStudents(filters: StudentFilters = {}): Promise<Student[]> {
  const search = new URLSearchParams()
  if (filters.group_id) search.set('group_id', filters.group_id)
  if (filters.q) search.set('q', filters.q)
  if (filters.include_inactive) search.set('include_inactive', 'true')
  const qs = search.toString()
  return apiClient.get<Student[]>(`/students${qs ? `?${qs}` : ''}`)
}

export function fetchStudent(id: string): Promise<Student> {
  return apiClient.get<Student>(`/students/${id}`)
}

export function createStudent(payload: StudentCreateInput): Promise<Student> {
  return apiClient.post<Student>('/students', payload)
}

export function updateStudent(id: string, payload: StudentUpdateInput): Promise<Student> {
  return apiClient.patch<Student>(`/students/${id}`, payload)
}

// ---- حساب دخول الطالب — POST /students/{id}/account (WP8) ----

export interface StudentAccountCreateInput {
  username: string
  password: string
}

export function createStudentAccount(id: string, payload: StudentAccountCreateInput): Promise<Student> {
  return apiClient.post<Student>(`/students/${id}/account`, payload)
}

// ---- بوابة الطالب — GET /students/me و/students/me/stats (WP8) ----

export function fetchMyStudent(): Promise<Student> {
  return apiClient.get<Student>('/students/me')
}

export function fetchMyStudentStats(): Promise<StudentStats> {
  return apiClient.get<StudentStats>('/students/me/stats')
}

// ---- إحصائيات الطالب — GET /students/{id}/stats ----

export interface StudentTotals {
  sessions: number
  notes: number
  total_recorded_ms: number
  avg_grade: number | null
  attendance_rate: number | null
}

export interface GradeTrendPoint {
  session_id: string
  date: string
  grade: number
  session_type: string
}

export interface CategoryCount {
  category_id: string
  name: string
  color: string
  count: number
}

export interface SubtypeCount {
  subtype_id: string
  name: string
  category_name: string
  color: string
  count: number
}

export interface RepeatedMistake {
  surah: number
  surah_name: string
  ayah: number
  count: number
  categories: string[]
}

export interface StudentStats {
  totals: StudentTotals
  grades_trend: GradeTrendPoint[]
  errors_by_category: CategoryCount[]
  top_subtypes: SubtypeCount[]
  sessions_by_type: Record<string, number>
  repeated_mistakes: RepeatedMistake[]
}

export function fetchStudentStats(id: string): Promise<StudentStats> {
  return apiClient.get<StudentStats>(`/students/${id}/stats`)
}
