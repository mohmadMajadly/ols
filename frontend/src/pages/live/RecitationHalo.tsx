// هالة التلاوة — كتبها المدير شخصياً. القطعة البصرية المركزية لعالم اللازورد.
//
// إكليل من 56 شعاعاً ذهبياً دقيقاً حول المؤقت، بتماثل «الشمسة» الزخرفية في
// المصاحف: كل شعاعين متقابلين يتغذيان من نفس نطاق الطيف الترددي لصوت الطالب
// (28 نطاقاً من المحرك)، بهجوم سريع وخفوت مخملي بطيء، مع توهج نور خافت خلف
// المؤقت يتنفس مع قوة الصوت. في الصمت تسكن الأشعة إلى عقد مسبحة هادئ.
//
// قرارات ملزمة من DIRECTION.md: الذهب هنا في موضعه المشروع الوحيد (نبض
// التسجيل)؛ الألوان تُقرأ من التوكنز لا من ثوابت؛ prefers-reduced-motion
// يجمّد الحركة (رسم ساكن + شفافية فقط). الرسم Canvas بمعدل الشاشة —
// أرخص بكثير من 56 عنصر DOM متحركاً، ويترك الـ CPU لخدمة التعرف لاحقاً.

import { useEffect, useRef } from 'react'

import { formatDuration } from '../../lib/formatDuration'
import { useReducedMotion } from '../../lib/useReducedMotion'

const RAYS = 56
const INNER_RADIUS_RATIO = 0.58 // نصف قطر قاعدة الأشعة نسبةً لنصف حجم اللوحة
const MAX_RAY_RATIO = 0.32 // أقصى امتداد للشعاع — سخي لحظة قوة الصوت
const IDLE_RAY_PX = 3 // «خرزة» السكون
const ATTACK = 0.5 // سرعة الاستجابة للصعود
const DECAY = 0.075 // نعومة الخفوت

interface RecitationHaloProps {
  elapsedMs: number
  level: number
  /** مصفوفة الطيف من useSessionRecorder — تُقرأ في المكان كل إطار */
  spectrumRef: React.RefObject<Float32Array>
}

function readToken(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v || fallback
}

export function RecitationHalo({ elapsedMs, level, spectrumRef }: RecitationHaloProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const levelRef = useRef(0)
  const reduced = useReducedMotion()
  levelRef.current = Math.min(Math.max(level, 0), 1)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dhahab = readToken('--dhahab', 'rgb(176 138 62)')
    const dhahabBright = readToken('--dhahab-bright', 'rgb(212 175 94)')
    const dpr = Math.min(window.devicePixelRatio || 1, 2)

    // امتدادات الأشعة الحالية (حالة التنعيم بين الإطارات)
    const state = new Float32Array(RAYS)
    let glow = 0
    let raf = 0
    let disposed = false

    function draw() {
      if (disposed || !canvas || !ctx) return
      const cssSize = canvas.clientWidth
      const size = Math.round(cssSize * dpr)
      if (canvas.width !== size) {
        canvas.width = size
        canvas.height = size
      }
      const half = size / 2
      const inner = half * INNER_RADIUS_RATIO
      const maxRay = half * MAX_RAY_RATIO
      const spectrum = spectrumRef.current

      // تنعيم لكل شعاع: الشعاع i وقرينه المقابل يتقاسمان نطاق |i مطوياً|
      for (let i = 0; i < RAYS; i++) {
        const band = spectrum ? spectrum[Math.min(i, RAYS - 1 - i)] ?? 0 : 0
        const target = reduced ? 0 : Math.pow(Math.min(band * 1.35, 1), 1.4)
        const k = target > state[i] ? ATTACK : DECAY
        state[i] += (target - state[i]) * k
      }
      const lv = levelRef.current
      glow += ((reduced ? lv * 0.5 : lv) - glow) * 0.12

      ctx.clearRect(0, 0, size, size)

      // توهج النور خلف المؤقت — يتنفس مع قوة الصوت
      const g = ctx.createRadialGradient(half, half, inner * 0.15, half, half, inner * 0.95)
      const glowAlpha = 0.05 + glow * 0.2
      g.addColorStop(0, colorWithAlpha(dhahabBright, glowAlpha))
      g.addColorStop(1, colorWithAlpha(dhahabBright, 0))
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(half, half, inner * 0.95, 0, Math.PI * 2)
      ctx.fill()

      // الأشعة — من قاعدة ثابتة نحو الخارج، أطرافها مستديرة
      ctx.lineCap = 'round'
      for (let i = 0; i < RAYS; i++) {
        const angle = (i / RAYS) * Math.PI * 2 - Math.PI / 2
        const len = IDLE_RAY_PX * dpr + state[i] * maxRay
        const x0 = half + Math.cos(angle) * inner
        const y0 = half + Math.sin(angle) * inner
        const x1 = half + Math.cos(angle) * (inner + len)
        const y1 = half + Math.sin(angle) * (inner + len)
        const heat = state[i]
        ctx.strokeStyle = heat > 0.45 ? dhahabBright : dhahab
        ctx.globalAlpha = 0.45 + heat * 0.55
        ctx.lineWidth = (1.6 + heat * 1.2) * dpr
        ctx.beginPath()
        ctx.moveTo(x0, y0)
        ctx.lineTo(x1, y1)
        ctx.stroke()
      }
      ctx.globalAlpha = 1

      if (!reduced) raf = requestAnimationFrame(draw)
    }

    if (reduced) {
      // رسم ساكن واحد + تحديث هادئ للتوهج فقط (كل 200ms، بلا حركة أشعة)
      draw()
      const t = window.setInterval(draw, 200)
      return () => {
        disposed = true
        window.clearInterval(t)
      }
    }
    raf = requestAnimationFrame(draw)
    return () => {
      disposed = true
      cancelAnimationFrame(raf)
    }
  }, [reduced, spectrumRef])

  return (
    <div className="relative flex h-60 w-60 shrink-0 items-center justify-center sm:h-72 sm:w-72">
      {/* التنفس الخارجي البطيء — ثابت العهد من الهوية الأولى */}
      <span
        aria-hidden="true"
        className="absolute inset-1 rounded-full border border-dhahab-bright/50"
        style={{ animation: 'lazward-breathe 2.2s ease-in-out infinite' }}
      />
      <canvas ref={canvasRef} aria-hidden="true" className="absolute inset-0 h-full w-full" />
      <div className="relative flex flex-col items-center gap-2">
        <span className="font-time text-3xl tabular-nums text-nur" role="timer" aria-label="مدة الجلسة">
          {formatDuration(elapsedMs)}
        </span>
        <span className="h-1.5 w-1.5 rounded-full bg-dhahab-bright" aria-hidden="true" />
      </div>
    </div>
  )
}

/** يحوّل لون توكن (hex أو rgb) إلى صيغة rgba بشفافية معطاة */
function colorWithAlpha(color: string, alpha: number): string {
  if (color.startsWith('#')) {
    const r = parseInt(color.slice(1, 3), 16)
    const g = parseInt(color.slice(3, 5), 16)
    const b = parseInt(color.slice(5, 7), 16)
    return `rgb(${r} ${g} ${b} / ${alpha})`
  }
  const m = color.match(/(\d+)\s+(\d+)\s+(\d+)|(\d+),\s*(\d+),\s*(\d+)/)
  if (m) {
    const [r, g, b] = m[1] ? [m[1], m[2], m[3]] : [m[4], m[5], m[6]]
    return `rgb(${r} ${g} ${b} / ${alpha})`
  }
  return color
}
