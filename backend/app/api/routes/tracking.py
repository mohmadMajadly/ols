"""وسيط التتبع الصوتي الآني (WP9c): كلمات النطاق المتوقعة + WebSocket الترحيل
إلى خدمة `asr`. راجع docs/design/ASR-ARCHITECTURE.md و docs/specs/WP9c-asr-service.md.

مصادقة الـWebSocket تُنفَّذ يدوياً هنا (لا Depends) عمداً: رفض العميل (غير مصرح
له / جلسة غير مرئية / ليست recording) يجب أن يُغلق قبل accept() بوضوح تام
(بدل الاعتماد على ترجمة FastAPI الضمنية لاستثناءات Depends داخل مسارات
الـWebSocket)، فيصل العميل رسالة رفض قابلة للتمييز في الاختبارات (WebSocketDisconnect).
"""

import uuid

import jwt
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi import WebSocket
from sqlalchemy.orm import Session

from app.api.deps import COOKIE_NAME, get_db, require_roles
from app.core import mushaf_data
from app.core.security import decode_access_token
from app.models.session import TasmeeSession
from app.models.user import User, UserRole
from app.schemas.tracking import ExpectedWordOut
from app.services.asr_client import relay_track_session
from app.services.session_access import get_visible_session_or_404

router = APIRouter(tags=["tracking"])

_staff_roles = (UserRole.admin, UserRole.supervisor, UserRole.teacher)

# رمز إغلاق WS مخصص للرفض (سياسة عامة — لا نكشف السبب الدقيق للعميل غير المصرح له)
WS_REJECT_CODE = 4403


def _expected_words_for(session: TasmeeSession) -> list[dict]:
    return mushaf_data.get_words_in_range(
        session.range_start_surah, session.range_start_ayah, session.range_end_surah, session.range_end_ayah
    )


@router.get("/api/sessions/{session_id}/expected-words", response_model=list[ExpectedWordOut])
def get_expected_words(
    session_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*_staff_roles)),
) -> list[ExpectedWordOut]:
    session = get_visible_session_or_404(db, session_id, current_user)
    if session.range_start_surah is None or session.range_end_surah is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="لم يُحدَّد نطاق تسميع لهذه الجلسة")
    return [ExpectedWordOut(**w) for w in _expected_words_for(session)]  # type: ignore[arg-type]


def _authenticate_ws(db: Session, websocket: WebSocket) -> User | None:
    """يحاكي app.api.deps.get_current_user يدوياً (بدل Depends) — يعيد None
    بدل رفع HTTPException لأن السياق هنا websocket قبل accept()."""
    token = websocket.cookies.get(COOKIE_NAME)
    if not token:
        return None
    try:
        payload = decode_access_token(token)
    except jwt.PyJWTError:
        return None
    raw_user_id = payload.get("sub")
    if not raw_user_id:
        return None
    try:
        user_id = uuid.UUID(raw_user_id)
    except ValueError:
        return None
    user = db.get(User, user_id)
    if user is None or not user.is_active:
        return None
    return user


@router.websocket("/api/sessions/{session_id}/track")
async def track_session(
    websocket: WebSocket,
    session_id: uuid.UUID,
    db: Session = Depends(get_db),
) -> None:
    # db عبر Depends(get_db) عمداً (لا SessionLocal() يدوي): يلتزم بنفس آلية
    # override التي تستخدمها الاختبارات لعزل قاعدة بيانات كل اختبار — اتصال
    # منفصل يدوياً لن يرى بيانات معزولة داخل معاملة الاختبار.
    current_user = _authenticate_ws(db, websocket)
    if current_user is None or current_user.role not in _staff_roles:
        await websocket.close(code=WS_REJECT_CODE)
        return

    try:
        session = get_visible_session_or_404(db, session_id, current_user)
    except HTTPException:
        await websocket.close(code=WS_REJECT_CODE)
        return

    if session.status != "recording":
        await websocket.close(code=WS_REJECT_CODE)
        return

    if session.range_start_surah is None or session.range_end_surah is None:
        await websocket.close(code=WS_REJECT_CODE)
        return

    expected_words = _expected_words_for(session)
    if not expected_words:
        await websocket.close(code=WS_REJECT_CODE)
        return

    await websocket.accept()
    await relay_track_session(websocket, expected_words)
