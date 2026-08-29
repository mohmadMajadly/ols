from fastapi import APIRouter, Depends

from app.api.deps import require_roles
from app.core.quran_meta import SURAH_AYAH_COUNTS
from app.models.user import User, UserRole
from app.schemas.quran import SurahOut

router = APIRouter(prefix="/api/quran", tags=["quran"])

_staff_roles = (UserRole.admin, UserRole.supervisor, UserRole.teacher)


@router.get("/surahs", response_model=list[SurahOut])
def list_surahs(current_user: User = Depends(require_roles(*_staff_roles))) -> list[SurahOut]:
    return [
        SurahOut(number=number, name=str(entry["name"]), ayah_count=int(entry["ayah_count"]))
        for number, entry in sorted(SURAH_AYAH_COUNTS.items())
    ]
