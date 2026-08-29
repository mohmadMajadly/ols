import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import case, func, or_
from sqlalchemy.orm import Session

from app.api.deps import get_db, require_roles
from app.core.quran_meta import SURAH_AYAH_COUNTS
from app.models.group import Group
from app.models.note import Note
from app.models.note_taxonomy import NoteCategory, NoteSubtype
from app.models.recording import Recording
from app.models.session import SessionType, TasmeeSession
from app.models.student import Student
from app.models.user import User, UserRole
from app.schemas.stats import (
    CategoryCountOut,
    GradeTrendPointOut,
    RepeatedMistakeOut,
    StudentStatsOut,
    StudentTotalsOut,
    SubtypeCountOut,
)
from app.schemas.student import StudentCreate, StudentOut, StudentUpdate
from app.services.grading import DEDUCTION_BUCKETS

router = APIRouter(prefix="/api/students", tags=["students"])

_staff_roles = (UserRole.admin, UserRole.supervisor, UserRole.teacher)


def _teacher_group_ids(db: Session, teacher_id: uuid.UUID) -> list[uuid.UUID]:
    return [row[0] for row in db.query(Group.id).filter(Group.teacher_id == teacher_id).all()]


def _assert_teacher_owns_group(db: Session, current_user: User, group_id: uuid.UUID | None) -> None:
    """يمنع المعلم من إضافة/نقل طالب إلى حلقة ليست له."""
    if current_user.role != UserRole.teacher or group_id is None:
        return
    group = db.get(Group, group_id)
    if group is None or group.teacher_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="لا يمكنك إضافة طالب لحلقة ليست لك"
        )


def _get_visible_student_or_404(db: Session, student_id: uuid.UUID, current_user: User) -> Student:
    student = db.get(Student, student_id)
    if student is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="الطالب غير موجود")
    if current_user.role == UserRole.teacher:
        teacher_group_ids = _teacher_group_ids(db, current_user.id)
        if student.group_id is None or student.group_id not in teacher_group_ids:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="الطالب غير موجود")
    return student


@router.get("", response_model=list[StudentOut])
def list_students(
    group_id: uuid.UUID | None = Query(default=None),
    q: str | None = Query(default=None),
    include_inactive: bool = Query(default=False),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*_staff_roles)),
) -> list[Student]:
    query = db.query(Student)
    if not include_inactive:
        query = query.filter(Student.is_active.is_(True))
    if current_user.role == UserRole.teacher:
        query = query.filter(Student.group_id.in_(_teacher_group_ids(db, current_user.id)))
    if group_id is not None:
        query = query.filter(Student.group_id == group_id)
    if q:
        query = query.filter(Student.full_name.ilike(f"%{q}%"))
    return query.order_by(Student.full_name).all()


@router.post("", response_model=StudentOut, status_code=status.HTTP_201_CREATED)
def create_student(
    payload: StudentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*_staff_roles)),
) -> Student:
    if payload.group_id is not None:
        group = db.get(Group, payload.group_id)
        if group is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="الحلقة غير موجودة")
    _assert_teacher_owns_group(db, current_user, payload.group_id)

    student = Student(
        full_name=payload.full_name,
        group_id=payload.group_id,
        phone=payload.phone,
        guardian_phone=payload.guardian_phone,
        birth_year=payload.birth_year,
        memorization_note=payload.memorization_note,
        is_active=True,
    )
    db.add(student)
    db.commit()
    db.refresh(student)
    return student


@router.get("/{student_id}", response_model=StudentOut)
def get_student(
    student_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*_staff_roles)),
) -> Student:
    return _get_visible_student_or_404(db, student_id, current_user)


@router.patch("/{student_id}", response_model=StudentOut)
def update_student(
    student_id: uuid.UUID,
    payload: StudentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*_staff_roles)),
) -> Student:
    student = _get_visible_student_or_404(db, student_id, current_user)

    if payload.group_id is not None and payload.group_id != student.group_id:
        new_group = db.get(Group, payload.group_id)
        if new_group is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="الحلقة غير موجودة")
        _assert_teacher_owns_group(db, current_user, payload.group_id)
        student.group_id = payload.group_id

    if payload.full_name is not None:
        student.full_name = payload.full_name
    if payload.phone is not None:
        student.phone = payload.phone
    if payload.guardian_phone is not None:
        student.guardian_phone = payload.guardian_phone
    if payload.birth_year is not None:
        student.birth_year = payload.birth_year
    if payload.memorization_note is not None:
        student.memorization_note = payload.memorization_note
    if payload.is_active is not None:
        student.is_active = payload.is_active

    db.commit()
    db.refresh(student)
    return student


@router.get("/{student_id}/stats", response_model=StudentStatsOut)
def get_student_stats(
    student_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*_staff_roles)),
) -> StudentStatsOut:
    """إحصائيات طالب واحد. الجلسات المحسوبة completed فقط في كل الحقول
    (بما فيها جلسات الغياب، التي تُنشأ completed مباشرة) ما لم يُذكر غير ذلك."""
    _get_visible_student_or_404(db, student_id, current_user)

    completed = (TasmeeSession.student_id == student_id, TasmeeSession.status == "completed")

    sessions_count, avg_grade, attended_count = (
        db.query(
            func.count(TasmeeSession.id),
            func.avg(TasmeeSession.grade),
            func.sum(case((TasmeeSession.attendance.in_(["hadir", "mutaakhir"]), 1), else_=0)),
        )
        .filter(*completed)
        .one()
    )
    sessions_count = int(sessions_count or 0)
    attended_count = int(attended_count or 0)

    notes_count = (
        db.query(func.count(Note.id))
        .join(TasmeeSession, TasmeeSession.id == Note.session_id)
        .filter(*completed)
        .scalar()
        or 0
    )

    total_recorded_ms = (
        db.query(func.coalesce(func.sum(Recording.duration_ms), 0))
        .join(TasmeeSession, TasmeeSession.id == Recording.session_id)
        .filter(*completed)
        .scalar()
        or 0
    )

    totals = StudentTotalsOut(
        sessions=sessions_count,
        notes=int(notes_count),
        total_recorded_ms=int(total_recorded_ms),
        avg_grade=round(float(avg_grade), 2) if avg_grade is not None else None,
        attendance_rate=round(attended_count / sessions_count * 100, 2) if sessions_count else None,
    )

    recent_graded = (
        db.query(TasmeeSession)
        .filter(*completed, TasmeeSession.grade.isnot(None))
        .order_by(TasmeeSession.started_at.desc())
        .limit(20)
        .all()
    )
    grades_trend = [
        GradeTrendPointOut(
            session_id=s.id, date=s.started_at, grade=float(s.grade), session_type=s.session_type
        )
        for s in reversed(recent_graded)
    ]

    category_rows = (
        db.query(NoteCategory.id, NoteCategory.name, NoteCategory.color, func.count(Note.id))
        .join(Note, Note.category_id == NoteCategory.id)
        .join(TasmeeSession, TasmeeSession.id == Note.session_id)
        .filter(*completed)
        .group_by(NoteCategory.id, NoteCategory.name, NoteCategory.color)
        .order_by(func.count(Note.id).desc())
        .all()
    )
    errors_by_category = [
        CategoryCountOut(category_id=r[0], name=r[1], color=r[2], count=r[3]) for r in category_rows
    ]

    subtype_rows = (
        db.query(
            NoteSubtype.id, NoteSubtype.name, NoteCategory.name, NoteCategory.color, func.count(Note.id)
        )
        .join(Note, Note.subtype_id == NoteSubtype.id)
        .join(NoteCategory, NoteCategory.id == NoteSubtype.category_id)
        .join(TasmeeSession, TasmeeSession.id == Note.session_id)
        .filter(*completed)
        .group_by(NoteSubtype.id, NoteSubtype.name, NoteCategory.name, NoteCategory.color)
        .order_by(func.count(Note.id).desc())
        .limit(10)
        .all()
    )
    top_subtypes = [
        SubtypeCountOut(subtype_id=r[0], name=r[1], category_name=r[2], color=r[3], count=r[4])
        for r in subtype_rows
    ]

    type_rows = (
        db.query(TasmeeSession.session_type, func.count(TasmeeSession.id))
        .filter(*completed)
        .group_by(TasmeeSession.session_type)
        .all()
    )
    sessions_by_type: dict[str, int] = {t.value: 0 for t in SessionType}
    for session_type, count in type_rows:
        sessions_by_type[session_type] = int(count)

    mistake_rows = (
        db.query(
            Note.surah,
            Note.ayah,
            func.count(Note.id),
            func.array_agg(func.distinct(NoteCategory.name)),
        )
        .join(NoteCategory, NoteCategory.id == Note.category_id)
        .join(TasmeeSession, TasmeeSession.id == Note.session_id)
        .filter(
            *completed,
            Note.surah.isnot(None),
            Note.ayah.isnot(None),
            NoteCategory.color.in_(DEDUCTION_BUCKETS),
        )
        .group_by(Note.surah, Note.ayah)
        .having(or_(func.count(func.distinct(Note.session_id)) >= 2, func.count(Note.id) >= 3))
        .order_by(func.count(Note.id).desc())
        .limit(20)
        .all()
    )
    repeated_mistakes = [
        RepeatedMistakeOut(
            surah=surah,
            surah_name=SURAH_AYAH_COUNTS.get(surah, {}).get("name", ""),
            ayah=ayah,
            count=int(count),
            categories=list(categories),
        )
        for surah, ayah, count, categories in mistake_rows
    ]

    return StudentStatsOut(
        totals=totals,
        grades_trend=grades_trend,
        errors_by_category=errors_by_category,
        top_subtypes=top_subtypes,
        sessions_by_type=sessions_by_type,
        repeated_mistakes=repeated_mistakes,
    )
