"""create sessions, recordings and notes tables

Revision ID: 0003
Revises: 0002
Create Date: 2026-08-29

"""
from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "sessions",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("student_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("students.id"), nullable=False),
        sa.Column("teacher_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("session_type", sa.Text(), nullable=False),
        sa.Column("status", sa.Text(), nullable=False, server_default="recording"),
        sa.Column("attendance", sa.Text(), nullable=False, server_default="hadir"),
        sa.Column("range_start_surah", sa.Integer(), nullable=True),
        sa.Column("range_start_ayah", sa.Integer(), nullable=True),
        sa.Column("range_end_surah", sa.Integer(), nullable=True),
        sa.Column("range_end_ayah", sa.Integer(), nullable=True),
        sa.Column("suggested_grade", sa.Numeric(5, 2), nullable=True),
        sa.Column("grade", sa.Numeric(5, 2), nullable=True),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column(
            "started_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "session_type IN ('sabq','sabqiyat','murajaah')", name="ck_sessions_session_type"
        ),
        sa.CheckConstraint("status IN ('recording','completed','cancelled')", name="ck_sessions_status"),
        sa.CheckConstraint("attendance IN ('hadir','mutaakhir','ghaib')", name="ck_sessions_attendance"),
    )
    op.create_index("ix_sessions_student_id", "sessions", ["student_id"])
    op.create_index("ix_sessions_teacher_id", "sessions", ["teacher_id"])
    op.create_index("ix_sessions_started_at", "sessions", ["started_at"])

    op.create_table(
        "recordings",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "session_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("sessions.id"),
            nullable=False,
            unique=True,
        ),
        sa.Column("status", sa.Text(), nullable=False, server_default="uploading"),
        sa.Column("mime_type", sa.Text(), nullable=False, server_default="audio/webm"),
        sa.Column("duration_ms", sa.Integer(), nullable=True),
        sa.Column("size_bytes", sa.BigInteger(), nullable=True),
        sa.Column("file_path", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("finalized_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("status IN ('uploading','ready','failed')", name="ck_recordings_status"),
    )

    op.create_table(
        "notes",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("session_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("sessions.id"), nullable=False),
        sa.Column("timestamp_ms", sa.Integer(), nullable=True),
        sa.Column(
            "category_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("note_categories.id"), nullable=False
        ),
        sa.Column(
            "subtype_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("note_subtypes.id"), nullable=True
        ),
        sa.Column("severity", sa.Text(), nullable=True),
        sa.Column("correction_mode", sa.Text(), nullable=True),
        sa.Column("surah", sa.Integer(), nullable=True),
        sa.Column("ayah", sa.Integer(), nullable=True),
        sa.Column("text", sa.Text(), nullable=True),
        sa.Column("extra", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.CheckConstraint(
            "severity IS NULL OR severity IN ('khafif','mutawassit','jasim')", name="ck_notes_severity"
        ),
        sa.CheckConstraint(
            "correction_mode IS NULL OR correction_mode IN ('tadaruk','tanbih','talqin')",
            name="ck_notes_correction_mode",
        ),
    )
    op.create_index("ix_notes_session_id", "notes", ["session_id"])


def downgrade() -> None:
    op.drop_index("ix_notes_session_id", table_name="notes")
    op.drop_table("notes")
    op.drop_table("recordings")
    op.drop_index("ix_sessions_started_at", table_name="sessions")
    op.drop_index("ix_sessions_teacher_id", table_name="sessions")
    op.drop_index("ix_sessions_student_id", table_name="sessions")
    op.drop_table("sessions")
