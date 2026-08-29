// وظائف نداء واجهة الحلقات — أنواع البيانات وبناء مسارات الاستعلام فقط، بلا منطق واجهة.

import { apiClient } from './client'

export interface Group {
  id: string
  name: string
  description: string | null
  teacher_id: string | null
  is_active: boolean
  created_at: string
  students_count: number
}

export interface GroupCreateInput {
  name: string
  description?: string | null
  teacher_id?: string | null
}

export interface GroupUpdateInput {
  name?: string
  description?: string | null
  teacher_id?: string | null
  is_active?: boolean
}

export interface GroupFilters {
  include_inactive?: boolean
}

export function fetchGroups(filters: GroupFilters = {}): Promise<Group[]> {
  const search = new URLSearchParams()
  if (filters.include_inactive) search.set('include_inactive', 'true')
  const qs = search.toString()
  return apiClient.get<Group[]>(`/groups${qs ? `?${qs}` : ''}`)
}

export function createGroup(payload: GroupCreateInput): Promise<Group> {
  return apiClient.post<Group>('/groups', payload)
}

export function updateGroup(id: string, payload: GroupUpdateInput): Promise<Group> {
  return apiClient.patch<Group>(`/groups/${id}`, payload)
}
