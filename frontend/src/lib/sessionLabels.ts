// تسميات عربية ثابتة لقيم تعداد (enum) الجلسات والملاحظات — نقطة واحدة تمنع تكرار
// النصوص أو اختلافها بين الشاشات (سجل الجلسات، اللوحة السفلية، صفحة التفاصيل).

export const sessionTypeLabels: Record<string, string> = {
  sabq: 'سبق',
  sabqiyat: 'سبقيات',
  murajaah: 'مراجعة كبرى',
}

export interface SessionTypeCard {
  value: 'sabq' | 'sabqiyat' | 'murajaah'
  title: string
  subtitle?: string
}

export const SESSION_TYPE_CARDS: SessionTypeCard[] = [
  { value: 'sabq', title: 'سبق', subtitle: 'درس جديد' },
  { value: 'sabqiyat', title: 'سبقيات', subtitle: 'مراجعة قريبة' },
  { value: 'murajaah', title: 'مراجعة كبرى' },
]

export const attendanceLabels: Record<string, string> = {
  hadir: 'حاضر',
  mutaakhir: 'متأخر',
  ghaib: 'غائب',
}

export const correctionModeLabels: Record<string, string> = {
  tadaruk: 'تدارك ذاتي',
  tanbih: 'تنبيه',
  talqin: 'تلقين',
}

export const severityLabels: Record<string, string> = {
  khafif: 'خفيف',
  mutawassit: 'متوسط',
  jasim: 'جسيم',
}

export const sessionStatusLabels: Record<string, string> = {
  recording: 'قيد التسجيل',
  completed: 'مكتملة',
  cancelled: 'ملغاة',
}
