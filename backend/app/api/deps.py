import uuid
from collections.abc import Generator
from typing import Annotated

import jwt
from fastapi import Cookie, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.security import decode_access_token
from app.db.session import SessionLocal
from app.models.user import User, UserRole

COOKIE_NAME = "ols_session"


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_current_user(
    db: Annotated[Session, Depends(get_db)],
    ols_session: Annotated[str | None, Cookie()] = None,
) -> User:
    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED, detail="غير مصرح بالدخول"
    )
    if not ols_session:
        raise unauthorized

    try:
        payload = decode_access_token(ols_session)
    except jwt.PyJWTError:
        raise unauthorized from None

    raw_user_id = payload.get("sub")
    if not raw_user_id:
        raise unauthorized

    try:
        user_id = uuid.UUID(raw_user_id)
    except ValueError:
        raise unauthorized from None

    user = db.get(User, user_id)
    if user is None or not user.is_active:
        raise unauthorized
    return user


def require_roles(*roles: UserRole):
    def _checker(current_user: Annotated[User, Depends(get_current_user)]) -> User:
        if current_user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="ليست لديك صلاحية للوصول إلى هذا المورد",
            )
        return current_user

    return _checker
