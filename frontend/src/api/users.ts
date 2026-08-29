// وظائف نداء واجهة المستخدمين — أنواع البيانات وبناء مسارات الاستعلام فقط، بلا منطق واجهة.

import type { UserRole } from '../auth/AuthContext'
import { apiClient } from './client'

export interface ManagedUser {
  id: string
  username: string
  full_name: string
  role: UserRole
  is_active: boolean
  created_at: string
}

export interface UserCreateInput {
  username: string
  password: string
  full_name: string
  role: UserRole
}

export interface UserUpdateInput {
  full_name?: string
  role?: UserRole
  is_active?: boolean
  password?: string
}

export interface UserFilters {
  role?: UserRole
}

export function fetchUsers(filters: UserFilters = {}): Promise<ManagedUser[]> {
  const search = new URLSearchParams()
  if (filters.role) search.set('role', filters.role)
  const qs = search.toString()
  return apiClient.get<ManagedUser[]>(`/users${qs ? `?${qs}` : ''}`)
}

export function createUser(payload: UserCreateInput): Promise<ManagedUser> {
  return apiClient.post<ManagedUser>('/users', payload)
}

export function updateUser(id: string, payload: UserUpdateInput): Promise<ManagedUser> {
  return apiClient.patch<ManagedUser>(`/users/${id}`, payload)
}
