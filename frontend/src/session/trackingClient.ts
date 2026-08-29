// عميل التتبع الصوتي الآني (WP9c): يتفرّع بـAudioWorklet عن نفس MediaStream الذي
// يستخدمه RecorderEngine (عبر micStreamTap.ts — قراءة فقط، لا ميكروفون ثانٍ)،
// يخفّضه إلى 16kHz Int16 أحادي بإطارات ~250ms، ويبثّها عبر WebSocket مصادَق
// إلى /api/sessions/{id}/track (ASR-ARCHITECTURE §2).
//
// **الفصل التام**: أي فشل هنا (تعذّر الصوت، انقطاع WS، رفض الخادم) لا يظهر كخطأ
// جلسة أبداً ولا يمسّ التسجيل — فقط status تتغيّر ('paused'/'stopped') تعرضها
// الواجهة كملاحظة هادئة. انقطاع WS يُعاد الاتصال به صامتاً بتراجع أسي.

export type TrackingStatus = 'connecting' | 'active' | 'paused' | 'stopped'

export interface TrackingPosition {
  surah: number
  ayah: number
  word: number
  position: number
  confidence: number
}

export interface ExpectedWordLite {
  surah: number
  ayah: number
  word: number
}

interface TrackingClientCallbacks {
  onStatusChange: (status: TrackingStatus) => void
  onPosition: (position: TrackingPosition) => void
}

const MAX_RECONNECT_DELAY_MS = 15000

// كود المعالج (AudioWorkletProcessor) كنص خام يُحمَّل عبر Blob URL — يتجنّب أي حاجة
// لملف ثابت منفصل يديره Vite (WP9c: لا اعتماد بناء إضافي). يعمل على AudioContext
// بمعدل عيّنات 16kHz صريح (مدعوم في المتصفحات الحديثة) فيُغنينا عن إعادة العيّنة
// يدوياً — فقط نجمّع 250ms (4000 عيّنة) ونحوّلها لـInt16 قبل البث.
const WORKLET_SOURCE = `
class TrackerCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this._acc = new Float32Array(0)
    this._samplesPerFrame = 4000 // 250ms @ 16kHz
  }
  process(inputs) {
    const channel = inputs[0] && inputs[0][0]
    if (channel && channel.length) {
      const merged = new Float32Array(this._acc.length + channel.length)
      merged.set(this._acc)
      merged.set(channel, this._acc.length)
      this._acc = merged
      while (this._acc.length >= this._samplesPerFrame) {
        const frame = this._acc.subarray(0, this._samplesPerFrame)
        const int16 = new Int16Array(this._samplesPerFrame)
        for (let i = 0; i < this._samplesPerFrame; i++) {
          const s = Math.max(-1, Math.min(1, frame[i]))
          int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff
        }
        this.port.postMessage(int16.buffer, [int16.buffer])
        this._acc = this._acc.subarray(this._samplesPerFrame).slice()
      }
    }
    return true
  }
}
registerProcessor('tracker-capture-processor', TrackerCaptureProcessor)
`

export class TrackingClient {
  private ws: WebSocket | null = null
  private audioCtx: AudioContext | null = null
  private sourceNode: MediaStreamAudioSourceNode | null = null
  private workletNode: AudioWorkletNode | null = null

  private stopped = true
  private reconnectTimer: number | null = null
  private reconnectDelayMs = 1000

  private expectedWords: ExpectedWordLite[] | null = null

  private sessionId: string
  private mediaStream: MediaStream
  private callbacks: TrackingClientCallbacks
  private fetchExpectedWords: () => Promise<ExpectedWordLite[]>

  constructor(
    sessionId: string,
    mediaStream: MediaStream,
    callbacks: TrackingClientCallbacks,
    fetchExpectedWords: () => Promise<ExpectedWordLite[]>,
  ) {
    this.sessionId = sessionId
    this.mediaStream = mediaStream
    this.callbacks = callbacks
    this.fetchExpectedWords = fetchExpectedWords
  }

  async start(): Promise<void> {
    if (!this.stopped) return
    this.stopped = false

    void this.fetchExpectedWords()
      .then((words) => {
        this.expectedWords = words
      })
      .catch(() => {
        // فشل جلب قائمة الكلمات لا يوقف التتبع — فقط ميزة "أرجِع المؤشر إلى هنا" لن تعمل
      })

    try {
      await this.setupAudio()
    } catch {
      this.stopped = true
      this.callbacks.onStatusChange('stopped')
      return
    }

    this.openSocket()
  }

  stop(): void {
    this.stopped = true
    if (this.reconnectTimer != null) {
      window.clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.ws?.close()
    this.ws = null
    this.teardownAudio()
    this.callbacks.onStatusChange('stopped')
  }

  /** يرسل إرجاع المؤشر الصريح إلى كلمة بعينها — للمعلم حين يعيد الطالب (spec §3). */
  resetToWord(target: { surah: number; ayah: number; word: number }): void {
    if (!this.expectedWords) return
    const index = this.expectedWords.findIndex(
      (w) => w.surah === target.surah && w.ayah === target.ayah && w.word === target.word,
    )
    if (index < 0) return
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'reset', position: index }))
    }
  }

  // ---------- الصوت (يبقى حياً طوال مدة التتبع — يُعاد اتصال WS دونه) ----------

  private async setupAudio(): Promise<void> {
    const AudioContextCtor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioContextCtor) throw new Error('AudioContext غير مدعوم')

    const audioCtx = new AudioContextCtor({ sampleRate: 16000 })
    const source = audioCtx.createMediaStreamSource(this.mediaStream)

    const blobUrl = URL.createObjectURL(new Blob([WORKLET_SOURCE], { type: 'application/javascript' }))
    try {
      await audioCtx.audioWorklet.addModule(blobUrl)
    } finally {
      URL.revokeObjectURL(blobUrl)
    }

    const node = new AudioWorkletNode(audioCtx, 'tracker-capture-processor')
    node.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(event.data)
      }
    }
    // لا نوصل node بـdestination عمداً — لا نريد أي صدى صوتي مسموع للمعلم
    source.connect(node)

    this.audioCtx = audioCtx
    this.sourceNode = source
    this.workletNode = node
  }

  private teardownAudio(): void {
    if (this.workletNode) {
      this.workletNode.port.onmessage = null
      this.workletNode.disconnect()
    }
    this.sourceNode?.disconnect()
    this.audioCtx?.close().catch(() => undefined)
    this.workletNode = null
    this.sourceNode = null
    this.audioCtx = null
  }

  // ---------- WebSocket (يُعاد اتصاله بمفرده — الصوت يبقى مستقلاً) ----------

  private openSocket(): void {
    if (this.stopped) return
    this.callbacks.onStatusChange('connecting')

    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = new WebSocket(`${protocol}://${window.location.host}/api/sessions/${this.sessionId}/track`)
    ws.binaryType = 'arraybuffer'
    this.ws = ws

    ws.onopen = () => {
      this.reconnectDelayMs = 1000
    }

    ws.onmessage = (event) => {
      if (typeof event.data !== 'string') return
      let msg: { type?: string; surah?: number; ayah?: number; word?: number; position?: number; confidence?: number }
      try {
        msg = JSON.parse(event.data)
      } catch {
        return
      }
      if (msg.type === 'position') {
        this.callbacks.onStatusChange('active')
        if (
          typeof msg.surah === 'number' &&
          typeof msg.ayah === 'number' &&
          typeof msg.word === 'number' &&
          typeof msg.position === 'number'
        ) {
          this.callbacks.onPosition({
            surah: msg.surah,
            ayah: msg.ayah,
            word: msg.word,
            position: msg.position,
            confidence: msg.confidence ?? 0,
          })
        }
      } else if (msg.type === 'status') {
        this.callbacks.onStatusChange('active')
      }
    }

    ws.onclose = () => {
      if (this.ws === ws) this.ws = null
      if (this.stopped) return
      this.callbacks.onStatusChange('paused')
      this.scheduleReconnect()
    }

    ws.onerror = () => {
      // onclose يُستدعى دوماً بعد onerror للمتصفحات — لا معالجة مضاعفة هنا
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer != null) return
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null
      this.openSocket()
    }, this.reconnectDelayMs)
    this.reconnectDelayMs = Math.min(this.reconnectDelayMs * 2, MAX_RECONNECT_DELAY_MS)
  }
}
