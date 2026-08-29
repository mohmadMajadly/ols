import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class GroupOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    description: str | None
    teacher_id: uuid.UUID | None
    is_active: bool
    created_at: datetime
    students_count: int = 0


class GroupCreate(BaseModel):
    name: str = Field(min_length=1)
    description: str | None = None
    teacher_id: uuid.UUID | None = None


class GroupUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1)
    description: str | None = None
    teacher_id: uuid.UUID | None = None
    is_active: bool | None = None
