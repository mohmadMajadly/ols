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
