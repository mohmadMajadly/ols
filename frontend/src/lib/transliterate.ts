// اقتراح اسم مستخدم لاتيني من اسم الطالب العربي — تحويل صوتي مبسّط (بلا تشكيل)
// يُستخدم فقط كبداية مقترحة يعدّلها المدير/المشرف عند إنشاء حساب دخول (WP8).

const LETTER_MAP: Record<string, string> = {
  ا: 'a', أ: 'a', إ: 'i', آ: 'a', ب: 'b', ت: 't', ث: 'th', ج: 'j', ح: 'h', خ: 'kh',
  د: 'd', ذ: 'dh', ر: 'r', ز: 'z', س: 's', ش: 'sh', ص: 's', ض: 'd', ط: 't', ظ: 'z',
  ع: 'a', غ: 'gh', ف: 'f', ق: 'q', ك: 'k', ل: 'l', م: 'm', ن: 'n', ه: 'h', و: 'w',
  ي: 'y', ى: 'a', ة: 'h', ئ: 'e', ء: '', ؤ: 'o', ﻻ: 'la',
}

// علامات التشكيل العربية (فتحة/ضمة/كسرة/سكون/شدة/تنوين وحركات قرآنية) — تُحذف قبل
// التحويل، عبر مدى Unicode مكتوب بترميز \u الصريح (بدل الرموز الحرفية) تفادياً لأي
// التباس أو استبدال غير مقصود بين رموز التشكيل المتشابهة بصرياً.
const DIACRITICS_RE = /[\u064B-\u065F\u0670\u06D6-\u06ED]/g

function transliterateWord(word: string): string {
  const stripped = word.replace(DIACRITICS_RE, '')
  return Array.from(stripped)
    .map((ch) => LETTER_MAP[ch] ?? ch)
    .join('')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

/** يقترح اسم مستخدم من أول كلمتين من اسم الطالب (أو "student" إن تعذّر التحويل بالكامل). */
export function suggestUsername(fullName: string): string {
  const words = fullName.trim().split(/\s+/).filter(Boolean)
  const parts = words.map(transliterateWord).filter(Boolean)
  const base = parts.slice(0, 2).join('.')
  return base || 'student'
}

const PASSWORD_CHARSET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789'

/** يولّد كلمة مرور عشوائية سهلة القراءة (بلا أحرف/أرقام متشابهة بصرياً) لتسليمها للطالب. */
export function generatePassword(length = 10): string {
  const bytes = new Uint32Array(length)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (n) => PASSWORD_CHARSET[n % PASSWORD_CHARSET.length]).join('')
}
