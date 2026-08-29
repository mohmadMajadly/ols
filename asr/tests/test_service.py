"""اختبارات خدمة asr (WP9c): ring buffer/قواعد الإسقاط عند AudioBuffer/
TrackingConnection مباشرة (بلا FastAPI ولا Whisper)، ثم بروتوكول init/frames/
position/status عبر FastAPI TestClient بنموذج مُموَّه بالكامل (mock) — لا
تحميل ولا تشغيل لـWhisper الحقيقي هنا إطلاقاً، ولا إنترنت.

RecitationTracker/normalize (alignment.py، normalize.py) خوارزمية المدير —
تُستهلك هنا كما هي؛ اختباراتها الخاصة في test_alignment.py.
"""

from __future__ import annotations

import json

import numpy as np
import pytest

from app.alignment import ExpectedWord
from app.session import (
    SAMPLE_RATE,
    AudioBuffer,
    MIN_DECODE_SECONDS,
    TrackingConnection,
)


def _silence_frame(seconds: float) -> bytes:
    n = int(seconds * SAMPLE_RATE)
    return np.zeros(n, dtype=np.int16).tobytes()


FATIHA_OPENING = [
    ExpectedWord(surah=1, ayah=1, word=1, text="بِسْمِ"),
    ExpectedWord(surah=1, ayah=1, word=2, text="ٱللَّهِ"),
    ExpectedWord(surah=1, ayah=1, word=3, text="ٱلرَّحْمَٰنِ"),
    ExpectedWord(surah=1, ayah=1, word=4, text="ٱلرَّحِيمِ"),
]


# ---------- AudioBuffer: قواعد الإسقاط (ASR-ARCHITECTURE §5) ----------


def test_audio_buffer_accumulates_frames():
    buf = AudioBuffer()
    buf.append(_silence_frame(0.25))
    buf.append(_silence_frame(0.25))
    assert abs(buf.duration_ms() - 500) < 5
    assert buf.dropped_bytes == 0


def test_audio_buffer_drops_oldest_beyond_cap():
    buf = AudioBuffer(max_seconds=2.0)
    for _ in range(20):  # 20 * 0.25s = 5s من الصوت، أكثر من الحد (2s)
        buf.append(_silence_frame(0.25))
    assert buf.duration_ms() <= 2000 + 1  # لم يتجاوز السقف
    assert buf.dropped_bytes > 0  # أُسقط شيء فعلاً بدل التراكم بلا حدود


def test_audio_buffer_window_returns_only_latest_seconds():
    buf = AudioBuffer()
    # 10 ثوانٍ من الصمت ثم نافذة 3 ثوانٍ فقط
    for _ in range(40):
        buf.append(_silence_frame(0.25))
    window = buf.window(seconds=3.0)
    assert abs(len(window) - 3 * SAMPLE_RATE) <= 1
    assert buf.dropped_bytes == 0  # لم نتجاوز MAX_BUFFER_SECONDS الافتراضي


def test_audio_buffer_window_shorter_than_available_data():
    buf = AudioBuffer()
    buf.append(_silence_frame(0.3))
    window = buf.window(seconds=7.0)
    assert abs(len(window) - int(0.3 * SAMPLE_RATE)) <= 1


# ---------- TrackingConnection: القرار + التكيّف الذاتي لفترة الدورة ----------


def test_decode_once_returns_none_below_min_seconds():
    conn = TrackingConnection(FATIHA_OPENING, transcribe=lambda audio: "بسم الله")
    conn.push_frame(_silence_frame(MIN_DECODE_SECONDS / 2))
    assert conn.decode_once() is None


def test_decode_once_emits_position_on_advance():
    conn = TrackingConnection(FATIHA_OPENING, transcribe=lambda audio: "بسم الله الرحمن الرحيم")
    conn.push_frame(_silence_frame(1.0))
    msg = conn.decode_once()
    assert msg is not None
    assert msg.surah == 1 and msg.ayah == 1
    assert msg.word == 4  # آخر كلمة تطابقت: الرحيم
    assert msg.position == 3
    assert 0 < msg.confidence <= 1
    d = msg.to_dict()
    assert d == {
        "type": "position",
        "surah": 1,
        "ayah": 1,
        "word": 4,
        "position": 3,
        "confidence": msg.confidence,
    }


def test_decode_once_returns_none_when_hypothesis_does_not_advance():
    conn = TrackingConnection(FATIHA_OPENING, transcribe=lambda audio: "كلام غير ذي صلة تماماً")
    conn.push_frame(_silence_frame(1.0))
    assert conn.decode_once() is None


def test_reset_delegates_to_tracker():
    conn = TrackingConnection(FATIHA_OPENING, transcribe=lambda audio: "بسم الله الرحمن الرحيم")
    conn.push_frame(_silence_frame(1.0))
    assert conn.decode_once() is not None
    assert conn.tracker.position == 3
    conn.reset(-1)
    assert conn.tracker.position == -1


def test_decode_interval_grows_when_transcribe_is_slow():
    def slow_transcribe(audio: np.ndarray) -> str:
        import time

        time.sleep(0.05)
        return "لا تطابق"

    conn = TrackingConnection(FATIHA_OPENING, transcribe=slow_transcribe, decode_interval=0.01)
    conn.push_frame(_silence_frame(1.0))
    conn.decode_once()
    assert conn.decode_interval > 0.01  # تأخر المعالج (0.05s > فترة 0.01s) → تكبير الفترة


def test_decode_interval_shrinks_back_toward_default_when_fast():
    conn = TrackingConnection(FATIHA_OPENING, transcribe=lambda audio: "لا تطابق", decode_interval=2.0)
    conn.push_frame(_silence_frame(1.0))
    conn.decode_once()
    assert conn.decode_interval < 2.0  # فك سريع جداً (~0s) → إعادة الفترة تدريجياً لأصلها


def test_status_message_reports_rtf_and_queue():
    conn = TrackingConnection(FATIHA_OPENING, transcribe=lambda audio: "لا تطابق")
    conn.push_frame(_silence_frame(1.0))
    conn.decode_once()
    status = conn.status_message()
    assert status["type"] == "status"
    assert status["rtf"] >= 0
    assert status["queue_ms"] >= 0


# ---------- بروتوكول FastAPI WebSocket (init/frames/position/status) بنموذج مُموَّه ----------


class _FakeSegment:
    def __init__(self, text: str):
        self.text = text


class _FakeWhisperModel:
    """بديل faster_whisper.WhisperModel — يعيد نصاً ثابتاً بصرف النظر عن
    محتوى الصوت الفعلي؛ الهدف اختبار بروتوكول النقل لا دقة النموذج الحقيقي."""

    last_kwargs: dict | None = None

    def __init__(self, *args, **kwargs):
        pass

    def transcribe(self, audio, **kwargs):
        _FakeWhisperModel.last_kwargs = kwargs
        return [_FakeSegment("بسم الله الرحمن الرحيم")], None


@pytest.fixture()
def asr_test_client(monkeypatch, tmp_path):
    import app.main as main_module

    monkeypatch.setattr(main_module, "ensure_model", lambda: tmp_path)
    monkeypatch.setattr(main_module, "WhisperModel", _FakeWhisperModel)

    from fastapi.testclient import TestClient

    with TestClient(main_module.app) as client:
        yield client


def test_health_ok_after_model_ready(asr_test_client):
    resp = asr_test_client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


def test_ws_rejects_non_init_first_message(asr_test_client):
    from starlette.websockets import WebSocketDisconnect

    with asr_test_client.websocket_connect("/") as ws:
        ws.send_text(json.dumps({"type": "reset", "position": 0}))
        with pytest.raises(WebSocketDisconnect) as exc_info:
            ws.receive_text()
        assert exc_info.value.code == 1002


def test_ws_rejects_empty_expected_words(asr_test_client):
    from starlette.websockets import WebSocketDisconnect

    with asr_test_client.websocket_connect("/") as ws:
        ws.send_text(json.dumps({"type": "init", "expected_words": []}))
        with pytest.raises(WebSocketDisconnect) as exc_info:
            ws.receive_text()
        assert exc_info.value.code == 1002


def test_ws_full_protocol_init_frames_and_position(asr_test_client):
    expected = [
        {"surah": w.surah, "ayah": w.ayah, "word": w.word, "text": w.text} for w in FATIHA_OPENING
    ]
    with asr_test_client.websocket_connect("/") as ws:
        ws.send_text(json.dumps({"type": "init", "expected_words": expected}))

        ready = json.loads(ws.receive_text())
        assert ready["type"] == "status"
        assert ready.get("state") == "ready"

        ws.send_bytes(_silence_frame(1.0))

        # نجمع بضع رسائل — التسلسل بين position/status غير محدد بدقة زمنياً،
        # لكن يجب أن تظهر رسالة position واحدة على الأقل (الفرضية المُموَّهة
        # تطابق كل الكلمات الأربع المتوقعة تماماً)
        messages = [json.loads(ws.receive_text()) for _ in range(4)]
        assert any(m["type"] == "position" for m in messages)
        position = next(m for m in messages if m["type"] == "position")
        assert position["surah"] == 1 and position["ayah"] == 1
        assert position["word"] == 4
        assert position["position"] == 3

        for m in messages:
            assert m["type"] in ("position", "status")

    assert _FakeWhisperModel.last_kwargs is not None
    assert _FakeWhisperModel.last_kwargs["language"] == "ar"
    assert _FakeWhisperModel.last_kwargs["beam_size"] == 1
    assert _FakeWhisperModel.last_kwargs["condition_on_previous_text"] is False


def test_ws_reset_control_message_moves_tracker_back(asr_test_client):
    expected = [
        {"surah": w.surah, "ayah": w.ayah, "word": w.word, "text": w.text} for w in FATIHA_OPENING
    ]
    with asr_test_client.websocket_connect("/") as ws:
        ws.send_text(json.dumps({"type": "init", "expected_words": expected}))
        json.loads(ws.receive_text())  # ready

        ws.send_bytes(_silence_frame(1.0))
        messages = [json.loads(ws.receive_text()) for _ in range(4)]
        assert any(m["type"] == "position" for m in messages)

        # إرجاع صريح — رسالة تحكم تُمرَّر لـTrackingConnection.reset دون رد مباشر
        ws.send_text(json.dumps({"type": "reset", "position": -1}))
        # لا استثناء ولا انقطاع بعد رسالة reset صحيحة — الاتصال يبقى حياً
        ws.send_bytes(_silence_frame(1.0))
        another = json.loads(ws.receive_text())
        assert another["type"] in ("position", "status")
