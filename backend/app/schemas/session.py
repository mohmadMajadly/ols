import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.session import Attendance, SessionType
from app.schemas.note import NoteOut


class SessionCreate(BaseModel):
    student_id: uuid.UUID
    session_type: SessionType
    attendance: Attendance = Attendance.hadir
    range_start_surah: int | None = None
    range_start_ayah: int | None = None
    range_end_surah: int | None = None
    range_end_ayah: int | None = None


class SessionFinalize(BaseModel):
    # {segment: last_chunk_index} لكل segment (بث MediaRecorder) رُفعت أجزاؤه.
    segments: dict[int, int] = Field(default_factory=dict)
    # اختياري الآن: المدة الفعلية تُشتق من ffprobe على الملف النهائي بعد
    # الدمج؛ قيمة العميل هنا تُستخدم fallback فقط إن فشل ffprobe.
    duration_ms: int | None = Field(default=None, ge=0)
    attendance: Attendance | None = None
    grade: float | None = None
    summary: str | None = None


class SessionUpdate(BaseModel):
    grade: float | None = None
    summary: str | None = None
    attendance: Attendance | None = None
    range_start_surah: int | None = None
    range_start_ayah: int | None = None
    range_end_surah: int | None = None
    range_end_ayah: int | None = None


class RecordingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    status: str
    mime_type: str
    duration_ms: int | None
    size_bytes: int | None


class SessionListItemOut(BaseModel):
    id: uuid.UUID
    student_id: uuid.UUID
    student_name: str
    teacher_id: uuid.UUID
    session_type: str
    status: str
    attendance: str
    range_start_surah: int | None
    range_start_ayah: int | None
    range_end_surah: int | None
    range_end_ayah: int | None
    grade: float | None
    suggested_grade: float | None
    notes_count: int
    started_at: datetime
    ended_at: datetime | None


class SessionDetailOut(BaseModel):
    id: uuid.UUID
    student_id: uuid.UUID
    student_name: str
    teacher_id: uuid.UUID
    session_type: str
    status: str
    attendance: str
    range_start_surah: int | None
    range_start_ayah: int | None
    range_end_surah: int | None
    range_end_ayah: int | None
    grade: float | None
    suggested_grade: float | None
    summary: str | None
    started_at: datetime
    ended_at: datetime | None
    recording: RecordingOut | None
    notes: list[NoteOut]


class ActiveSessionOut(BaseModel):
    session: SessionDetailOut | None
    # {segment: [الفهارس المرفوعة]} - العميل يبدأ segment جديداً برقم أعلى
    # من الأقصى الموجود هنا.
    uploaded: dict[int, list[int]] = {}
