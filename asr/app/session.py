"""حالة اتصال تتبّع واحد: ring buffer صوتي + قرار الدورة (فك ترميز → تحديث
المؤشر → رسالة موضع/حالة) — مفصولة تماماً عن نقل FastAPI/WebSocket حتى تُختبر
مباشرة بدالة transcribe وهمية دون تشغيل Whisper إطلاقاً (WP9c-asr-service.md §1).

يستهلك RecitationTracker (alignment.py، كتبه المدير) كما هو دون أي تعديل —
هذا الملف "الغلاف" حوله فقط: ring buffer + قواعد الانهيار الرشيق (ASR-ARCHITECTURE §5).
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Callable, Protocol

import numpy as np

from .alignment import ExpectedWord, RecitationTracker

SAMPLE_RATE = 16_000
BYTES_PER_SAMPLE = 2  # PCM Int16

WINDOW_SECONDS = 7.0  # نافذة فك الترميز المنزلقة (آخر 6-8 ثوانٍ — ASR-ARCHITECTURE §3)
MIN_DECODE_SECONDS = 0.5  # أقل من هذا لا فائدة من فك ترميز (صمت/بداية الجلسة)
MAX_BUFFER_SECONDS = 20.0  # سقف الـring buffer — يُسقط الأقدم عند تجاوزه (§5)

DECODE_INTERVAL_S = 1.0  # فترة الدورة الافتراضية (~1s — ASR-ARCHITECTURE §3)
MAX_DECODE_INTERVAL_S = 4.0  # سقف تكبير الفترة عند تأخر المعالج عن الزمن الحقيقي (§5)
MIN_DECODE_INTERVAL_S = DECODE_INTERVAL_S


class TranscribeFn(Protocol):
    def __call__(self, audio: np.ndarray) -> str: ...


class AudioBuffer:
    """ring buffer بايتات بسيط: يُلحق إطارات PCM، ويُسقط الأقدم صامتاً عند
    تجاوز MAX_BUFFER_SECONDS (قاعدة الانهيار الرشيق — التتبع يتباطأ ولا ينهار)."""

    def __init__(self, max_seconds: float = MAX_BUFFER_SECONDS):
        self._data = bytearray()
        self._max_bytes = int(max_seconds * SAMPLE_RATE * BYTES_PER_SAMPLE)
        self.dropped_bytes = 0

    def __len__(self) -> int:
        return len(self._data)

    def append(self, frame: bytes) -> None:
        self._data.extend(frame)
        overflow = len(self._data) - self._max_bytes
        if overflow > 0:
            del self._data[:overflow]
            self.dropped_bytes += overflow

    def window(self, seconds: float = WINDOW_SECONDS) -> np.ndarray:
        """آخر `seconds` ثانية من الصوت، كـfloat32 أحادي القناة في [-1, 1]."""
        n_bytes = int(seconds * SAMPLE_RATE * BYTES_PER_SAMPLE)
        n_bytes -= n_bytes % BYTES_PER_SAMPLE
        chunk = bytes(self._data[-n_bytes:]) if 0 < n_bytes < len(self._data) else bytes(self._data)
        if not chunk:
            return np.zeros(0, dtype=np.float32)
        arr = np.frombuffer(chunk, dtype=np.int16).astype(np.float32) / 32768.0
        return arr

    def duration_ms(self) -> float:
        return len(self._data) / (SAMPLE_RATE * BYTES_PER_SAMPLE) * 1000.0


@dataclass
class PositionMessage:
    surah: int
    ayah: int
    word: int
    position: int
    confidence: float

    def to_dict(self) -> dict:
        return {
            "type": "position",
            "surah": self.surah,
            "ayah": self.ayah,
            "word": self.word,
            "position": self.position,
            "confidence": self.confidence,
        }


class TrackingConnection:
    """اتصال تتبّع واحد: يجمع الإطارات الواردة، ويشغّل دورة قرار واحدة عند
    الطلب (decode_once) — لا asyncio ولا WebSocket هنا، فقط منطق بحت قابل
    للاختبار المباشر بمُدخل transcribe وهمي."""

    def __init__(
        self,
        expected_words: list[ExpectedWord],
        transcribe: TranscribeFn,
        *,
        decode_interval: float = DECODE_INTERVAL_S,
    ):
        self.tracker = RecitationTracker(expected_words)
        self.buffer = AudioBuffer()
        self.transcribe = transcribe
        self.decode_interval = decode_interval
        self.last_rtf = 0.0
        self.last_hypothesis = ""

    def push_frame(self, frame: bytes) -> None:
        self.buffer.append(frame)

    def reset(self, position: int) -> None:
        self.tracker.reset(position)

    def decode_once(self) -> PositionMessage | None:
        """دورة قرار واحدة: فك ترميز آخر نافذة، تحديث المؤشر، وتعديل فترة
        الدورة ذاتياً حسب زمن الفك (§5: تأخر → تكبير الفترة وإسقاط الأقدم
        [يحدث ضمنياً عبر AudioBuffer]؛ لحاق → إعادة الفترة لأصلها تدريجياً)."""
        audio = self.buffer.window()
        if audio.size < SAMPLE_RATE * MIN_DECODE_SECONDS:
            return None

        t0 = time.monotonic()
        text = self.transcribe(audio)
        elapsed = time.monotonic() - t0
        self.last_hypothesis = text
        self.last_rtf = elapsed / self.decode_interval if self.decode_interval else elapsed

        if elapsed > self.decode_interval:
            self.decode_interval = min(self.decode_interval * 1.5, MAX_DECODE_INTERVAL_S)
        elif self.decode_interval > MIN_DECODE_INTERVAL_S and elapsed < self.decode_interval / 2:
            self.decode_interval = max(MIN_DECODE_INTERVAL_S, self.decode_interval / 1.2)

        update = self.tracker.update(text)
        if not update.advanced or update.current is None:
            return None
        return PositionMessage(
            surah=update.current.surah,
            ayah=update.current.ayah,
            word=update.current.word,
            position=update.position,
            confidence=update.confidence,
        )

    def status_message(self) -> dict:
        return {
            "type": "status",
            "rtf": round(self.last_rtf, 3),
            "queue_ms": round(self.buffer.duration_ms(), 1),
            "decode_interval_s": round(self.decode_interval, 2),
        }


def make_transcribe(model) -> TranscribeFn:
    """يغلّف WhisperModel.transcribe (faster-whisper) بتوقيع TranscribeFn بسيط
    (numpy → نص)، وفق قواعد ASR-ARCHITECTURE §3 (beam=1، بلا انجرار هلوسة،
    VAD بعتبة متساهلة حتى لا يُقطع صوت تلاوة حقيقي خطأً)."""

    def transcribe(audio: np.ndarray) -> str:
        segments, _info = model.transcribe(
            audio,
            language="ar",
            beam_size=1,
            condition_on_previous_text=False,
            vad_filter=True,
            vad_parameters={"threshold": 0.2},
        )
        return " ".join(seg.text for seg in segments)

    return transcribe
