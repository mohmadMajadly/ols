// حلقة النبض الذهبية حول مؤقت الجلسة: نبض بطيء ثابت (تنفس ~2s، مستقل عن الصوت) + حلقة
// داخلية تستجيب فورياً لمستوى الصوت (level من useSessionRecorder، ~10 مرات/ثانية).
// عند تفعيل تقليل الحركة: القطر يثبت (scale=1 دائماً) وتتغير الشفافية فقط.

import { formatDuration } from '../../lib/formatDuration'
import { useReducedMotion } from '../../lib/useReducedMotion'

export function RecordingRing({ elapsedMs, level }: { elapsedMs: number; level: number }) {
  const reduced = useReducedMotion()
  const clampedLevel = Math.min(Math.max(level, 0), 1)
  const scale = reduced ? 1 : 1 + clampedLevel * 0.16
  const opacity = 0.5 + clampedLevel * 0.5

  return (
    <div className="relative flex h-52 w-52 shrink-0 items-center justify-center sm:h-60 sm:w-60">
      {/* الحلقة الخارجية: تنفس بطيء مستقل عن مستوى الصوت */}
      <span
        aria-hidden="true"
        className="absolute inset-0 rounded-full border-2 border-dhahab-bright"
        style={{ animation: 'lazward-breathe 2.2s ease-in-out infinite' }}
      />
      {/* الحلقة الداخلية: تستجيب لمستوى الصوت مباشرة */}
      <span
        aria-hidden="true"
        className="absolute inset-3 rounded-full border-2 border-dhahab-bright transition-[transform,opacity] duration-150 ease-out sm:inset-4"
        style={{ transform: `scale(${scale})`, opacity }}
      />
      <div className="relative flex flex-col items-center gap-2">
        <span className="font-time text-3xl tabular-nums text-nur" role="timer" aria-label="مدة الجلسة">
          {formatDuration(elapsedMs)}
        </span>
        <span className="h-1.5 w-1.5 rounded-full bg-dhahab-bright" aria-hidden="true" />
      </div>
    </div>
  )
}
