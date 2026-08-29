import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.deps import get_db, require_roles
from app.models.group import Group
from app.models.student import Student
from app.models.user import User, UserRole
from app.schemas.group import GroupCreate, GroupOut, GroupUpdate

router = APIRouter(prefix="/api/groups", tags=["groups"])

_staff_roles = (UserRole.admin, UserRole.supervisor, UserRole.teacher)


def _students_count(db: Session, group_id: uuid.UUID) -> int:
    return db.query(func.count(Student.id)).filter(Student.group_id == group_id).scalar() or 0


def _to_out(db: Session, group: Group) -> GroupOut:
    return GroupOut(
        id=group.id,
        name=group.name,
        description=group.description,
        teacher_id=group.teacher_id,
        is_active=group.is_active,
        created_at=group.created_at,
        students_count=_students_count(db, group.id),
    )


def _get_visible_group_or_404(db: Session, group_id: uuid.UUID, current_user: User) -> Group:
    group = db.get(Group, group_id)
    if group is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="الحلقة غير موجودة")
    if current_user.role == UserRole.teacher and group.teacher_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="الحلقة غير موجودة")
    return group


@router.get("", response_model=list[GroupOut])
def list_groups(
    include_inactive: bool = Query(default=False),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*_staff_roles)),
) -> list[GroupOut]:
    query = db.query(Group)
    if not include_inactive:
        query = query.filter(Group.is_active.is_(True))
    if current_user.role == UserRole.teacher:
        query = query.filter(Group.teacher_id == current_user.id)
    groups = query.order_by(Group.created_at.desc()).all()
    return [_to_out(db, group) for group in groups]


@router.post("", response_model=GroupOut, status_code=status.HTTP_201_CREATED)
def create_group(
    payload: GroupCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.admin, UserRole.supervisor)),
) -> GroupOut:
    existing = db.query(Group).filter(Group.name == payload.name).first()
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="اسم الحلقة مستخدم بالفعل")

    group = Group(
        name=payload.name,
        description=payload.description,
        teacher_id=payload.teacher_id,
        is_active=True,
    )
    db.add(group)
    db.commit()
    db.refresh(group)
    return _to_out(db, group)


@router.get("/{group_id}", response_model=GroupOut)
def get_group(
    group_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*_staff_roles)),
) -> GroupOut:
    group = _get_visible_group_or_404(db, group_id, current_user)
    return _to_out(db, group)


@router.patch("/{group_id}", response_model=GroupOut)
def update_group(
    group_id: uuid.UUID,
    payload: GroupUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.admin, UserRole.supervisor)),
) -> GroupOut:
    group = db.get(Group, group_id)
    if group is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="الحلقة غير موجودة")

    if payload.name is not None:
        duplicate = (
            db.query(Group).filter(Group.name == payload.name, Group.id != group.id).first()
        )
        if duplicate is not None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="اسم الحلقة مستخدم بالفعل")
        group.name = payload.name
    if payload.description is not None:
        group.description = payload.description
    if payload.teacher_id is not None:
        group.teacher_id = payload.teacher_id
    if payload.is_active is not None:
        group.is_active = payload.is_active

    db.commit()
    db.refresh(group)
    return _to_out(db, group)
