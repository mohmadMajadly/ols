import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.models.note import CorrectionMode, NoteSeverity


class NoteCreate(BaseModel):
    timestamp_ms: int | None = Field(default=None, ge=0)
    category_id: uuid.UUID
    subtype_id: uuid.UUID | None = None
    severity: NoteSeverity | None = None
    correction_mode: CorrectionMode | None = None
    surah: int | None = None
    ayah: int | None = None
    text: str | None = None
    extra: dict[str, Any] = Field(default_factory=dict)


class NoteUpdate(BaseModel):
    timestamp_ms: int | None = None
    category_id: uuid.UUID | None = None
    subtype_id: uuid.UUID | None = None
    severity: NoteSeverity | None = None
    correction_mode: CorrectionMode | None = None
    surah: int | None = None
    ayah: int | None = None
    text: str | None = None
    extra: dict[str, Any] | None = None


class NoteOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    session_id: uuid.UUID
    timestamp_ms: int | None
    category_id: uuid.UUID
    subtype_id: uuid.UUID | None
    severity: str | None
    correction_mode: str | None
    surah: int | None
    ayah: int | None
    text: str | None
    extra: dict[str, Any]
    created_by: uuid.UUID
    created_at: datetime
