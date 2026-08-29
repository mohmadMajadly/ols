import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_db, require_roles
from app.core.quran_meta import SURAH_AYAH_COUNTS
from app.models.note import Note
from app.models.note_taxonomy import NoteCategory, NoteField, NoteSubtype
from app.models.user import User, UserRole
from app.schemas.note import NoteCreate, NoteOut, NoteUpdate
from app.services.session_access import get_visible_session_or_404
from app.services.session_grading import recompute_session_grade

router = APIRouter(tags=["notes"])

_staff_roles = (UserRole.admin, UserRole.supervisor, UserRole.teacher)


def _validate_note_payload(
    db: Session,
    *,
    category_id: uuid.UUID,
    subtype_id: uuid.UUID | None,
    surah: int | None,
    ayah: int | None,
    extra: dict,
) -> None:
    category = db.get(NoteCategory, category_id)
    if category is None or not category.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="فئة الملاحظة غير موجودة أو غير مفعّلة"
        )

    if subtype_id is not None:
        subtype = db.get(NoteSubtype, subtype_id)
        if subtype is None or subtype.category_id != category_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="النوع الفرعي لا يتبع فئة الملاحظة المحددة"
            )

    if surah is not None or ayah is not None:
        if surah is None or ayah is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="يجب تحديد السورة والآية معاً")
        entry = SURAH_AYAH_COUNTS.get(surah)
        if entry is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"رقم سورة غير صحيح: {surah}")
        if not (1 <= ayah <= int(entry["ayah_count"])):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"رقم الآية غير صحيح لسورة {entry['name']} (الحد الأقصى {entry['ayah_count']})",
            )

    if extra:
        active_fields = {f.id: f for f in db.query(NoteField).filter(NoteField.is_active.is_(True)).all()}
        for key, value in extra.items():
            try:
                field_id = uuid.UUID(str(key))
            except ValueError:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST, detail=f"مفتاح حقل غير معروف: {key}"
                ) from None
            field = active_fields.get(field_id)
            if field is None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST, detail=f"مفتاح حقل غير معروف: {key}"
                )
            if field.field_type == "number":
                if not isinstance(value, (int, float)) or isinstance(value, bool):
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"قيمة الحقل '{field.name}' يجب أن تكون رقماً",
                    )
            elif field.field_type == "select":
                options = field.options or []
                if value not in options:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"قيمة الحقل '{field.name}' غير موجودة ضمن الخيارات المتاحة",
                    )
            elif field.field_type == "text":
                if not isinstance(value, str):
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"قيمة الحقل '{field.name}' يجب أن تكون نصاً",
                    )


@router.post("/api/sessions/{session_id}/notes", response_model=NoteOut, status_code=status.HTTP_201_CREATED)
def create_note(
    session_id: uuid.UUID,
    payload: NoteCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*_staff_roles)),
) -> Note:
    session = get_visible_session_or_404(db, session_id, current_user)
    if session.status not in ("recording", "completed"):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="لا يمكن إضافة ملاحظات لهذه الجلسة")

    _validate_note_payload(
        db,
        category_id=payload.category_id,
        subtype_id=payload.subtype_id,
        surah=payload.surah,
        ayah=payload.ayah,
        extra=payload.extra,
    )

    note = Note(
        session_id=session_id,
        timestamp_ms=payload.timestamp_ms,
        category_id=payload.category_id,
        subtype_id=payload.subtype_id,
        severity=payload.severity.value if payload.severity else None,
        correction_mode=payload.correction_mode.value if payload.correction_mode else None,
        surah=payload.surah,
        ayah=payload.ayah,
        text=payload.text,
        extra={str(k): v for k, v in payload.extra.items()},
        created_by=current_user.id,
    )
    db.add(note)

    if session.status == "completed":
        db.flush()
        recompute_session_grade(db, session)

    db.commit()
    db.refresh(note)
    return note


@router.patch("/api/notes/{note_id}", response_model=NoteOut)
def update_note(
    note_id: uuid.UUID,
    payload: NoteUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*_staff_roles)),
) -> Note:
    note = db.get(Note, note_id)
    if note is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="الملاحظة غير موجودة")
    session = get_visible_session_or_404(db, note.session_id, current_user)
    if current_user.role == UserRole.teacher and note.created_by != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="لا يمكنك تعديل ملاحظة لم تنشئها")

    new_category_id = payload.category_id if payload.category_id is not None else note.category_id
    new_subtype_id = payload.subtype_id if payload.subtype_id is not None else note.subtype_id
    new_surah = payload.surah if payload.surah is not None else note.surah
    new_ayah = payload.ayah if payload.ayah is not None else note.ayah
    new_extra = payload.extra if payload.extra is not None else note.extra

    _validate_note_payload(
        db,
        category_id=new_category_id,
        subtype_id=new_subtype_id,
        surah=new_surah,
        ayah=new_ayah,
        extra=new_extra,
    )

    if payload.timestamp_ms is not None:
        note.timestamp_ms = payload.timestamp_ms
    note.category_id = new_category_id
    note.subtype_id = new_subtype_id
    if payload.severity is not None:
        note.severity = payload.severity.value
    if payload.correction_mode is not None:
        note.correction_mode = payload.correction_mode.value
    note.surah = new_surah
    note.ayah = new_ayah
    if payload.text is not None:
        note.text = payload.text
    if payload.extra is not None:
        note.extra = {str(k): v for k, v in payload.extra.items()}

    if session.status == "completed":
        db.flush()
        recompute_session_grade(db, session)

    db.commit()
    db.refresh(note)
    return note


@router.delete("/api/notes/{note_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_note(
    note_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*_staff_roles)),
) -> None:
    note = db.get(Note, note_id)
    if note is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="الملاحظة غير موجودة")
    session = get_visible_session_or_404(db, note.session_id, current_user)
    if current_user.role == UserRole.teacher and note.created_by != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="لا يمكنك حذف ملاحظة لم تنشئها")

    db.delete(note)

    if session.status == "completed":
        db.flush()
        recompute_session_grade(db, session)

    db.commit()
    return None
