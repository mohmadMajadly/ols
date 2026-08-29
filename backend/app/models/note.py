import enum
import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class NoteSeverity(str, enum.Enum):
    khafif = "khafif"
    mutawassit = "mutawassit"
    jasim = "jasim"


class CorrectionMode(str, enum.Enum):
    tadaruk = "tadaruk"
    tanbih = "tanbih"
    talqin = "talqin"


class Note(Base):
    __tablename__ = "notes"
    __table_args__ = (
        CheckConstraint(
            "severity IS NULL OR severity IN ('khafif','mutawassit','jasim')", name="ck_notes_severity"
        ),
        CheckConstraint(
            "correction_mode IS NULL OR correction_mode IN ('tadaruk','tanbih','talqin')",
            name="ck_notes_correction_mode",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("sessions.id"), nullable=False, index=True
    )
    # NULL = ملاحظة عامة غير موقوتة
    timestamp_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    category_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("note_categories.id"), nullable=False
    )
    subtype_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("note_subtypes.id"), nullable=True
    )
    severity: Mapped[str | None] = mapped_column(Text, nullable=True)
    correction_mode: Mapped[str | None] = mapped_column(Text, nullable=True)
    surah: Mapped[int | None] = mapped_column(Integer, nullable=True)
    ayah: Mapped[int | None] = mapped_column(Integer, nullable=True)
    text: Mapped[str | None] = mapped_column(Text, nullable=True)
    # قيم الحقول المخصصة: مفتاح = note_field id (كنص)
    extra: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict, server_default="{}")
    created_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
