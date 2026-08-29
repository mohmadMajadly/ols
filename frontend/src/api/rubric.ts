// وظائف نداء واجهة سلّم التقييم: الأوزان الثلاثة (حفظ/تجويد/أداء) وجدول الخصومات
// (فئة خصم × طريقة تصحيح). GET لكل الطاقم، PUT لـ admin فقط (تُطبَّق في الخلفية).

import { apiClient } from './client'

export interface RubricWeights {
  hifz: number
  tajwid: number
  adaa: number
}

export type DeductionMode = 'tadaruk' | 'tanbih' | 'talqin'
export type DeductionCategory = 'hifz' | 'tajwid' | 'dabt' | 'waqf'

export type RubricDeductions = Record<DeductionCategory, Record<DeductionMode, number>>

export interface Rubric {
  weights: RubricWeights
  deductions: RubricDeductions
}

export function fetchRubric(): Promise<Rubric> {
  return apiClient.get<Rubric>('/rubric')
}

export function updateRubric(payload: Rubric): Promise<Rubric> {
  return apiClient.put<Rubric>('/rubric', payload)
}
