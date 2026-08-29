// وظائف نداء واجهة لوحة التحكم — GET /api/dashboard/stats. أنواع البيانات وبناء مسار
// الاستعلام فقط، بلا منطق واجهة. RBAC (تقييد المعلم بنطاقه) يُفرض بالكامل في الخادم.

import type { SessionType } from './sessions'
import { apiClient } from './client'

export interface DashboardTotals {
  active_students: number
  sessions: number
  notes: number
  avg_grade: number | null
  attendance_rate: number | null
  total_recorded_ms: number
}

export interface SessionsOverTimePoint {
  date: string
  count: number
}

export interface CategoryCount {
  category_id: string
  name: string
  color: string
  count: number
}

export interface GradeBucket {
  bucket: string
  count: number
}

export interface NeedsAttentionEntry {
  student_id: string
  full_name: string
  group_name: string | null
  avg_grade: number
  sessions: number
}

export interface GroupSummary {
  group_id: string
  name: string
  students: number
  sessions: number
  avg_grade: number | null
}

export interface DashboardStats {
  totals: DashboardTotals
  sessions_over_time: SessionsOverTimePoint[]
  errors_by_category: CategoryCount[]
  grade_distribution: GradeBucket[]
  needs_attention: NeedsAttentionEntry[]
  groups_summary: GroupSummary[]
}

export interface DashboardFilters {
  group_id?: string
  teacher_id?: string
  session_type?: SessionType
  /** ISO datetime — بداية الفترة (افتراضي الخادم: آخر 30 يوماً إن لم تُمرَّر) */
  from?: string
  /** ISO datetime — نهاية الفترة */
  to?: string
}

export function fetchDashboardStats(filters: DashboardFilters = {}): Promise<DashboardStats> {
  const search = new URLSearchParams()
  if (filters.group_id) search.set('group_id', filters.group_id)
  if (filters.teacher_id) search.set('teacher_id', filters.teacher_id)
  if (filters.session_type) search.set('session_type', filters.session_type)
  if (filters.from) search.set('from', filters.from)
  if (filters.to) search.set('to', filters.to)
  const qs = search.toString()
  return apiClient.get<DashboardStats>(`/dashboard/stats${qs ? `?${qs}` : ''}`)
}
