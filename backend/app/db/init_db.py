"""Startup seeding logic: create the initial admin user from environment
variables if no admin user exists yet. Never overwrites an existing admin."""

import logging

from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import hash_password
from app.models.user import User, UserRole

logger = logging.getLogger(__name__)


def seed_admin(db: Session) -> None:
    existing_admin = db.query(User).filter(User.role == UserRole.admin).first()
    if existing_admin is not None:
        return

    if not settings.ADMIN_USERNAME or not settings.ADMIN_PASSWORD:
        logger.warning(
            "تحذير: لم يتم ضبط ADMIN_USERNAME/ADMIN_PASSWORD في متغيرات البيئة، "
            "لذلك لن يتم إنشاء حساب مدير مبدئي."
        )
        return

    admin = User(
        username=settings.ADMIN_USERNAME.strip().lower(),
        password_hash=hash_password(settings.ADMIN_PASSWORD),
        full_name="المدير العام",
        role=UserRole.admin,
        is_active=True,
    )
    db.add(admin)
    db.commit()
    logger.info("تم إنشاء حساب المدير المبدئي باسم المستخدم: %s", admin.username)
