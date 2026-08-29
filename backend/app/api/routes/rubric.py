from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_db, require_roles
from app.models.rubric import DEFAULT_RUBRIC_DEDUCTIONS, DEFAULT_RUBRIC_WEIGHTS, RubricSettings
from app.models.user import User, UserRole
from app.schemas.rubric import RubricOut, RubricUpdate

router = APIRouter(prefix="/api/rubric", tags=["rubric"])

_staff_roles = (UserRole.admin, UserRole.supervisor, UserRole.teacher)


@router.get("", response_model=RubricOut)
def get_rubric(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*_staff_roles)),
) -> RubricOut:
    row = db.get(RubricSettings, 1)
    if row is None:
        return RubricOut(weights=DEFAULT_RUBRIC_WEIGHTS, deductions=DEFAULT_RUBRIC_DEDUCTIONS)
    return RubricOut(weights=row.weights, deductions=row.deductions)


@router.put("", response_model=RubricOut)
def update_rubric(
    payload: RubricUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.admin)),
) -> RubricOut:
    row = db.get(RubricSettings, 1)
    if row is None:
        row = RubricSettings(id=1, weights=payload.weights, deductions=payload.deductions)
        db.add(row)
    else:
        row.weights = payload.weights
        row.deductions = payload.deductions
    db.commit()
    db.refresh(row)
    return RubricOut(weights=row.weights, deductions=row.deductions)
