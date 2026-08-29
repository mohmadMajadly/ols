from fastapi import APIRouter, Depends, HTTPException, status

from app.api.deps import require_roles
from app.core import mushaf_data
from app.core.quran_meta import is_valid_ayah, is_valid_surah
from app.models.user import User, UserRole
from app.schemas.mushaf import MushafPageForOut, MushafPageOut

router = APIRouter(prefix="/api/mushaf", tags=["mushaf"])

# بيانات مصحف عامة غير حساسة (نص القرآن وتخطيطه) — متاحة لكل الأدوار المسجَّلة
# بمن فيهم الطالب (تُستخدم في بوابة الطالب وشاشة الجلسة الحية لعرض الصفحة).
_all_roles = (UserRole.admin, UserRole.supervisor, UserRole.teacher, UserRole.student)


@router.get("/pages/{page}", response_model=MushafPageOut)
def get_mushaf_page(
    page: int, current_user: User = Depends(require_roles(*_all_roles))
) -> MushafPageOut:
    if not mushaf_data.is_valid_page(page):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"رقم الصفحة يجب أن يكون بين 1 و{mushaf_data.TOTAL_PAGES}",
        )
    entry = mushaf_data.get_page(page)
    assert entry is not None
    return MushafPageOut.model_validate(entry)


@router.get("/page-for", response_model=MushafPageForOut)
def get_page_for_ayah(
    surah: int, ayah: int, current_user: User = Depends(require_roles(*_all_roles))
) -> MushafPageForOut:
    if not is_valid_surah(surah):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="رقم السورة غير صحيح"
        )
    if not is_valid_ayah(surah, ayah):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="رقم الآية غير صحيح لهذه السورة",
        )
    location = mushaf_data.get_page_for_ayah(surah, ayah)
    if location is None:
        # لا يجب أن يحدث هذا لآية صحيحة الحدود؛ يشير لثغرة في بيانات المصحف.
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="تعذّر تحديد موضع هذه الآية في بيانات المصحف",
        )
    return MushafPageForOut(surah=surah, ayah=ayah, **location)
