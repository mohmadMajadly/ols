// غلاف React لمحرك التسجيل — يدير دورة حياة RecorderEngine داخل مكوّن
// شاشة الجلسة ويحوّل حالته إلى state قابلة للعرض (بما فيها ساعة تتقدم كل
// ربع ثانية ومستوى الصوت لنبض التسجيل).

import { useCallback, useEffect, useRef, useState } from 'react'

import type { FinalizePayload, RecorderSnapshot } from './recorderEngine'
import { RecorderEngine } from './recorderEngine'

const IDLE_SNAPSHOT: RecorderSnapshot = {
  phase: 'idle',
  pendingUploads: 0,
  fatalError: null,
  uploadStalled: false,
}

export interface StartOptions {
  sessionId: string
  /** رقم الـ segment لهذا البث (0 لجلسة جديدة، الأعلى+1 عند الاستئناف) */
  segment?: number
  /** عدد المقاطع المرفوعة سابقاً — لتقدير ساعة الجلسة عند الاستئناف */
  priorChunks?: number
  /** فهارس المقاطع المرفوعة لكل segment سابق (من GET /api/sessions/active) */
  priorUploaded?: Record<string, number[]>
}

export function useSessionRecorder() {
  const engineRef = useRef<RecorderEngine | null>(null)
  const [snapshot, setSnapshot] = useState<RecorderSnapshot>(IDLE_SNAPSHOT)
  const [level, setLevel] = useState(0)
  const [elapsedMs, setElapsedMs] = useState(0)

  // ساعة العرض — القيمة الحقيقية للملاحظات تُقرأ من getTimestampMs لحظة الضغط
  useEffect(() => {
    if (snapshot.phase !== 'recording') return
    const timer = window.setInterval(() => {
      const engine = engineRef.current
      if (engine) setElapsedMs(engine.getTimestampMs())
    }, 250)
    return () => window.clearInterval(timer)
  }, [snapshot.phase])

  // تفكيك المكوّن أثناء تسجيل جارٍ يترك الجلسة قابلة للاستئناف (لا إلغاء)
  useEffect(() => {
    return () => engineRef.current?.dispose()
  }, [])

  const start = useCallback(async (opts: StartOptions) => {
    if (engineRef.current) engineRef.current.dispose()
    const engine = new RecorderEngine(
      opts.sessionId,
      { segment: opts.segment, priorChunks: opts.priorChunks },
      { onSnapshot: setSnapshot, onLevel: setLevel },
    )
    if (opts.priorUploaded) engine.setPriorSegments(opts.priorUploaded)
    engineRef.current = engine
    setElapsedMs((opts.priorChunks ?? 0) * 5000)
    await engine.start()
  }, [])

  const finalize = useCallback(async (payload: FinalizePayload) => {
    await engineRef.current?.finalize(payload)
  }, [])

  const cancel = useCallback(async () => {
    await engineRef.current?.cancel()
  }, [])

  /** يُستدعى في نفس لحظة ضغط زر الملاحظة — قبل فتح نموذج الكتابة */
  const captureTimestamp = useCallback((): number => {
    return engineRef.current?.getTimestampMs() ?? 0
  }, [])

  return { snapshot, level, elapsedMs, start, finalize, cancel, captureTimestamp }
}
