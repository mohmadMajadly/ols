"""add waveform column to recordings

Revision ID: 0004
Revises: 0003
Create Date: 2026-08-29

"""
from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0004"
down_revision: Union[str, None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("recordings", sa.Column("waveform", postgresql.JSONB(), nullable=True))


def downgrade() -> None:
    op.drop_column("recordings", "waveform")
