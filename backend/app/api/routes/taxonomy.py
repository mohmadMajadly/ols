import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_db, require_roles
from app.models.note_taxonomy import NoteCategory, NoteField, NoteSubtype
from app.models.user import User, UserRole
from app.schemas.taxonomy import (
    NoteCategoryCreate,
    NoteCategoryOut,
    NoteCategoryUpdate,
    NoteFieldCreate,
    NoteFieldOut,
    NoteFieldUpdate,
    NoteSubtypeCreate,
    NoteSubtypeOut,
    NoteSubtypeUpdate,
    TaxonomyOut,
)

router = APIRouter(prefix="/api/taxonomy", tags=["taxonomy"])

_staff_roles = (UserRole.admin, UserRole.supervisor, UserRole.teacher)
_manager_roles = (UserRole.admin, UserRole.supervisor)


def _category_out(db: Session, category: NoteCategory, *, only_active_subtypes: bool) -> NoteCategoryOut:
    query = db.query(NoteSubtype).filter(NoteSubtype.category_id == category.id)
    if only_active_subtypes:
        query = query.filter(NoteSubtype.is_active.is_(True))
    subtypes = query.order_by(NoteSubtype.sort_order).all()
    return NoteCategoryOut(
        id=category.id,
        key=category.key,
        name=category.name,
        color=category.color,
        sort_order=category.sort_order,
        is_system=category.is_system,
        is_active=category.is_active,
        subtypes=[NoteSubtypeOut.model_validate(s) for s in subtypes],
    )


@router.get("", response_model=TaxonomyOut)
def get_taxonomy(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*_staff_roles)),
) -> TaxonomyOut:
    categories = (
        db.query(NoteCategory)
        .filter(NoteCategory.is_active.is_(True))
        .order_by(NoteCategory.sort_order)
        .all()
    )
    fields = (
        db.query(NoteField).filter(NoteField.is_active.is_(True)).order_by(NoteField.sort_order).all()
    )
    return TaxonomyOut(
        categories=[_category_out(db, c, only_active_subtypes=True) for c in categories],
        fields=[NoteFieldOut.model_validate(f) for f in fields],
    )


@router.post("/categories", response_model=NoteCategoryOut, status_code=status.HTTP_201_CREATED)
def create_category(
    payload: NoteCategoryCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*_manager_roles)),
) -> NoteCategoryOut:
    category = NoteCategory(
        name=payload.name,
        color=payload.color.value,
        sort_order=payload.sort_order,
        is_system=False,
        is_active=True,
    )
    db.add(category)
    db.commit()
    db.refresh(category)
    return _category_out(db, category, only_active_subtypes=False)


@router.patch("/categories/{category_id}", response_model=NoteCategoryOut)
def update_category(
    category_id: uuid.UUID,
    payload: NoteCategoryUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*_manager_roles)),
) -> NoteCategoryOut:
    category = db.get(NoteCategory, category_id)
    if category is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="الفئة غير موجودة")

    if payload.name is not None:
        category.name = payload.name
    if payload.color is not None:
        category.color = payload.color.value
    if payload.sort_order is not None:
        category.sort_order = payload.sort_order
    if payload.is_active is not None:
        category.is_active = payload.is_active

    db.commit()
    db.refresh(category)
    return _category_out(db, category, only_active_subtypes=False)


@router.delete("/categories/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_category(
    category_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*_manager_roles)),
) -> None:
    category = db.get(NoteCategory, category_id)
    if category is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="الفئة غير موجودة")
    if category.is_system:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="لا يمكن حذف فئة نظامية، يمكن تعطيلها فقط",
        )
    db.delete(category)
    db.commit()
    return None


@router.post("/subtypes", response_model=NoteSubtypeOut, status_code=status.HTTP_201_CREATED)
def create_subtype(
    payload: NoteSubtypeCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*_manager_roles)),
) -> NoteSubtype:
    category = db.get(NoteCategory, payload.category_id)
    if category is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="الفئة غير موجودة")

    existing = (
        db.query(NoteSubtype)
        .filter(NoteSubtype.category_id == payload.category_id, NoteSubtype.name == payload.name)
        .first()
    )
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="هذا النوع الفرعي موجود بالفعل في هذه الفئة"
        )

    subtype = NoteSubtype(
        category_id=payload.category_id,
        name=payload.name,
        sort_order=payload.sort_order,
        is_active=True,
    )
    db.add(subtype)
    db.commit()
    db.refresh(subtype)
    return subtype


@router.patch("/subtypes/{subtype_id}", response_model=NoteSubtypeOut)
def update_subtype(
    subtype_id: uuid.UUID,
    payload: NoteSubtypeUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*_manager_roles)),
) -> NoteSubtype:
    subtype = db.get(NoteSubtype, subtype_id)
    if subtype is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="النوع الفرعي غير موجود")

    if payload.name is not None:
        subtype.name = payload.name
    if payload.sort_order is not None:
        subtype.sort_order = payload.sort_order
    if payload.is_active is not None:
        subtype.is_active = payload.is_active

    db.commit()
    db.refresh(subtype)
    return subtype


@router.post("/fields", response_model=NoteFieldOut, status_code=status.HTTP_201_CREATED)
def create_field(
    payload: NoteFieldCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*_manager_roles)),
) -> NoteField:
    field = NoteField(
        name=payload.name,
        field_type=payload.field_type.value,
        options=payload.options,
        sort_order=payload.sort_order,
        is_active=True,
    )
    db.add(field)
    db.commit()
    db.refresh(field)
    return field


@router.patch("/fields/{field_id}", response_model=NoteFieldOut)
def update_field(
    field_id: uuid.UUID,
    payload: NoteFieldUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*_manager_roles)),
) -> NoteField:
    field = db.get(NoteField, field_id)
    if field is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="الحقل غير موجود")

    if payload.name is not None:
        field.name = payload.name
    if payload.field_type is not None:
        field.field_type = payload.field_type.value
    if payload.options is not None:
        field.options = payload.options
    if payload.sort_order is not None:
        field.sort_order = payload.sort_order
    if payload.is_active is not None:
        field.is_active = payload.is_active

    db.commit()
    db.refresh(field)
    return field
