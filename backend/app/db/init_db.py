"""Startup seeding logic: create the initial admin user from environment
variables if no admin user exists yet. Never overwrites an existing admin.

Also seeds the system note-taxonomy tree and the default rubric settings.
Both seeds are idempotent: they only insert what is missing on first boot
and never touch rows that already exist, so user edits (renames,
deactivation, ...) survive across restarts.
"""

import logging

from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import hash_password
from app.models.note_taxonomy import NoteCategory, NoteSubtype
from app.models.rubric import DEFAULT_RUBRIC_DEDUCTIONS, DEFAULT_RUBRIC_WEIGHTS, RubricSettings
from app.models.user import User, UserRole

logger = logging.getLogger(__name__)

# بذرة شجرة تصنيفات الملاحظات النظامية. التمييز بـ key فقط: إن وُجدت الفئة
# بهذا المفتاح لا تُلمس إطلاقاً (لا اسمها ولا أنواعها الفرعية) حتى لو عدّلها
# المستخدم أو حذف بعض أنواعها الفرعية.
NOTE_TAXONOMY_SEED: list[dict] = [
    {
        "key": "hifz",
        "name": "أخطاء الحفظ",
        "color": "hifz",
        "sort_order": 1,
        "subtypes": [
            "إبدال حرف",
            "إبدال حركة",
            "إبدال كلمة",
            "زيادة حرف/كلمة",
            "نقص حرف/كلمة",
            "تقديم وتأخير",
            "تردد وتلعثم",
            "نسيان آية",
            "خلط بالمتشابهات",
        ],
    },
    {
        "key": "tajwid",
        "name": "أخطاء التجويد",
        "color": "tajwid",
        "sort_order": 2,
        "subtypes": [
            "المدود",
            "الغنة",
            "المخارج والصفات",
            "التفخيم والترقيق",
            "القلقلة",
            "أحكام النون الساكنة والتنوين",
            "أحكام الميم الساكنة",
        ],
    },
    {
        "key": "dabt",
        "name": "الضبط والتشكيل",
        "color": "dabt",
        "sort_order": 3,
        "subtypes": ["تحريك ساكن", "تسكين متحرك", "خطأ حركة إعرابية"],
    },
    {
        "key": "waqf",
        "name": "الوقف والابتداء",
        "color": "waqf",
        "sort_order": 4,
        "subtypes": ["وقف قبيح", "ابتداء غير صحيح", "تجاوز وقف لازم"],
    },
    {
        "key": "itqan",
        "name": "إتقان",
        "color": "sahih",
        "sort_order": 5,
        "subtypes": ["أداء متقن", "تحسّن ملحوظ"],
    },
]


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


def seed_note_taxonomy(db: Session) -> None:
    for entry in NOTE_TAXONOMY_SEED:
        existing = db.query(NoteCategory).filter(NoteCategory.key == entry["key"]).first()
        if existing is not None:
            # الفئة موجودة بالفعل (ربما عدّلها المستخدم) — لا نلمسها.
            continue

        category = NoteCategory(
            key=entry["key"],
            name=entry["name"],
            color=entry["color"],
            sort_order=entry["sort_order"],
            is_system=True,
            is_active=True,
        )
        db.add(category)
        db.flush()  # للحصول على category.id قبل إضافة الأنواع الفرعية

        for order, subtype_name in enumerate(entry["subtypes"]):
            db.add(
                NoteSubtype(
                    category_id=category.id,
                    name=subtype_name,
                    sort_order=order,
                    is_active=True,
                )
            )
    db.commit()


def seed_rubric_settings(db: Session) -> None:
    existing = db.get(RubricSettings, 1)
    if existing is not None:
        return

    db.add(
        RubricSettings(
            id=1,
            weights=dict(DEFAULT_RUBRIC_WEIGHTS),
            deductions={k: dict(v) for k, v in DEFAULT_RUBRIC_DEDUCTIONS.items()},
        )
    )
    db.commit()
    logger.info("تم إنشاء إعدادات سلّم التقييم الافتراضية")
