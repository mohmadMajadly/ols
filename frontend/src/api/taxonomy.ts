// وظيفة نداء واجهة شجرة تصنيفات الملاحظات — فئات (بلون token) + أنواع فرعية + حقول مخصصة.

import { apiClient } from './client'

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
