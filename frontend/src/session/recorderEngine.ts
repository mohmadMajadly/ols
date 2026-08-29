// محرك تسجيل جلسة التسميع — قلب التطبيق التقني. كتبه المدير شخصياً.
//
// المسؤوليات:
//   1. فتح الميكروفون وتشغيل MediaRecorder بتقطيع زمني (5 ثوانٍ لكل مقطع).
//   2. رفع المقاطع تباعاً برقم segment/index عبر طابور متسلسل يعيد المحاولة
//      إلى ما لا نهاية مع تراجع أسي — انقطاع الشبكة لا يُفشل الجلسة أبداً.
//   3. ساعة الجلسة: getTimestampMs() تُستدعى لحظة ضغط زر الملاحظة، وتصمد
//      عبر استئناف ما بعد تحديث الصفحة (تقدير المقاطع السابقة × 5 ثوانٍ).
//   4. مقياس مستوى الصوت (RMS) لتغذية نبض التسجيل الذهبي في الواجهة.
//   5. الإنهاء: تصريف الطابور، ثم finalize؛ عند 409 بنقص مقاطع يعاد رفع
//      الناقص من الذاكرة المؤقتة ويُعاد الإنهاء.
//
// قرار متعمد: تُعطَّل معالجات الصوت في المتصفح (إلغاء الصدى/كتم الضجيج/كسب
// تلقائي) — تلاوة القرآن تحتاج أمانة صوتية (الغنن والمدود تتشوه بمعالجات
// الكلام)، وهي أيضاً ما ستحتاجه نماذج التعرف لاحقاً.

const CHUNK_MS = 5000
const MAX_BACKOFF_MS = 15000
const LEVEL_INTERVAL_MS = 50 // 20Hz — يكفي للهالة الصوتية مع تنعيم في طرف الرسم
export const SPECTRUM_BANDS = 28 // نطاقات طيف لوغاريتمية تقريباً لمدى صوت التلاوة

export type RecorderPhase =
  | 'idle'
  | 'acquiring' // انتظار إذن الميكروفون
  | 'recording'
  | 'finalizing' // تصريف الطابور + طلب finalize
  | 'finished'
  | 'cancelled'
  | 'error' // خطأ قاتل (رُفض الميكروفون، فشل الإنهاء نهائياً)

export interface RecorderSnapshot {
  phase: RecorderPhase
  /** عدد المقاطع التي لم تصل للخادم بعد */
  pendingUploads: number
  /** آخر خطأ قاتل — بالعربية، جاهز للعرض */
  fatalError: string | null
  /** هل الرفع متعثر حالياً (يعيد المحاولة)؟ لعرض «انقطع الاتصال — تتم إعادة المحاولة» */
  uploadStalled: boolean
}

export interface FinalizePayload {
  attendance?: string
  grade?: number
  summary?: string
}

interface EngineCallbacks {
  onSnapshot: (s: RecorderSnapshot) => void
  /** مستوى الصوت 0..1 — بمعدل ~20 مرة/ثانية أثناء التسجيل */
  onLevel: (level: number) => void
  /**
   * طيف الترددات 0..1 لكل نطاق (SPECTRUM_BANDS نطاقاً، من ~80Hz إلى ~5kHz)
   * لتغذية «هالة التلاوة» البصرية. المصفوفة يعاد استخدامها بين النداءات —
   * انسخها إن احتجت الاحتفاظ بها.
   */
  onSpectrum?: (bands: Float32Array) => void
}

interface ChunkRef {
  segment: number
  index: number
  blob: Blob
}

/** استئناف: بنية استجابة GET /api/sessions/active (الجزء الذي يهم المحرك) */
export interface ActiveSessionInfo {
  id: string
  uploaded: Record<string, number[]>
}

function pickMimeType(): string | undefined {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
  for (const c of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c)) return c
  }
  return undefined // يترك الاختيار للمتصفح
}

export class RecorderEngine {
  private sessionId: string
  private segment: number
  /** تقدير زمن المقاطع المرفوعة في segments سابقة (استئناف بعد تحديث الصفحة) */
  private priorMs: number
  private callbacks: EngineCallbacks

  private phase: RecorderPhase = 'idle'
  private fatalError: string | null = null
  private uploadStalled = false

  private stream: MediaStream | null = null
  private recorder: MediaRecorder | null = null
  private audioCtx: AudioContext | null = null
  private levelTimer: number | null = null

  private nextIndex = 0
  private queue: ChunkRef[] = []
  private uploading = false
  /** كل ما رُفع يبقى هنا حتى نجاح finalize — لإعادة رفع ما يبلغ الخادم بنقصه */
  private uploadedCache = new Map<string, Blob>()
  private segmentStartTs = 0
  private stopRequested = false
  private drainResolvers: (() => void)[] = []

  private beforeUnload = (e: BeforeUnloadEvent) => {
    if (this.phase === 'recording' || this.queue.length > 0) {
      e.preventDefault()
    }
  }

  constructor(sessionId: string, opts: { segment?: number; priorChunks?: number }, callbacks: EngineCallbacks) {
    this.sessionId = sessionId
    this.segment = opts.segment ?? 0
    this.priorMs = (opts.priorChunks ?? 0) * CHUNK_MS
    this.callbacks = callbacks
  }

  // ---------- الحالة ----------

  private emit() {
    this.callbacks.onSnapshot({
      phase: this.phase,
      pendingUploads: this.queue.length + (this.uploading ? 1 : 0),
      fatalError: this.fatalError,
      uploadStalled: this.uploadStalled,
    })
  }

  private fail(message: string) {
    this.fatalError = message
    this.phase = 'error'
    this.teardownMedia()
    // أيقظ أي منتظر تصريف حتى لا يتجمد finalize إلى الأبد
    this.drainResolvers.forEach((r) => r())
    this.drainResolvers = []
    this.emit()
  }

  /** الطابع الزمني للملاحظة — يُلتقط لحظة الضغط مهما طالت كتابتها بعد ذلك */
  getTimestampMs(): number {
    if (this.phase !== 'recording') return this.priorMs
    return Math.round(this.priorMs + (performance.now() - this.segmentStartTs))
  }

  // ---------- بدء التسجيل ----------

  async start(): Promise<void> {
    if (this.phase !== 'idle') return
    this.phase = 'acquiring'
    this.emit()

    // المتصفحات تمنع الميكروفون كلياً على HTTP غير الآمن (عدا localhost) دون
    // عرض أي طلب إذن — نشخّص الحالة بدقة بدل رسالة عامة مضللة
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      // في الإنتاج (HTTPS) لا يصل التنفيذ هنا أصلاً — رسالة عامة تكفي
      this.fail('تعذر الوصول إلى الميكروفون — تأكد من منح الإذن للموقع ثم أعد المحاولة')
      return
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      })
    } catch (err) {
      const name = err instanceof DOMException ? err.name : ''
      if (name === 'NotAllowedError') {
        this.fail(
          'إذن الميكروفون مرفوض لهذا الموقع — فعّله من إعدادات الموقع في المتصفح (أيقونة القفل بجوار العنوان) ثم أعد المحاولة',
        )
      } else if (name === 'NotFoundError') {
        this.fail('لم يُعثر على ميكروفون في هذا الجهاز')
      } else {
        this.fail('تعذر الوصول إلى الميكروفون — تأكد من منح الإذن للموقع ثم أعد المحاولة')
      }
      return
    }

    const mimeType = pickMimeType()
    try {
      this.recorder = new MediaRecorder(this.stream, mimeType ? { mimeType } : undefined)
    } catch {
      this.fail('المتصفح لا يدعم تسجيل الصوت بالصيغ المطلوبة')
      return
    }

    this.recorder.ondataavailable = (e: BlobEvent) => {
      if (e.data && e.data.size > 0) {
        this.queue.push({ segment: this.segment, index: this.nextIndex++, blob: e.data })
        this.emit()
        void this.pump()
      }
      // آخر حدث بعد stop(): أيقظ منتظري التصريف ليتحقق pump من اكتمال الطابور
      if (this.stopRequested) void this.pump()
    }
    this.recorder.onerror = () => {
      this.fail('حدث خطأ في مسجل الصوت أثناء الجلسة')
    }

    this.setupLevelMeter()
    window.addEventListener('beforeunload', this.beforeUnload)

    this.segmentStartTs = performance.now()
    this.recorder.start(CHUNK_MS)
    this.phase = 'recording'
    this.emit()
  }

  private setupLevelMeter() {
    if (!this.stream) return
    try {
      this.audioCtx = new AudioContext()
      const source = this.audioCtx.createMediaStreamSource(this.stream)
      const analyser = this.audioCtx.createAnalyser()
      analyser.fftSize = 1024
      analyser.smoothingTimeConstant = 0.5
      source.connect(analyser)
      const timeBuf = new Float32Array(analyser.fftSize)
      const freqBuf = new Uint8Array(analyser.frequencyBinCount)
      const bands = new Float32Array(SPECTRUM_BANDS)
      // حدود نطاقات شبه لوغاريتمية فوق مدى صوت التلاوة (~80Hz–5kHz)
      const sampleRate = this.audioCtx.sampleRate
      const binHz = sampleRate / analyser.fftSize
      const loBin = Math.max(1, Math.floor(80 / binHz))
      const hiBin = Math.min(analyser.frequencyBinCount - 1, Math.ceil(5000 / binHz))
      const edges: number[] = []
      for (let b = 0; b <= SPECTRUM_BANDS; b++) {
        edges.push(Math.round(loBin * Math.pow(hiBin / loBin, b / SPECTRUM_BANDS)))
      }

      this.levelTimer = window.setInterval(() => {
        analyser.getFloatTimeDomainData(timeBuf)
        let sum = 0
        for (let i = 0; i < timeBuf.length; i++) sum += timeBuf[i] * timeBuf[i]
        // تكبير الـ RMS لمدى مريح بصرياً (كلام عادي ~0.05 RMS)
        this.callbacks.onLevel(Math.min(1, Math.sqrt(sum / timeBuf.length) * 6))

        if (this.callbacks.onSpectrum) {
          analyser.getByteFrequencyData(freqBuf)
          for (let b = 0; b < SPECTRUM_BANDS; b++) {
            const from = edges[b]
            const to = Math.max(from + 1, edges[b + 1])
            let acc = 0
            for (let i = from; i < to; i++) acc += freqBuf[i]
            bands[b] = acc / ((to - from) * 255)
          }
          this.callbacks.onSpectrum(bands)
        }
      }, LEVEL_INTERVAL_MS)
    } catch {
      // المقياس تحسين بصري فقط — فشله لا يمس التسجيل
    }
  }

  // ---------- طابور الرفع ----------

  private async pump(): Promise<void> {
    if (this.uploading) return
    const item = this.queue[0]
    if (!item) {
      // الطابور فارغ — أبلغ منتظري التصريف إن اكتمل التسجيل
      if (this.stopRequested) {
        this.drainResolvers.forEach((r) => r())
        this.drainResolvers = []
      }
      return
    }
    this.uploading = true
    this.emit()

    let backoff = 1000
    // إعادة محاولات لا نهائية: انقطاع الشبكة يجب ألا يُسقط مقطعاً من تلاوة قرآن
    for (;;) {
      try {
        const res = await fetch(
          `/api/sessions/${this.sessionId}/chunks/${item.index}?segment=${item.segment}`,
          {
            method: 'PUT',
            credentials: 'include',
            headers: { 'Content-Type': 'application/octet-stream' },
            body: item.blob,
          },
        )
        if (res.ok) break
        if (res.status === 401 || res.status === 403 || res.status === 404 || res.status === 409) {
          // أخطاء لا تُحل بالتكرار (جلسة أُغلقت من مكان آخر / صلاحية)
          this.fail('توقف رفع التسجيل: الجلسة لم تعد صالحة على الخادم')
          return
        }
        throw new Error(`http ${res.status}`)
      } catch {
        this.uploadStalled = true
        this.emit()
        await new Promise((r) => setTimeout(r, backoff))
        backoff = Math.min(backoff * 2, MAX_BACKOFF_MS)
        if (this.phase === 'error' || this.phase === 'cancelled') return
      }
    }

    this.uploadStalled = false
    this.uploadedCache.set(`${item.segment}:${item.index}`, item.blob)
    this.queue.shift()
    this.uploading = false
    this.emit()
    void this.pump()
  }

  private waitForDrain(): Promise<void> {
    if (this.queue.length === 0 && !this.uploading) return Promise.resolve()
    return new Promise((resolve) => this.drainResolvers.push(resolve))
  }

  // ---------- الإنهاء والإلغاء ----------

  /** يوقف التسجيل، يصرّف الطابور، ثم يطلب finalize (مع إصلاح ذاتي للنقص 409) */
  async finalize(payload: FinalizePayload): Promise<void> {
    if (this.phase !== 'recording') throw new Error('لا توجد جلسة تسجيل جارية')
    const durationMs = this.getTimestampMs()
    this.phase = 'finalizing'
    this.stopRequested = true
    this.emit()

    // انتظر onstop — المواصفة تضمن أن آخر ondataavailable يسبقه، فلا يضيع
    // المقطع الأخير في سباق زمني مع تصريف الطابور
    await new Promise<void>((resolve) => {
      const rec = this.recorder
      if (!rec || rec.state === 'inactive') return resolve()
      rec.onstop = () => resolve()
      rec.stop()
    })
    this.stopMediaOnly()

    await this.waitForDrain()
    if (this.phase !== 'finalizing') return // فشل قاتل أثناء التصريف

    const segments: Record<string, number> = {}
    for (const key of this.uploadedCache.keys()) {
      const [seg, idx] = key.split(':').map(Number)
      segments[String(seg)] = Math.max(segments[String(seg)] ?? -1, idx)
    }
    // segments سابقة (قبل الاستئناف) يعرفها الخادم من القرص ويطالب بها في
    // الجسم — نضيفها من priorSegments المزودة عند الإنشاء
    for (const [seg, last] of Object.entries(this.priorSegmentsLast)) {
      if (!(seg in segments)) segments[seg] = last
    }

    for (let attempt = 0; attempt < 5; attempt++) {
      let res: Response
      try {
        res = await fetch(`/api/sessions/${this.sessionId}/finalize`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ segments, duration_ms: durationMs, ...payload }),
        })
      } catch {
        // انقطاع شبكة عابر — انتظر وأعد المحاولة
        await new Promise((r) => setTimeout(r, 2000))
        continue
      }
      if (res.ok) {
        this.phase = 'finished'
        this.cleanup()
        this.emit()
        return
      }
      if (res.status >= 500) {
        await new Promise((r) => setTimeout(r, 2000))
        continue
      }
      if (res.status === 409) {
        // الخادم يسمّي الناقص (FastAPI يغلّفه داخل detail) — أعد رفعه من
        // الذاكرة إن كان عندنا ثم أعد الإنهاء
        const body = (await res.json().catch(() => null)) as {
          missing?: Record<string, number[]>
          detail?: { missing?: Record<string, number[]> }
        } | null
        const missing = body?.detail?.missing ?? body?.missing ?? {}
        let recovered = true
        for (const [seg, indices] of Object.entries(missing)) {
          for (const idx of indices) {
            const blob = this.uploadedCache.get(`${seg}:${idx}`)
            if (!blob) {
              recovered = false
              continue
            }
            this.queue.push({ segment: Number(seg), index: idx, blob })
          }
        }
        void this.pump()
        await this.waitForDrain()
        if (recovered) continue
      }
      break
    }
    this.fail('تعذر إنهاء الجلسة على الخادم — التسجيلات المرفوعة محفوظة ويمكن معالجة الجلسة لاحقاً')
  }

  /** segments أقدم من الاستئناف: {"0": lastIndex} — تُحقن بعد الإنشاء عند resume */
  private priorSegmentsLast: Record<string, number> = {}
  setPriorSegments(uploaded: Record<string, number[]>) {
    for (const [seg, indices] of Object.entries(uploaded)) {
      if (Number(seg) === this.segment) continue
      if (indices.length > 0) this.priorSegmentsLast[seg] = Math.max(...indices)
    }
  }

  async cancel(): Promise<void> {
    this.phase = 'cancelled'
    this.stopRequested = true
    this.teardownMedia()
    this.cleanup()
    this.emit()
    await fetch(`/api/sessions/${this.sessionId}/cancel`, {
      method: 'POST',
      credentials: 'include',
    }).catch(() => undefined)
  }

  // ---------- تنظيف ----------

  private stopMediaOnly() {
    if (this.levelTimer !== null) window.clearInterval(this.levelTimer)
    this.levelTimer = null
    this.audioCtx?.close().catch(() => undefined)
    this.audioCtx = null
    this.stream?.getTracks().forEach((t) => t.stop())
    this.stream = null
  }

  private teardownMedia() {
    if (this.recorder && this.recorder.state !== 'inactive') {
      try {
        this.recorder.stop()
      } catch {
        // المسجل قد يكون توقف بالفعل
      }
    }
    this.recorder = null
    this.stopMediaOnly()
  }

  private cleanup() {
    window.removeEventListener('beforeunload', this.beforeUnload)
    this.uploadedCache.clear()
    this.queue = []
  }

  /** للاستدعاء عند تفكيك المكوّن دون إنهاء — يترك الجلسة قابلة للاستئناف */
  dispose() {
    if (this.phase === 'recording') {
      this.recorder?.stop()
    }
    this.teardownMedia()
    window.removeEventListener('beforeunload', this.beforeUnload)
  }
}
