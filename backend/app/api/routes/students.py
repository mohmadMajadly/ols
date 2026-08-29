import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_db, require_roles
from app.models.group import Group
from app.models.student import Student
from app.models.user import User, UserRole
from app.schemas.student import StudentCreate, StudentOut, StudentUpdate

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
