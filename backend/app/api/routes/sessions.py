import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.deps import get_db, require_roles
from app.api.routes.students import _get_visible_student_or_404
from app.core.config import settings
from app.core.quran_meta import SURAH_AYAH_COUNTS
from app.models.note import Note
from app.models.recording import Recording
from app.models.session import Attendance, SessionType, TasmeeSession
from app.models.student import Student
from app.models.user import User, UserRole
from app.schemas.note import NoteOut
from app.schemas.session import (
    ActiveSessionOut,
    RecordingOut,
    SessionCreate,
    SessionDetailOut,
    SessionFinalize,
    SessionListItemOut,
    SessionUpdate,
)
from app.services import media_storage
from app.services.session_access import get_visible_session_or_404
from app.services.session_grading import compute_session_suggested_grade, to_decimal_grade

router = APIRouter(tags=["sessions"])

_staff_roles = (UserRole.admin, UserRole.supervisor, UserRole.teacher)

MAX_CHUNK_SIZE = 10 * 1024 * 1024  # 10MB


def _validate_range(
    range_start_surah: int | None,
    range_start_ayah: int | None,
    range_end_surah: int | None,
    range_end_ayah: int | None,
) -> None:
    provided = [range_start_surah, range_start_ayah, range_end_surah, range_end_ayah]
    if all(v is None for v in provided):
        return
    if any(v is None for v in provided):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="يجب تحديد بداية النطاق ونهايته معاً (سورة وآية)"
        )

    for surah, ayah in ((range_start_surah, range_start_ayah), (range_end_surah, range_end_ayah)):
        entry = SURAH_AYAH_COUNTS.get(surah)
        if entry is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"رقم سورة غير صحيح: {surah}")
        if not (1 <= ayah <= int(entry["ayah_count"])):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"رقم الآية غير صحيح لسورة {entry['name']} (الحد الأقصى {entry['ayah_count']})",
            )

    if (range_start_surah, range_start_ayah) > (range_end_surah, range_end_ayah):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="نطاق البداية يجب أن يسبق نطاق النهاية أو يساويه بترتيب المصحف",
        )


def _session_detail(db: Session, session: TasmeeSession) -> SessionDetailOut:
    student = db.get(Student, session.student_id)
    recording = db.query(Recording).filter(Recording.session_id == session.id).first()
    notes = (
        db.query(Note)
        .filter(Note.session_id == session.id)
        .order_by(Note.timestamp_ms.asc().nulls_first())
        .all()
    )
    return SessionDetailOut(
        id=session.id,
        student_id=session.student_id,
        student_name=student.full_name if student else "",
        teacher_id=session.teacher_id,
        session_type=session.session_type,
        status=session.status,
        attendance=session.attendance,
        range_start_surah=session.range_start_surah,
        range_start_ayah=session.range_start_ayah,
        range_end_surah=session.range_end_surah,
        range_end_ayah=session.range_end_ayah,
        grade=float(session.grade) if session.grade is not None else None,
        suggested_grade=float(session.suggested_grade) if session.suggested_grade is not None else None,
        summary=session.summary,
        started_at=session.started_at,
        ended_at=session.ended_at,
        recording=RecordingOut.model_validate(recording) if recording else None,
        notes=[NoteOut.model_validate(n) for n in notes],
    )


async def _read_limited_body(request: Request, limit: int) -> bytes:
    total = 0
    parts: list[bytes] = []
    async for chunk in request.stream():
        total += len(chunk)
        if total > limit:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail="حجم المقطع أكبر من الحد المسموح به (10 ميجابايت)",
            )
        parts.append(chunk)
    return b"".join(parts)


def _parse_range_header(value: str, file_size: int) -> tuple[int, int] | None:
    if not value.startswith("bytes="):
        return None
    range_spec = value[len("bytes="):].split(",")[0].strip()
    start_str, _, end_str = range_spec.partition("-")
    try:
        if start_str == "":
            if end_str == "":
                return None
            suffix_len = int(end_str)
            start = max(file_size - suffix_len, 0)
            end = file_size - 1
        else:
            start = int(start_str)
            end = int(end_str) if end_str != "" else file_size - 1
    except ValueError:
        return None

    if start < 0 or start >= file_size or end < start:
        return None
    end = min(end, file_size - 1)
    return start, end


@router.post("/api/sessions", response_model=SessionDetailOut, status_code=status.HTTP_201_CREATED)
def create_session(
    payload: SessionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*_staff_roles)),
) -> SessionDetailOut:
    student = _get_visible_student_or_404(db, payload.student_id, current_user)
    _validate_range(
        payload.range_start_surah, payload.range_start_ayah, payload.range_end_surah, payload.range_end_ayah
    )

    is_ghaib = payload.attendance == Attendance.ghaib

    if not is_ghaib:
        existing_recording_session = (
            db.query(TasmeeSession)
            .filter(TasmeeSession.teacher_id == current_user.id, TasmeeSession.status == "recording")
            .first()
        )
        if existing_recording_session is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="لديك جلسة تسجيل أخرى قيد التسجيل حالياً، يجب إنهاؤها أو إلغاؤها أولاً",
            )

    session = TasmeeSession(
        student_id=student.id,
        teacher_id=current_user.id,
        session_type=payload.session_type.value,
        attendance=payload.attendance.value,
        range_start_surah=payload.range_start_surah,
        range_start_ayah=payload.range_start_ayah,
        range_end_surah=payload.range_end_surah,
        range_end_ayah=payload.range_end_ayah,
        status="completed" if is_ghaib else "recording",
    )
    if is_ghaib:
        session.ended_at = datetime.now(timezone.utc)
    db.add(session)
    db.flush()

    # الغياب: لا تُنشأ جلسة تسجيل إطلاقاً (لا يوجد صوت لتسجيله) - وهذا
    # أنظف من إنشاء صف recording بحالة failed لا معنى له.
    if not is_ghaib:
        db.add(Recording(session_id=session.id, status="uploading"))

    db.commit()
    db.refresh(session)
    return _session_detail(db, session)


@router.get("/api/sessions/active", response_model=ActiveSessionOut)
def get_active_session(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*_staff_roles)),
) -> ActiveSessionOut:
    session = (
        db.query(TasmeeSession)
        .filter(TasmeeSession.teacher_id == current_user.id, TasmeeSession.status == "recording")
        .order_by(TasmeeSession.started_at.desc())
        .first()
    )
    if session is None:
        return ActiveSessionOut(session=None, uploaded_chunk_indices=[])

    indices = media_storage.list_uploaded_chunk_indices(session.id)
    return ActiveSessionOut(session=_session_detail(db, session), uploaded_chunk_indices=indices)


@router.get("/api/sessions", response_model=list[SessionListItemOut])
def list_sessions(
    student_id: uuid.UUID | None = Query(default=None),
    group_id: uuid.UUID | None = Query(default=None),
    session_type: SessionType | None = Query(default=None),
    from_: datetime | None = Query(default=None, alias="from"),
    to: datetime | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*_staff_roles)),
) -> list[SessionListItemOut]:
    notes_count_subq = (
        db.query(Note.session_id, func.count(Note.id).label("notes_count"))
        .group_by(Note.session_id)
        .subquery()
    )
    query = (
        db.query(TasmeeSession, Student.full_name, func.coalesce(notes_count_subq.c.notes_count, 0))
        .join(Student, Student.id == TasmeeSession.student_id)
        .outerjoin(notes_count_subq, notes_count_subq.c.session_id == TasmeeSession.id)
    )

    if current_user.role == UserRole.teacher:
        query = query.filter(TasmeeSession.teacher_id == current_user.id)
    if student_id is not None:
        query = query.filter(TasmeeSession.student_id == student_id)
    if group_id is not None:
        query = query.filter(Student.group_id == group_id)
    if session_type is not None:
        query = query.filter(TasmeeSession.session_type == session_type.value)
    if from_ is not None:
        query = query.filter(TasmeeSession.started_at >= from_)
    if to is not None:
        query = query.filter(TasmeeSession.started_at <= to)

    rows = query.order_by(TasmeeSession.started_at.desc()).offset(offset).limit(limit).all()

    return [
        SessionListItemOut(
            id=s.id,
            student_id=s.student_id,
            student_name=name,
            teacher_id=s.teacher_id,
            session_type=s.session_type,
            status=s.status,
            attendance=s.attendance,
            range_start_surah=s.range_start_surah,
            range_start_ayah=s.range_start_ayah,
            range_end_surah=s.range_end_surah,
            range_end_ayah=s.range_end_ayah,
            grade=float(s.grade) if s.grade is not None else None,
            suggested_grade=float(s.suggested_grade) if s.suggested_grade is not None else None,
            notes_count=int(count),
            started_at=s.started_at,
            ended_at=s.ended_at,
        )
        for s, name, count in rows
    ]


@router.get("/api/sessions/{session_id}", response_model=SessionDetailOut)
def get_session(
    session_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*_staff_roles)),
) -> SessionDetailOut:
    session = get_visible_session_or_404(db, session_id, current_user)
    return _session_detail(db, session)


@router.put("/api/sessions/{session_id}/chunks/{index}", status_code=status.HTTP_204_NO_CONTENT)
async def upload_chunk(
    session_id: uuid.UUID,
    index: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*_staff_roles)),
) -> Response:
    session = get_visible_session_or_404(db, session_id, current_user)
    if session.status != "recording":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="لا يمكن رفع مقاطع لجلسة ليست قيد التسجيل"
        )
    if index < 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="رقم المقطع غير صحيح")

    body = await _read_limited_body(request, MAX_CHUNK_SIZE)
    media_storage.write_chunk(session_id, index, body)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/api/sessions/{session_id}/finalize", response_model=SessionDetailOut)
def finalize_session(
    session_id: uuid.UUID,
    payload: SessionFinalize,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*_staff_roles)),
) -> SessionDetailOut:
    session = get_visible_session_or_404(db, session_id, current_user)
    if session.status != "recording":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="الجلسة ليست قيد التسجيل")

    uploaded = media_storage.list_uploaded_chunk_indices(session_id)
    missing = media_storage.missing_chunk_indices(uploaded, payload.last_chunk_index)
    if missing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "message": "توجد أجزاء ناقصة من التسجيل، يرجى إعادة رفعها",
                "missing_indices": missing,
            },
        )

    size_bytes = media_storage.merge_chunks(session_id, payload.last_chunk_index)

    recording = db.query(Recording).filter(Recording.session_id == session_id).first()
    if recording is None:
        recording = Recording(session_id=session_id)
        db.add(recording)
    recording.status = "ready"
    recording.duration_ms = payload.duration_ms
    recording.size_bytes = size_bytes
    recording.file_path = media_storage.recording_relative_path(session_id)
    recording.finalized_at = datetime.now(timezone.utc)

    if payload.attendance is not None:
        session.attendance = payload.attendance.value
    if payload.summary is not None:
        session.summary = payload.summary

    suggested = compute_session_suggested_grade(db, session.id)
    session.suggested_grade = suggested
    session.grade = to_decimal_grade(payload.grade) if payload.grade is not None else suggested

    session.status = "completed"
    session.ended_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(session)
    return _session_detail(db, session)


@router.post("/api/sessions/{session_id}/cancel", response_model=SessionDetailOut)
def cancel_session(
    session_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*_staff_roles)),
) -> SessionDetailOut:
    session = get_visible_session_or_404(db, session_id, current_user)
    if session.status != "recording":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="لا يمكن إلغاء جلسة ليست قيد التسجيل")

    media_storage.delete_session_media(session_id)
    recording = db.query(Recording).filter(Recording.session_id == session_id).first()
    if recording is not None:
        recording.status = "failed"

    session.status = "cancelled"
    session.ended_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(session)
    return _session_detail(db, session)


@router.patch("/api/sessions/{session_id}", response_model=SessionDetailOut)
def update_session(
    session_id: uuid.UUID,
    payload: SessionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*_staff_roles)),
) -> SessionDetailOut:
    session = get_visible_session_or_404(db, session_id, current_user)
    if session.status != "completed":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="لا يمكن تعديل الجلسة إلا بعد اكتمالها"
        )

    range_fields_given = any(
        v is not None
        for v in (
            payload.range_start_surah,
            payload.range_start_ayah,
            payload.range_end_surah,
            payload.range_end_ayah,
        )
    )
    if range_fields_given:
        new_start_surah = (
            payload.range_start_surah if payload.range_start_surah is not None else session.range_start_surah
        )
        new_start_ayah = (
            payload.range_start_ayah if payload.range_start_ayah is not None else session.range_start_ayah
        )
        new_end_surah = (
            payload.range_end_surah if payload.range_end_surah is not None else session.range_end_surah
        )
        new_end_ayah = payload.range_end_ayah if payload.range_end_ayah is not None else session.range_end_ayah
        _validate_range(new_start_surah, new_start_ayah, new_end_surah, new_end_ayah)
        session.range_start_surah = new_start_surah
        session.range_start_ayah = new_start_ayah
        session.range_end_surah = new_end_surah
        session.range_end_ayah = new_end_ayah

    if payload.grade is not None:
        session.grade = to_decimal_grade(payload.grade)
    if payload.summary is not None:
        session.summary = payload.summary
    if payload.attendance is not None:
        session.attendance = payload.attendance.value

    db.commit()
    db.refresh(session)
    return _session_detail(db, session)


@router.get("/api/sessions/{session_id}/audio")
def stream_audio(
    session_id: uuid.UUID,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*_staff_roles)),
) -> StreamingResponse:
    session = get_visible_session_or_404(db, session_id, current_user)
    recording = db.query(Recording).filter(Recording.session_id == session_id).first()
    if recording is None or recording.status != "ready" or not recording.file_path:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="التسجيل غير متوفر")

    file_path = Path(settings.MEDIA_ROOT) / recording.file_path
    if not file_path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="ملف التسجيل غير موجود")

    file_size = file_path.stat().st_size
    range_header = request.headers.get("range")

    start, end = 0, file_size - 1
    response_status = status.HTTP_200_OK
    if range_header:
        parsed = _parse_range_header(range_header, file_size)
        if parsed is not None:
            start, end = parsed
            response_status = status.HTTP_206_PARTIAL_CONTENT

    headers = {
        "Accept-Ranges": "bytes",
        "Content-Length": str(end - start + 1),
    }
    if response_status == status.HTTP_206_PARTIAL_CONTENT:
        headers["Content-Range"] = f"bytes {start}-{end}/{file_size}"

    return StreamingResponse(
        media_storage.iter_file_range(file_path, start, end),
        status_code=response_status,
        media_type=recording.mime_type,
        headers=headers,
    )
