// وظيفة نداء واجهة شجرة تصنيفات الملاحظات — فئات (بلون token) + أنواع فرعية + حقول مخصصة.
// يشمل أيضاً نداءات CRUD لمحرر التصنيفات في الإعدادات (WP7) — بلا تكرار للأنواع الأساسية
// المستخدمة في شاشة الجلسة الحية.

import type { NoteColorKey } from '../lib/noteColors'
import { apiClient } from './client'

export type { NoteColorKey }

/** الألوان الدلالية الستة فقط — لا color picker حر (مطابقة docs/design/DIRECTION.md §2). */
export const NOTE_COLOR_OPTIONS: { value: NoteColorKey; label: string }[] = [
  { value: 'hifz', label: 'أحمر الحفظ' },
  { value: 'tajwid', label: 'كهرماني التجويد' },
  { value: 'dabt', label: 'بنفسجي الضبط' },
  { value: 'waqf', label: 'بترولي الوقف' },
  { value: 'sahih', label: 'أخضر الإتقان' },
  { value: 'neutral', label: 'محايد' },
]

export interface NoteSubtype {
  id: string
  category_id: string
  name: string
  sort_order: number
  is_active: boolean
}

export interface NoteCategory {
  id: string
  key: string | null
  name: string
  color: string
  sort_order: number
  is_system: boolean
  is_active: boolean
  subtypes: NoteSubtype[]
}

export type NoteFieldType = 'text' | 'number' | 'select'

export interface NoteField {
  id: string
  name: string
  field_type: NoteFieldType
  options: string[] | null
  sort_order: number
  is_active: boolean
}

export interface Taxonomy {
  categories: NoteCategory[]
  fields: NoteField[]
}

export function fetchTaxonomy(): Promise<Taxonomy> {
  return apiClient.get<Taxonomy>('/taxonomy')
}

/** نسخة صفحة الإعدادات: تشمل المعطَّل (متاحة للمدير والمشرف فقط في الخلفية) */
export function fetchTaxonomyWithInactive(): Promise<Taxonomy> {
  return apiClient.get<Taxonomy>('/taxonomy?include_inactive=true')
}

// ---- فئات ----

export interface NoteCategoryCreateInput {
  name: string
  color: NoteColorKey
  sort_order?: number
}

export interface NoteCategoryUpdateInput {
  name?: string
  color?: NoteColorKey
  sort_order?: number
  is_active?: boolean
}

export function createCategory(payload: NoteCategoryCreateInput): Promise<NoteCategory> {
  return apiClient.post<NoteCategory>('/taxonomy/categories', payload)
}

export function updateCategory(id: string, payload: NoteCategoryUpdateInput): Promise<NoteCategory> {
  return apiClient.patch<NoteCategory>(`/taxonomy/categories/${id}`, payload)
}

export function deleteCategory(id: string): Promise<void> {
  return apiClient.delete<void>(`/taxonomy/categories/${id}`)
}

// ---- أنواع فرعية ----

export interface NoteSubtypeCreateInput {
  category_id: string
  name: string
  sort_order?: number
}

export interface NoteSubtypeUpdateInput {
  name?: string
  sort_order?: number
  is_active?: boolean
}

export function createSubtype(payload: NoteSubtypeCreateInput): Promise<NoteSubtype> {
  return apiClient.post<NoteSubtype>('/taxonomy/subtypes', payload)
}

export function updateSubtype(id: string, payload: NoteSubtypeUpdateInput): Promise<NoteSubtype> {
  return apiClient.patch<NoteSubtype>(`/taxonomy/subtypes/${id}`, payload)
}

// ---- حقول مخصصة ----

export interface NoteFieldCreateInput {
  name: string
  field_type: NoteFieldType
  options?: string[] | null
  sort_order?: number
}

export interface NoteFieldUpdateInput {
  name?: string
  field_type?: NoteFieldType
  options?: string[] | null
  sort_order?: number
  is_active?: boolean
}

export function createField(payload: NoteFieldCreateInput): Promise<NoteField> {
  return apiClient.post<NoteField>('/taxonomy/fields', payload)
}

export function updateField(id: string, payload: NoteFieldUpdateInput): Promise<NoteField> {
  return apiClient.patch<NoteField>(`/taxonomy/fields/${id}`, payload)
}
