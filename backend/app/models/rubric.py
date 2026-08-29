from sqlalchemy import CheckConstraint, Integer
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

# القيم الافتراضية لسلّم التقييم (من أعراف لوائح تحكيم المسابقات؛ قابلة للتعديل من الإعدادات).
DEFAULT_RUBRIC_WEIGHTS: dict[str, float] = {"hifz": 70, "tajwid": 25, "adaa": 5}
DEFAULT_RUBRIC_DEDUCTIONS: dict[str, dict[str, float]] = {
    "hifz": {"tadaruk": 0, "tanbih": 0.75, "talqin": 1.5},
    "tajwid": {"tadaruk": 0, "tanbih": 0.25, "talqin": 0.5},
    "dabt": {"tadaruk": 0, "tanbih": 0.5, "talqin": 1.0},
    "waqf": {"tadaruk": 0, "tanbih": 0.25, "talqin": 0.5},
}


class RubricSettings(Base):
    """صف واحد فقط (id=1) يحمل إعدادات سلّم التقييم الحالية."""

    __tablename__ = "rubric_settings"
    __table_args__ = (CheckConstraint("id = 1", name="ck_rubric_settings_single_row"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    weights: Mapped[dict] = mapped_column(JSONB, nullable=False)
    deductions: Mapped[dict] = mapped_column(JSONB, nullable=False)
