import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field


class StudentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    full_name: str
    group_id: uuid.UUID | None
    user_id: uuid.UUID | None
    phone: str | None
    guardian_phone: str | None
    birth_year: int | None
    joined_at: date
    memorization_note: str | None
    is_active: bool
    created_at: datetime
    # بيانات حساب الدخول المربوط إن وُجد (من join مع users) — بلا أي حقول حساسة.
    account_username: str | None = None
    account_is_active: bool | None = None


class StudentCreate(BaseModel):
    full_name: str = Field(min_length=1)
    group_id: uuid.UUID | None = None
    phone: str | None = None
    guardian_phone: str | None = None
    birth_year: int | None = None
    memorization_note: str | None = None


class StudentUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=1)
    group_id: uuid.UUID | None = None
    phone: str | None = None
    guardian_phone: str | None = None
    birth_year: int | None = None
    memorization_note: str | None = None
    is_active: bool | None = None


class StudentAccountCreate(BaseModel):
    """POST /api/students/{id}/account — إنشاء حساب دخول للطالب وربطه."""

    username: str = Field(min_length=3, max_length=50)
    password: str = Field(min_length=8)
