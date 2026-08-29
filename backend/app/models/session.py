import enum
import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, Numeric, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class SessionType(str, enum.Enum):
    sabq = "sabq"
    sabqiyat = "sabqiyat"
    murajaah = "murajaah"


class SessionStatus(str, enum.Enum):
    recording = "recording"
    completed = "completed"
    cancelled = "cancelled"


class Attendance(str, enum.Enum):
    hadir = "hadir"
    mutaakhir = "mutaakhir"
    ghaib = "ghaib"


class TasmeeSession(Base):
    """جلسة تسميع واحدة. اسم الجدول ``sessions`` (الصنف بالإنجليزية
    ``TasmeeSession`` لتجنب تضارب الاسم مع ``sqlalchemy.orm.Session``)."""

    __tablename__ = "sessions"
    __table_args__ = (
        CheckConstraint(
            "session_type IN ('sabq','sabqiyat','murajaah')", name="ck_sessions_session_type"
        ),
        CheckConstraint("status IN ('recording','completed','cancelled')", name="ck_sessions_status"),
        CheckConstraint("attendance IN ('hadir','mutaakhir','ghaib')", name="ck_sessions_attendance"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    student_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("students.id"), nullable=False, index=True
    )
    teacher_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True
    )
    session_type: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False, default="recording")
    attendance: Mapped[str] = mapped_column(Text, nullable=False, default="hadir")
    range_start_surah: Mapped[int | None] = mapped_column(Integer, nullable=True)
    range_start_ayah: Mapped[int | None] = mapped_column(Integer, nullable=True)
    range_end_surah: Mapped[int | None] = mapped_column(Integer, nullable=True)
    range_end_ayah: Mapped[int | None] = mapped_column(Integer, nullable=True)
    suggested_grade: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)
    grade: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
