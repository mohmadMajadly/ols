"""خادم WebSocket داخلي لخدمة `asr` (منفذ 8090، غير مكشوف للمضيف — شبكة
compose فقط). يستهلك RecitationTracker (alignment.py، كتبه المدير) عبر الغلاف
القابل للاختبار في session.py؛ هذا الملف مسؤول فقط عن نقل FastAPI/WebSocket
وتحميل نموذج faster-whisper. راجع docs/design/ASR-ARCHITECTURE.md §§3-5.
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import logging
import time
from contextlib import asynccontextmanager

import numpy as np
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse

# مستوردة على مستوى الوحدة (لا داخل دالة) عمداً: تسمح للاختبارات بـmonkeypatch
# مباشر (app.main.ensure_model / app.main.WhisperModel) قبل دخول lifespan
# startup، فيُستبدلان بمزيَّفين خفيفين — لا تحميل نموذج حقيقي ولا إنترنت أثناء
# الاختبار (WP9c-asr-service.md §1: "mock للنموذج - لا تشغّل whisper في الاختبار").
from faster_whisper import WhisperModel

from .alignment import ExpectedWord
from .model_setup import ensure_model
from .session import SAMPLE_RATE, WINDOW_SECONDS, TrackingConnection, make_transcribe

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

STATUS_INTERVAL_S = 2.0

_state: dict[str, object] = {"ready": False, "transcribe": None}


async def _load_model() -> None:
    loop = asyncio.get_event_loop()

    def _load():
        model_dir = ensure_model()
        model = WhisperModel(str(model_dir), device="cpu", compute_type="int8")
        transcribe = make_transcribe(model)
        # إحماء (warm-up): أول استدعاء حقيقي لنافذة بحجم WINDOW_SECONDS كاملة
        # يتحمّل كلفة تهيئة تحدث مرة واحدة فقط (تجميع خيوط CTranslate2 وتخصيص
        # ذاكرة الدفعة الكبيرة) — قد تُظهر rtf مرتفعاً مؤقتاً إن وقعت أثناء جلسة
        # حقيقية. نستهلكها هنا صامتة أثناء الإقلاع بدل أول جلسة تتبّع حقيقية.
        t0 = time.monotonic()
        try:
            # نافذة زائفة بحجم WINDOW_SECONDS كاملاً، وبلا vad_filter عمداً هنا
            # (خلافاً للإعداد الحقيقي في make_transcribe) — الهدف تشغيل مسار
            # الاستدلال الكامل على طول النافذة الحقيقي، لا تفويته بتصفية VAD
            # لصوت اصطناعي لا يشبه كلاماً؛ الإحماء يفقد غرضه لولا ذلك.
            n = int(WINDOW_SECONDS * SAMPLE_RATE)
            warmup_audio = 0.05 * np.sin(2 * np.pi * 220 * np.arange(n) / SAMPLE_RATE).astype(np.float32)
            segments, _ = model.transcribe(
                warmup_audio, language="ar", beam_size=1, condition_on_previous_text=False, vad_filter=False
            )
            list(segments)  # المولّد كسول — استهلاكه يُجبر تشغيل الاستدلال الفعلي
        except Exception:
            logger.exception("فشل إحماء نموذج ASR (غير قاتل — سيُحمَّل عند أول اتصال حقيقي)")
        else:
            logger.info("إحماء النموذج اكتمل في %.2f ثانية", time.monotonic() - t0)
        return transcribe

    _state["transcribe"] = await loop.run_in_executor(None, _load)
    _state["ready"] = True
    logger.info("نموذج ASR جاهز")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # يُنتظر هنا فعلياً (لا مهمة خلفية): uvicorn لا يبدأ قبول اتصالات TCP قبل
    # اكتمال lifespan startup — فالمنفذ نفسه لا يستجيب قبل جاهزية النموذج
    # المحوَّل، وهذا بالضبط معنى "الخدمة لا تُعلن جاهزة قبل اكتمال النموذج"
    # (WP9c §1) دون الحاجة لحلقة انتظار داخل كل اتصال.
    await _load_model()
    yield


app = FastAPI(title="OLS ASR tracking service", lifespan=lifespan)


@app.get("/health")
async def health() -> JSONResponse:
    if not _state["ready"]:
        return JSONResponse({"status": "loading"}, status_code=503)
    return JSONResponse({"status": "ok"})


async def _receive_loop(websocket: WebSocket, conn: TrackingConnection) -> None:
    while True:
        message = await websocket.receive()
        if message["type"] == "websocket.disconnect":
            return
        data = message.get("bytes")
        if data is not None:
            conn.push_frame(data)
            continue
        text = message.get("text")
        if text is None:
            continue
        try:
            payload = json.loads(text)
        except json.JSONDecodeError:
            continue
        if payload.get("type") == "reset":
            try:
                conn.reset(int(payload.get("position", -1)))
            except (TypeError, ValueError):
                pass


async def _decode_loop(websocket: WebSocket, conn: TrackingConnection) -> None:
    loop = asyncio.get_event_loop()
    last_status = 0.0
    while True:
        result = await loop.run_in_executor(None, conn.decode_once)
        if result is not None:
            await websocket.send_text(json.dumps(result.to_dict(), ensure_ascii=False))
        now = time.monotonic()
        if now - last_status >= STATUS_INTERVAL_S:
            await websocket.send_text(json.dumps(conn.status_message(), ensure_ascii=False))
            last_status = now
        await asyncio.sleep(conn.decode_interval)


@app.websocket("/")
async def ws_endpoint(websocket: WebSocket) -> None:
    await websocket.accept()

    try:
        raw_init = await websocket.receive_text()
        init_msg = json.loads(raw_init)
    except (WebSocketDisconnect, json.JSONDecodeError, RuntimeError):
        with contextlib.suppress(Exception):
            await websocket.close(code=1002)
        return

    if init_msg.get("type") != "init":
        await websocket.close(code=1002)
        return

    try:
        expected_words = [ExpectedWord(**w) for w in init_msg.get("expected_words", [])]
    except TypeError:
        await websocket.close(code=1002)
        return
    if not expected_words:
        await websocket.close(code=1002)
        return

    transcribe = _state["transcribe"]
    assert transcribe is not None
    conn = TrackingConnection(expected_words, transcribe=transcribe)

    # إشارة جاهزية فورية — تتيح للواجهة إظهار "التتبع نشط" قبل أول تقدّم فعلي
    await websocket.send_text(json.dumps({"type": "status", "state": "ready", "rtf": 0.0, "queue_ms": 0.0}))

    recv_task = asyncio.create_task(_receive_loop(websocket, conn))
    decode_task = asyncio.create_task(_decode_loop(websocket, conn))
    try:
        done, pending = await asyncio.wait({recv_task, decode_task}, return_when=asyncio.FIRST_COMPLETED)
        for task in pending:
            task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await task
        for task in done:
            exc = task.exception()
            if exc is not None and not isinstance(exc, WebSocketDisconnect):
                logger.warning("انتهت حلقة اتصال ASR بخطأ: %s", exc)
    finally:
        with contextlib.suppress(Exception):
            await websocket.close()
