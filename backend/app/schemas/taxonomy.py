import uuid

from pydantic import BaseModel, ConfigDict, Field

from app.models.note_taxonomy import NoteColor, NoteFieldType


class NoteSubtypeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    category_id: uuid.UUID
    name: str
    sort_order: int
    is_active: bool


class NoteCategoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    key: str | None
    name: str
    color: NoteColor
    sort_order: int
    is_system: bool
    is_active: bool
    subtypes: list[NoteSubtypeOut] = []


class NoteFieldOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    field_type: NoteFieldType
    options: list[str] | None
    sort_order: int
    is_active: bool


class TaxonomyOut(BaseModel):
    categories: list[NoteCategoryOut]
    fields: list[NoteFieldOut]


class NoteCategoryCreate(BaseModel):
    name: str = Field(min_length=1)
    color: NoteColor
    sort_order: int = 0


class NoteCategoryUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1)
    color: NoteColor | None = None
    sort_order: int | None = None
    is_active: bool | None = None


class NoteSubtypeCreate(BaseModel):
    category_id: uuid.UUID
    name: str = Field(min_length=1)
    sort_order: int = 0


class NoteSubtypeUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1)
    sort_order: int | None = None
    is_active: bool | None = None


class NoteFieldCreate(BaseModel):
    name: str = Field(min_length=1)
    field_type: NoteFieldType
    options: list[str] | None = None
    sort_order: int = 0


class NoteFieldUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1)
    field_type: NoteFieldType | None = None
    options: list[str] | None = None
    sort_order: int | None = None
    is_active: bool | None = None
