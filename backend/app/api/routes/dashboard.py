"""إحصائيات لوحة التحكم (WP5a، الجزء الثالث).

RBAC: المعلم تُفرض عليه جلساته وحلقاته تلقائياً (أي teacher_id وارد في
الاستعلام يُتجاهل له)؛ admin/supervisor بلا قيد ويمكنهما تمرير teacher_id
لتضييق النطاق. الطالب يُمنع بالكامل (403) عبر ``require_roles``.
"""

import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import case, func
from sqlalchemy.orm import Session

from app.api.deps import get_db, require_roles
from app.models.group import Group
from app.models.note import Note
from app.models.note_taxonomy import NoteCategory
from app.models.recording import Recording
from app.models.session import SessionType, TasmeeSession
from app.models.student import Student
from app.models.user import User, UserRole
from app.schemas.stats import (
    CategoryCountOut,
    DashboardStatsOut,
    DashboardTotalsOut,
    GradeBucketOut,
    GroupSummaryOut,
    NeedsAttentionEntryOut,
    SessionsOverTimePointOut,
)

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])

_staff_roles = (UserRole.admin, UserRole.supervisor, UserRole.teacher)

DEFAULT_PERIOD_DAYS = 30
GRADE_BUCKET_ORDER = ["90-100", "80-89", "70-79", "أقل من 70"]


def _grade_bucket_case():
    return case(
        (TasmeeSession.grade >= 90, "90-100"),
        (TasmeeSession.grade >= 80, "80-89"),
        (TasmeeSession.grade >= 70, "70-79"),
        else_="أقل من 70",
    )


@router.get("/stats", response_model=DashboardStatsOut)
def get_dashboard_stats(
    group_id: uuid.UUID | None = Query(default=None),
    teacher_id: uuid.UUID | None = Query(default=None),
    session_type: SessionType | None = Query(default=None),
    from_: datetime | None = Query(default=None, alias="from"),
    to: datetime | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*_staff_roles)),
) -> DashboardStatsOut:
    now = datetime.now(timezone.utc)
    period_to = to if to is not None else now
    period_from = from_ if from_ is not None else period_to - timedelta(days=DEFAULT_PERIOD_DAYS)

    # RBAC: المعلم يُفرض عليه جلساته/حلقاته تلقائياً، يتجاهل teacher_id الوارد.
    effective_teacher_id = current_user.id if current_user.role == UserRole.teacher else teacher_id

    clauses = [
        TasmeeSession.status == "completed",
        TasmeeSession.started_at >= period_from,
        TasmeeSession.started_at <= period_to,
    ]
    if effective_teacher_id is not None:
        clauses.append(TasmeeSession.teacher_id == effective_teacher_id)
    if group_id is not None:
        clauses.append(Student.group_id == group_id)
    if session_type is not None:
        clauses.append(TasmeeSession.session_type == session_type.value)

    # --- totals -----------------------------------------------------
    active_students, sessions_count, avg_grade, attended_count = (
        db.query(
            func.count(func.distinct(TasmeeSession.student_id)),
            func.count(TasmeeSession.id),
            func.avg(TasmeeSession.grade),
            func.sum(case((TasmeeSession.attendance.in_(["hadir", "mutaakhir"]), 1), else_=0)),
        )
        .join(Student, Student.id == TasmeeSession.student_id)
        .filter(*clauses)
        .one()
    )
    active_students = int(active_students or 0)
    sessions_count = int(sessions_count or 0)
    attended_count = int(attended_count or 0)

    notes_count = (
        db.query(func.count(Note.id))
        .join(TasmeeSession, TasmeeSession.id == Note.session_id)
        .join(Student, Student.id == TasmeeSession.student_id)
        .filter(*clauses)
        .scalar()
        or 0
    )

    total_recorded_ms = (
        db.query(func.coalesce(func.sum(Recording.duration_ms), 0))
        .join(TasmeeSession, TasmeeSession.id == Recording.session_id)
        .join(Student, Student.id == TasmeeSession.student_id)
        .filter(*clauses)
        .scalar()
        or 0
    )

    totals = DashboardTotalsOut(
        active_students=active_students,
        sessions=sessions_count,
        notes=int(notes_count),
        avg_grade=round(float(avg_grade), 2) if avg_grade is not None else None,
        attendance_rate=round(attended_count / sessions_count * 100, 2) if sessions_count else None,
        total_recorded_ms=int(total_recorded_ms),
    )

    # --- sessions_over_time ------------------------------------------
    day_col = func.date(TasmeeSession.started_at)
    day_rows = (
        db.query(day_col, func.count(TasmeeSession.id))
        .join(Student, Student.id == TasmeeSession.student_id)
        .filter(*clauses)
        .group_by(day_col)
        .order_by(day_col)
        .all()
    )
    sessions_over_time = [SessionsOverTimePointOut(date=d, count=int(c)) for d, c in day_rows]

    # --- errors_by_category -------------------------------------------
    category_rows = (
        db.query(NoteCategory.id, NoteCategory.name, NoteCategory.color, func.count(Note.id))
        .join(Note, Note.category_id == NoteCategory.id)
        .join(TasmeeSession, TasmeeSession.id == Note.session_id)
        .join(Student, Student.id == TasmeeSession.student_id)
        .filter(*clauses)
        .group_by(NoteCategory.id, NoteCategory.name, NoteCategory.color)
        .order_by(func.count(Note.id).desc())
        .all()
    )
    errors_by_category = [
        CategoryCountOut(category_id=r[0], name=r[1], color=r[2], count=int(r[3])) for r in category_rows
    ]

    # --- grade_distribution ---------------------------------------------
    bucket_col = _grade_bucket_case()
    bucket_rows = (
        db.query(bucket_col.label("bucket"), func.count(TasmeeSession.id))
        .join(Student, Student.id == TasmeeSession.student_id)
        .filter(*clauses, TasmeeSession.grade.isnot(None))
        .group_by("bucket")
        .all()
    )
    bucket_counts = {b: 0 for b in GRADE_BUCKET_ORDER}
    for bucket, count in bucket_rows:
        bucket_counts[bucket] = int(count)
    grade_distribution = [GradeBucketOut(bucket=b, count=bucket_counts[b]) for b in GRADE_BUCKET_ORDER]

    # --- needs_attention -------------------------------------------------
    needs_rows = (
        db.query(
            Student.id,
            Student.full_name,
            Group.name,
            func.avg(TasmeeSession.grade),
            func.count(TasmeeSession.id),
        )
        .join(TasmeeSession, TasmeeSession.student_id == Student.id)
        .outerjoin(Group, Group.id == Student.group_id)
        .filter(*clauses, TasmeeSession.grade.isnot(None))
        .group_by(Student.id, Student.full_name, Group.name)
        .having(func.count(TasmeeSession.id) >= 3)
        .order_by(func.avg(TasmeeSession.grade).asc())
        .limit(5)
        .all()
    )
    needs_attention = [
        NeedsAttentionEntryOut(
            student_id=sid, full_name=name, group_name=gname, avg_grade=round(float(avg), 2), sessions=int(cnt)
        )
        for sid, name, gname, avg, cnt in needs_rows
    ]

    # --- groups_summary ----------------------------------------------
    groups_query = db.query(Group).filter(Group.is_active.is_(True))
    if effective_teacher_id is not None:
        groups_query = groups_query.filter(Group.teacher_id == effective_teacher_id)
    if group_id is not None:
        groups_query = groups_query.filter(Group.id == group_id)
    groups = groups_query.order_by(Group.name).all()
    group_ids = [g.id for g in groups]

    student_counts: dict[uuid.UUID, int] = {}
    group_session_map: dict[uuid.UUID, tuple[int, float | None]] = {}
    if group_ids:
        student_counts = dict(
            db.query(Student.group_id, func.count(Student.id))
            .filter(Student.group_id.in_(group_ids), Student.is_active.is_(True))
            .group_by(Student.group_id)
            .all()
        )
        group_session_rows = (
            db.query(Student.group_id, func.count(TasmeeSession.id), func.avg(TasmeeSession.grade))
            .join(TasmeeSession, TasmeeSession.student_id == Student.id)
            .filter(*clauses, Student.group_id.in_(group_ids))
            .group_by(Student.group_id)
            .all()
        )
        group_session_map = {gid: (int(cnt), avg) for gid, cnt, avg in group_session_rows}

    groups_summary = [
        GroupSummaryOut(
            group_id=g.id,
            name=g.name,
            students=int(student_counts.get(g.id, 0)),
            sessions=group_session_map.get(g.id, (0, None))[0],
            avg_grade=(
                round(float(group_session_map[g.id][1]), 2)
                if group_session_map.get(g.id) and group_session_map[g.id][1] is not None
                else None
            ),
        )
        for g in groups
    ]

    return DashboardStatsOut(
        totals=totals,
        sessions_over_time=sessions_over_time,
        errors_by_category=errors_by_category,
        grade_distribution=grade_distribution,
        needs_attention=needs_attention,
        groups_summary=groups_summary,
    )
