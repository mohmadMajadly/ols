import uuid
from datetime import date, datetime

from pydantic import BaseModel


# ---------------------------------------------------------------------------
# إحصائيات الطالب - GET /api/students/{id}/stats
# ---------------------------------------------------------------------------


class StudentTotalsOut(BaseModel):
    sessions: int
    notes: int
    total_recorded_ms: int
    avg_grade: float | None
    attendance_rate: float | None


class GradeTrendPointOut(BaseModel):
    session_id: uuid.UUID
    date: datetime
    grade: float
    session_type: str


class CategoryCountOut(BaseModel):
    category_id: uuid.UUID
    name: str
    color: str
    count: int


class SubtypeCountOut(BaseModel):
    subtype_id: uuid.UUID
    name: str
    category_name: str
    color: str
    count: int


class RepeatedMistakeOut(BaseModel):
    surah: int
    surah_name: str
    ayah: int
    count: int
    categories: list[str]


class StudentStatsOut(BaseModel):
    totals: StudentTotalsOut
    grades_trend: list[GradeTrendPointOut]
    errors_by_category: list[CategoryCountOut]
    top_subtypes: list[SubtypeCountOut]
    sessions_by_type: dict[str, int]
    repeated_mistakes: list[RepeatedMistakeOut]


# ---------------------------------------------------------------------------
# إحصائيات لوحة التحكم - GET /api/dashboard/stats
# ---------------------------------------------------------------------------


class DashboardTotalsOut(BaseModel):
    active_students: int
    sessions: int
    notes: int
    avg_grade: float | None
    attendance_rate: float | None
    total_recorded_ms: int


class SessionsOverTimePointOut(BaseModel):
    date: date
    count: int


class GradeBucketOut(BaseModel):
    bucket: str
    count: int


class NeedsAttentionEntryOut(BaseModel):
    student_id: uuid.UUID
    full_name: str
    group_name: str | None
    avg_grade: float
    sessions: int


class GroupSummaryOut(BaseModel):
    group_id: uuid.UUID
    name: str
    students: int
    sessions: int
    avg_grade: float | None


class DashboardStatsOut(BaseModel):
    totals: DashboardTotalsOut
    sessions_over_time: list[SessionsOverTimePointOut]
    errors_by_category: list[CategoryCountOut]
    grade_distribution: list[GradeBucketOut]
    needs_attention: list[NeedsAttentionEntryOut]
    groups_summary: list[GroupSummaryOut]
