"""جسر بين WebSocket العميل (`/api/sessions/{id}/track`) وخدمة `asr` الداخلية.

يمرّر الإطارات الصوتية الثنائية ورسائل التحكم (reset) من العميل إلى asr، ورسائل
الموضع/الحالة عائدة، دون أي منطق تتبّع هنا — القرار كله داخل asr (RecitationTracker).

**الفصل التام (ASR-ARCHITECTURE §2)**: أي خطأ هنا (تعذّر الاتصال بـasr، انقطاعه
أثناء الجلسة، ...) يُغلق اتصال العميل بهدوء فقط — لا يُستثنى لأعلى، ولا يمسّ
مسار التسجيل المقدس إطلاقاً.
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import logging

import websockets
from fastapi import WebSocket
from starlette.websockets import WebSocketDisconnect, WebSocketState

from app.core.config import settings

logger = logging.getLogger(__name__)

# يُستبدل في الاختبارات بدالة وهمية تعيد اتصال asr مزيَّفاً (mock) — بلا تشغيل
# خدمة asr حقيقية ولا نموذج Whisper.
connect_asr = websockets.connect


async def relay_track_session(websocket: WebSocket, expected_words: list[dict]) -> None:
    """يفتح اتصال WS بخدمة asr، يرسل init، ثم يُرحّل الرسائل في الاتجاهين حتى
    ينقطع أي طرف. لا يستثني أي خطأ لأعلى — يُغلق websocket العميل بهدوء دوماً."""
    try:
        async with connect_asr(settings.ASR_URL, max_size=None, ping_interval=20) as asr_ws:
            await asr_ws.send(json.dumps({"type": "init", "expected_words": expected_words}, ensure_ascii=False))
            await _pump(websocket, asr_ws)
    except WebSocketDisconnect:
        pass
    except (OSError, websockets.exceptions.WebSocketException) as exc:
        logger.warning("خدمة asr غير متاحة أو انقطع الاتصال بها: %s", exc)
    except Exception:
        logger.exception("خطأ غير متوقع في جسر التتبع الصوتي — لا يمسّ التسجيل")
    finally:
        if websocket.application_state != WebSocketState.DISCONNECTED:
            with contextlib.suppress(Exception):
                await websocket.close()


async def _pump(websocket: WebSocket, asr_ws) -> None:
    async def client_to_asr() -> None:
        while True:
            message = await websocket.receive()
            if message["type"] == "websocket.disconnect":
                return
            data = message.get("bytes")
            if data is not None:
                await asr_ws.send(data)
                continue
            text = message.get("text")
            if text is not None:
                # رسائل تحكم من العميل (reset) — تُمرَّر كما هي لخدمة asr
                await asr_ws.send(text)

    async def asr_to_client() -> None:
        async for raw in asr_ws:
            text = raw if isinstance(raw, str) else raw.decode("utf-8")
            await websocket.send_text(text)

    tasks = [asyncio.create_task(client_to_asr()), asyncio.create_task(asr_to_client())]
    try:
        done, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
        for task in pending:
            task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await task
        for task in done:
            exc = task.exception()
            if exc is not None and not isinstance(
                exc, (WebSocketDisconnect, websockets.exceptions.ConnectionClosed)
            ):
                raise exc
    finally:
        for task in tasks:
            if not task.done():
                task.cancel()
