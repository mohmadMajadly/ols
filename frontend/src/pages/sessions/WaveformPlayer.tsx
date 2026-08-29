// المشغّل الموجي — التوقيع البصري الأساسي للمنصة في صورته الكاملة (DIRECTION.md §5):
// شكل موجي من مصفوفة recording.waveform، وعليه خرزات ملوّنة بلون فئة كل ملاحظة موقوتة.
// النقر على خرزة يقفز بالصوت إلى (طابعها − 5 ثوانٍ) ويُبلّغ الأب عبر onBeadClick كي يُبرز
// الملاحظة في القائمة. عنصر <audio> مخفي بمصدر same-origin (الكوكي يُرسَل تلقائياً)
// والقفز يعمل لأن الخادم يدعم Range. يُعرَّض seekMs عبر ref كي تقفز صفوف قائمة الملاحظات
// (الطابع الزمني) الصوت مباشرة دون مرور بالخرزة (بلا إزاحة 5 ثوانٍ هناك).

import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react'
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'

import { formatDuration } from '../../lib/formatDuration'
import { IconPause, IconPlay, IconSkipBack, IconSkipForward } from '../../ui/icons'

export interface WaveformBead {
  id: string
  timestampMs: number
  /** توكن لون CSS كسلسلة نصية (var(--chart-*)) */
  color: string
  label: string
}

export interface WaveformPlayerHandle {
  seekMs: (ms: number) => void
}

export interface WaveformPlayerProps {
  sessionId: string
  waveform: number[] | null
  durationMs: number
  beads: WaveformBead[]
  onBeadClick: (noteId: string) => void
}

const SPEEDS = [0.75, 1, 1.25, 1.5]
const BAR_UNIT = 3 // 2px عرض + 1px فجوة
const BAR_WIDTH = 2

export const WaveformPlayer = forwardRef<WaveformPlayerHandle, WaveformPlayerProps>(function WaveformPlayer(
  { sessionId, waveform, durationMs, beads, onBeadClick },
  ref,
) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const svgWrapRef = useRef<HTMLDivElement>(null)
  const [playing, setPlaying] = useState(false)
  const [currentMs, setCurrentMs] = useState(0)
  const [rate, setRate] = useState(1)

  const totalMs = Math.max(durationMs, 1)
  const progress = Math.min(1, Math.max(0, currentMs / totalMs))

  function seekToMs(ms: number) {
    const audio = audioRef.current
    if (!audio) return
    const clamped = Math.min(totalMs / 1000, Math.max(0, ms / 1000))
    audio.currentTime = clamped
    setCurrentMs(clamped * 1000)
  }

  useImperativeHandle(ref, () => ({ seekMs: seekToMs }))

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    function onTimeUpdate() {
      if (audio) setCurrentMs(audio.currentTime * 1000)
    }
    function onPlay() {
      setPlaying(true)
    }
    function onPause() {
      setPlaying(false)
    }
    audio.addEventListener('timeupdate', onTimeUpdate)
    audio.addEventListener('play', onPlay)
    audio.addEventListener('pause', onPause)
    audio.addEventListener('ended', onPause)
    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate)
      audio.removeEventListener('play', onPlay)
      audio.removeEventListener('pause', onPause)
      audio.removeEventListener('ended', onPause)
    }
  }, [])

  function togglePlay() {
    const audio = audioRef.current
    if (!audio) return
    if (audio.paused) audio.play()
    else audio.pause()
  }

  function skip(seconds: number) {
    const audio = audioRef.current
    if (!audio) return
    seekToMs(audio.currentTime * 1000 + seconds * 1000)
  }

  function handleRateChange(next: number) {
    setRate(next)
    if (audioRef.current) audioRef.current.playbackRate = next
  }

  function handleWaveformClick(event: ReactPointerEvent<HTMLDivElement>) {
    const wrap = svgWrapRef.current
    if (!wrap) return
    const rect = wrap.getBoundingClientRect()
    const fraction = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
    seekToMs(fraction * totalMs)
  }

  function handleBeadClick(bead: WaveformBead, event: ReactMouseEvent<HTMLButtonElement>) {
    event.stopPropagation()
    seekToMs(Math.max(0, bead.timestampMs - 5000))
    onBeadClick(bead.id)
  }

  const barCount = waveform?.length ?? 0
  const totalBarWidth = barCount > 0 ? barCount * BAR_UNIT - (BAR_UNIT - BAR_WIDTH) : 100
  const playedBars = barCount > 0 ? Math.round(progress * barCount) : 0

  return (
    <div className="flex flex-col gap-4">
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio ref={audioRef} src={`/api/sessions/${sessionId}/audio`} preload="metadata" data-testid="session-audio" />

      <div
        ref={svgWrapRef}
        className="relative h-16 w-full cursor-pointer select-none"
        dir="ltr"
        onPointerDown={handleWaveformClick}
      >
        {barCount > 0 ? (
          <svg
            viewBox={`0 0 ${totalBarWidth} 100`}
            preserveAspectRatio="none"
            className="block h-full w-full"
            role="img"
            aria-label="الشكل الموجي للتسجيل"
          >
            {waveform!.map((v, i) => {
              const h = Math.max(6, (v / 100) * 96)
              const y = (100 - h) / 2
              return (
                <rect
                  key={i}
                  x={i * BAR_UNIT}
                  y={y}
                  width={BAR_WIDTH}
                  height={h}
                  rx={1}
                  className={i < playedBars ? 'fill-lazward-700' : 'fill-lazward-100'}
                />
              )
            })}
          </svg>
        ) : (
          <div className="flex h-full w-full items-center overflow-hidden rounded-control">
            <div className="h-1 bg-lazward-700" style={{ width: `${progress * 100}%` }} />
            <div className="h-1 flex-1 bg-lazward-100" />
          </div>
        )}

        {/* خط موضع التشغيل — ذهبي رفيع */}
        <div
          className="pointer-events-none absolute inset-y-0 w-px bg-dhahab"
          style={{ insetInlineStart: `${progress * 100}%` }}
          aria-hidden="true"
        />

        {/* الخرزات — دوائر بلون فئة الملاحظة، حلقة بلون السطح */}
        {beads.map((bead) => {
          const pct = Math.min(100, Math.max(0, (bead.timestampMs / totalMs) * 100))
          return (
            <button
              key={bead.id}
              type="button"
              data-testid="waveform-bead"
              data-note-id={bead.id}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => handleBeadClick(bead, e)}
              aria-label={`اقفز إلى ${bead.label} — ${formatDuration(bead.timestampMs)}`}
              className="absolute top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full"
              style={{
                insetInlineStart: `${pct}%`,
                transform: 'translate(-50%, -50%)',
                background: bead.color,
                boxShadow: '0 0 0 2px var(--waraq-raised)',
              }}
            />
          )
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => skip(-5)}
            aria-label="إرجاع 5 ثوانٍ"
            className="flex h-9 w-9 items-center justify-center rounded-full text-hibr-2 hover:bg-lazward-100/50 hover:text-hibr"
          >
            <IconSkipBack className="h-[18px] w-[18px]" />
          </button>
          <button
            type="button"
            onClick={togglePlay}
            data-testid="play-toggle"
            aria-label={playing ? 'إيقاف' : 'تشغيل'}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-lazward-700 text-nur hover:bg-lazward-800"
          >
            {playing ? <IconPause className="h-5 w-5" /> : <IconPlay className="h-5 w-5" />}
          </button>
          <button
            type="button"
            onClick={() => skip(5)}
            aria-label="تقديم 5 ثوانٍ"
            className="flex h-9 w-9 items-center justify-center rounded-full text-hibr-2 hover:bg-lazward-100/50 hover:text-hibr"
          >
            <IconSkipForward className="h-[18px] w-[18px]" />
          </button>
          {/* dir="ltr" إلزامي: بلا هذا يُعيد bidi المتصفح ترتيب الرقمين المفصولين بـ"/"
              بصرياً داخل سياق الصفحة RTL (المدة الكلية تظهر أولاً بدل الحالية) */}
          <span className="font-time text-sm tabular-nums text-hibr" dir="ltr" data-testid="player-time">
            {formatDuration(currentMs)} / {formatDuration(totalMs)}
          </span>
        </div>

        <div className="flex items-center gap-1">
          {SPEEDS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => handleRateChange(s)}
              className={
                'h-7 rounded-control px-2 text-sm font-medium tabular-nums transition-colors duration-150 ' +
                (rate === s ? 'bg-lazward-100 text-lazward-700' : 'text-hibr-2 hover:bg-lazward-100/40')
              }
            >
              {s}×
            </button>
          ))}
        </div>
      </div>
    </div>
  )
})
