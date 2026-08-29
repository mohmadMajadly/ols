import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_db, require_roles
from app.core.security import hash_password
from app.models.user import User, UserRole
from app.schemas.user import UserCreate, UserOut, UserUpdate

router = APIRouter(prefix="/api/users", tags=["users"])


def _active_admin_count(db: Session, *, exclude_id: uuid.UUID | None = None) -> int:
    query = db.query(User).filter(User.role == UserRole.admin, User.is_active.is_(True))
    if exclude_id is not None:
        query = query.filter(User.id != exclude_id)
    return query.count()


@router.get("", response_model=list[UserOut])
def list_users(
    role: UserRole | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.admin, UserRole.supervisor)),
) -> list[User]:
    query = db.query(User)
    if role is not None:
        query = query.filter(User.role == role)
    return query.order_by(User.created_at.desc()).all()


@router.post("", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_user(
    payload: UserCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.admin)),
) -> User:
    username = payload.username.strip().lower()
    existing = db.query(User).filter(User.username == username).first()
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="اسم المستخدم مستخدم بالفعل")

    user = User(
        username=username,
        password_hash=hash_password(payload.password),
        full_name=payload.full_name,
        role=payload.role,
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.patch("/{user_id}", response_model=UserOut)
def update_user(
    user_id: uuid.UUID,
    payload: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.admin)),
) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="المستخدم غير موجود")

    is_last_active_admin = (
        user.role == UserRole.admin
        and user.is_active
        and _active_admin_count(db, exclude_id=user.id) == 0
    )
    would_deactivate = payload.is_active is False
    would_change_role_away_from_admin = payload.role is not None and payload.role != UserRole.admin
    if is_last_active_admin and (would_deactivate or would_change_role_away_from_admin):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="لا يمكن تعطيل آخر مدير نشط في النظام أو تغيير دوره",
        )

    if payload.full_name is not None:
        user.full_name = payload.full_name
    if payload.role is not None:
        user.role = payload.role
    if payload.is_active is not None:
        user.is_active = payload.is_active
    if payload.password:
        user.password_hash = hash_password(payload.password)

    db.commit()
    db.refresh(user)
    return user
