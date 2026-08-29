"""اختبارات WP5a - الجزء الثاني (إحصائيات الطالب) والجزء الثالث (إحصائيات لوحة
التحكم). السيناريو غني ومبني مباشرة عبر ORM (لا عبر finalize/ffmpeg) للتحكم
الكامل بالتواريخ والدرجات - القيم المتوقعة محسوبة يدوياً هنا."""

from datetime import datetime, timedelta, timezone
from decimal import Decimal

from app.core.security import hash_password
from app.models.group import Group
from app.models.note import Note
from app.models.note_taxonomy import NoteCategory, NoteSubtype
from app.models.session import TasmeeSession
from app.models.student import Student
from app.models.user import User, UserRole

NOW = datetime.now(timezone.utc)


def _login(client, username, password):
    resp = client.post("/api/auth/login", json={"username": username, "password": password})
    assert resp.status_code == 200


def _login_as_admin(client):
    from app.core.config import settings

    resp = client.post(
        "/api/auth/login", json={"username": settings.ADMIN_USERNAME, "password": settings.ADMIN_PASSWORD}
    )
    assert resp.status_code == 200


def _create_user(db_session, *, username, password, role):
    user = User(
        username=username.lower(), password_hash=hash_password(password), full_name=username, role=role
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


def _day(n_ago, hour=10):
    return (NOW - timedelta(days=n_ago)).replace(hour=hour, minute=0, second=0, microsecond=0)


def _make_session(db_session, *, student, teacher, session_type, attendance, grade, days_ago, status="completed"):
    session = TasmeeSession(
        student_id=student.id,
        teacher_id=teacher.id,
        session_type=session_type,
        attendance=attendance,
        status=status,
        started_at=_day(days_ago),
        ended_at=_day(days_ago) + timedelta(minutes=15),
        grade=Decimal(str(grade)) if grade is not None else None,
        suggested_grade=Decimal(str(grade)) if grade is not None else None,
    )
    db_session.add(session)
    db_session.flush()
    return session


class Scenario:
    pass


def _seed_rich_scenario(db_session):
    """يبني السيناريو الموصوف في المواصفات: حلقتان بمعلمين، 3 طلاب، ~8 جلسات
    مكتملة بتواريخ/درجات/أنواع مختلفة + ملاحظات بفئات وأنواع فرعية ومواضع
    متعمدة (منها موضع مكرر عبر جلستين) + جلسة غياب + جلسة ملغاة."""
    sc = Scenario()

    sc.teacher1 = _create_user(db_session, username="stats_teacher1", password="Password123!", role=UserRole.teacher)
    sc.teacher2 = _create_user(db_session, username="stats_teacher2", password="Password123!", role=UserRole.teacher)

    sc.group1 = Group(name="حلقة إحصائيات 1", teacher_id=sc.teacher1.id, is_active=True)
    sc.group2 = Group(name="حلقة إحصائيات 2", teacher_id=sc.teacher2.id, is_active=True)
    db_session.add_all([sc.group1, sc.group2])
    db_session.flush()

    sc.student1 = Student(full_name="طالب إحصائيات الأول", group_id=sc.group1.id)
    sc.student2 = Student(full_name="طالب إحصائيات الثاني", group_id=sc.group1.id)
    sc.student3 = Student(full_name="طالب إحصائيات الثالث", group_id=sc.group2.id)
    db_session.add_all([sc.student1, sc.student2, sc.student3])
    db_session.flush()

    sc.hifz = db_session.query(NoteCategory).filter(NoteCategory.key == "hifz").first()
    sc.tajwid = db_session.query(NoteCategory).filter(NoteCategory.key == "tajwid").first()
    sc.itqan = db_session.query(NoteCategory).filter(NoteCategory.key == "itqan").first()
    sc.hifz_sub = db_session.query(NoteSubtype).filter(NoteSubtype.category_id == sc.hifz.id).first()

    # طالب 1: 4 جلسات مكتملة، أنواع وحضور ودرجات مختلفة
    sc.s1_sess1 = _make_session(
        db_session, student=sc.student1, teacher=sc.teacher1, session_type="sabq", attendance="hadir",
        grade=95.5, days_ago=20,
    )
    sc.s1_sess2 = _make_session(
        db_session, student=sc.student1, teacher=sc.teacher1, session_type="sabqiyat", attendance="hadir",
        grade=88.0, days_ago=15,
    )
    sc.s1_sess3 = _make_session(
        db_session, student=sc.student1, teacher=sc.teacher1, session_type="murajaah", attendance="mutaakhir",
        grade=72.25, days_ago=8,
    )
    sc.s1_sess4 = _make_session(
        db_session, student=sc.student1, teacher=sc.teacher1, session_type="sabq", attendance="hadir",
        grade=91.0, days_ago=2,
    )

    # طالب 2: جلستان مكتملتان + جلسة غياب + جلسة ملغاة (يجب ألا تُحسب)
    sc.s2_sess1 = _make_session(
        db_session, student=sc.student2, teacher=sc.teacher1, session_type="sabq", attendance="hadir",
        grade=65.0, days_ago=10,
    )
    sc.s2_sess2 = _make_session(
        db_session, student=sc.student2, teacher=sc.teacher1, session_type="sabqiyat", attendance="hadir",
        grade=60.0, days_ago=4,
    )
    sc.s2_ghaib = _make_session(
        db_session, student=sc.student2, teacher=sc.teacher1, session_type="sabq", attendance="ghaib",
        grade=None, days_ago=6,
    )
    sc.s2_cancelled = _make_session(
        db_session, student=sc.student2, teacher=sc.teacher1, session_type="sabq", attendance="hadir",
        grade=None, days_ago=1, status="cancelled",
    )

    # طالب 3 (حلقة أخرى، معلم آخر)
    sc.s3_sess1 = _make_session(
        db_session, student=sc.student3, teacher=sc.teacher2, session_type="sabq", attendance="hadir",
        grade=97.0, days_ago=12,
    )
    sc.s3_sess2 = _make_session(
        db_session, student=sc.student3, teacher=sc.teacher2, session_type="murajaah", attendance="hadir",
        grade=93.0, days_ago=3,
    )

    notes = [
        # موضع مكرر (سورة 2 آية 30) عبر جلستين مختلفتين لطالب 1 - فئة خصم (hifz)
        Note(
            session_id=sc.s1_sess1.id, category_id=sc.hifz.id, subtype_id=sc.hifz_sub.id, surah=2, ayah=30,
            created_by=sc.teacher1.id,
        ),
        Note(
            session_id=sc.s1_sess2.id, category_id=sc.hifz.id, subtype_id=sc.hifz_sub.id, surah=2, ayah=30,
            created_by=sc.teacher1.id,
        ),
        Note(session_id=sc.s1_sess3.id, category_id=sc.tajwid.id, surah=2, ayah=31, created_by=sc.teacher1.id),
        Note(
            session_id=sc.s1_sess4.id, category_id=sc.hifz.id, subtype_id=sc.hifz_sub.id, surah=18, ayah=10,
            created_by=sc.teacher1.id,
        ),
        # موضع مكرر آخر (سورة 20 آية 5) عبر جلستين لكن بفئة itqan (sahih) - يجب ألا يظهر في repeated_mistakes
        Note(session_id=sc.s1_sess1.id, category_id=sc.itqan.id, surah=20, ayah=5, created_by=sc.teacher1.id),
        Note(session_id=sc.s1_sess2.id, category_id=sc.itqan.id, surah=20, ayah=5, created_by=sc.teacher1.id),
        # طالب 2
        Note(
            session_id=sc.s2_sess1.id, category_id=sc.hifz.id, subtype_id=sc.hifz_sub.id, surah=3, ayah=5,
            created_by=sc.teacher1.id,
        ),
    ]
    db_session.add_all(notes)
    db_session.commit()
    return sc


# ---------------------------------------------------------------------------
# إحصائيات الطالب
# ---------------------------------------------------------------------------


def test_student_stats_computes_all_numeric_fields_correctly(client, db_session):
    sc = _seed_rich_scenario(db_session)
    _login_as_admin(client)

    resp = client.get(f"/api/students/{sc.student1.id}/stats")
    assert resp.status_code == 200
    body = resp.json()

    grades = [95.5, 88.0, 72.25, 91.0]
    assert body["totals"]["sessions"] == 4
    assert body["totals"]["notes"] == 6  # 3 hifz + 1 tajwid + 2 itqan
    assert body["totals"]["total_recorded_ms"] == 0
    assert body["totals"]["avg_grade"] == round(sum(grades) / len(grades), 2)
    assert body["totals"]["attendance_rate"] == 100.0  # hadir/hadir/mutaakhir/hadir -> 4/4

    trend = body["grades_trend"]
    assert [t["grade"] for t in trend] == grades  # تصاعدياً بالتاريخ (الأقدم أولاً)
    assert [t["session_type"] for t in trend] == ["sabq", "sabqiyat", "murajaah", "sabq"]

    errors_by_category = {e["color"]: e["count"] for e in body["errors_by_category"]}
    assert errors_by_category == {"hifz": 3, "sahih": 2, "tajwid": 1}

    assert len(body["top_subtypes"]) == 1
    assert body["top_subtypes"][0]["count"] == 3
    assert body["top_subtypes"][0]["category_name"] == "أخطاء الحفظ"

    assert body["sessions_by_type"] == {"sabq": 2, "sabqiyat": 1, "murajaah": 1}


def test_repeated_mistakes_captures_repeated_position_and_excludes_itqan(client, db_session):
    sc = _seed_rich_scenario(db_session)
    _login_as_admin(client)

    resp = client.get(f"/api/students/{sc.student1.id}/stats")
    assert resp.status_code == 200
    mistakes = resp.json()["repeated_mistakes"]

    assert len(mistakes) == 1
    entry = mistakes[0]
    assert entry["surah"] == 2
    assert entry["surah_name"] == "البقرة"
    assert entry["ayah"] == 30
    assert entry["count"] == 2
    assert entry["categories"] == ["أخطاء الحفظ"]
    # سورة 20 آية 5 مكررة أيضاً لكن فئتها itqan (sahih) - يجب ألا تظهر
    assert all((m["surah"], m["ayah"]) != (20, 5) for m in mistakes)


def test_student_stats_respects_teacher_visibility(client, db_session):
    sc = _seed_rich_scenario(db_session)

    _login(client, "stats_teacher2", "Password123!")
    resp = client.get(f"/api/students/{sc.student1.id}/stats")
    assert resp.status_code == 404  # طالب حلقة معلم آخر

    _login_as_admin(client)
    resp = client.get(f"/api/students/{sc.student1.id}/stats")
    assert resp.status_code == 200


def test_student_stats_student_role_forbidden(client, db_session):
    _create_user(db_session, username="stats_plain_student", password="Password123!", role=UserRole.student)
    sc = _seed_rich_scenario(db_session)

    _login(client, "stats_plain_student", "Password123!")
    resp = client.get(f"/api/students/{sc.student1.id}/stats")
    assert resp.status_code == 403


# ---------------------------------------------------------------------------
# إحصائيات لوحة التحكم
# ---------------------------------------------------------------------------


def test_dashboard_totals_and_groups_summary_admin_no_filters(client, db_session):
    sc = _seed_rich_scenario(db_session)
    _login_as_admin(client)

    resp = client.get("/api/dashboard/stats")
    assert resp.status_code == 200
    body = resp.json()

    all_grades = [95.5, 88.0, 72.25, 91.0, 65.0, 60.0, 97.0, 93.0]
    assert body["totals"]["active_students"] == 3
    assert body["totals"]["sessions"] == 9  # 4 + 2 + 1(ghaib) + 2, الملغاة مستثناة
    assert body["totals"]["notes"] == 7  # 6 لطالب1 + 1 لطالب2
    assert body["totals"]["avg_grade"] == round(sum(all_grades) / len(all_grades), 2)
    # حاضر/متأخر: 6 (طالب1+طالب2 المكتملتان بدون الغياب) + 2 (طالب3) = 8 من 9
    assert body["totals"]["attendance_rate"] == round(8 / 9 * 100, 2)

    assert sum(p["count"] for p in body["sessions_over_time"]) == 9
    assert len(body["sessions_over_time"]) == 9  # كل جلسة بيوم مختلف عمداً في السيناريو

    bucket_counts = {b["bucket"]: b["count"] for b in body["grade_distribution"]}
    assert bucket_counts == {"90-100": 4, "80-89": 1, "70-79": 1, "أقل من 70": 2}

    assert len(body["needs_attention"]) == 1  # فقط طالب1 له >= 3 جلسات مكتملة بدرجة
    assert body["needs_attention"][0]["student_id"] == str(sc.student1.id)

    groups_summary = {g["group_id"]: g for g in body["groups_summary"]}
    assert groups_summary[str(sc.group1.id)]["students"] == 2
    assert groups_summary[str(sc.group1.id)]["sessions"] == 7
    assert groups_summary[str(sc.group2.id)]["students"] == 1
    assert groups_summary[str(sc.group2.id)]["sessions"] == 2
    assert groups_summary[str(sc.group2.id)]["avg_grade"] == 95.0


def test_dashboard_group_filter_matches_scoped_subset(client, db_session):
    sc = _seed_rich_scenario(db_session)
    _login_as_admin(client)

    resp = client.get(f"/api/dashboard/stats?group_id={sc.group1.id}")
    assert resp.status_code == 200
    body = resp.json()
    assert body["totals"]["active_students"] == 2
    assert body["totals"]["sessions"] == 7
    assert body["totals"]["notes"] == 7
    assert len(body["groups_summary"]) == 1
    assert body["groups_summary"][0]["group_id"] == str(sc.group1.id)

    resp2 = client.get(f"/api/dashboard/stats?group_id={sc.group2.id}")
    body2 = resp2.json()
    assert body2["totals"]["active_students"] == 1
    assert body2["totals"]["sessions"] == 2
    assert body2["totals"]["notes"] == 0
    assert body2["totals"]["avg_grade"] == 95.0


def test_dashboard_session_type_filter_narrows_results(client, db_session):
    sc = _seed_rich_scenario(db_session)
    _login_as_admin(client)

    resp = client.get("/api/dashboard/stats?session_type=sabq")
    assert resp.status_code == 200
    body = resp.json()
    # sabq: s1_sess1, s1_sess4, s2_sess1, s2_ghaib(sabq لكنه ghaib عدد أيضاً كجلسة مكتملة), s3_sess1
    assert body["totals"]["sessions"] == 5


def test_dashboard_from_to_filter_excludes_out_of_range_sessions(client, db_session):
    sc = _seed_rich_scenario(db_session)
    _login_as_admin(client)

    from_dt = (NOW - timedelta(days=5)).isoformat()
    to_dt = NOW.isoformat()
    resp = client.get("/api/dashboard/stats", params={"from": from_dt, "to": to_dt})
    assert resp.status_code == 200
    body = resp.json()
    # ضمن آخر 5 أيام: s1_sess4(2), s2_sess2(4), s3_sess2(3) - الملغاة (1) مستثناة دوماً، الغياب(6) خارج النطاق
    assert body["totals"]["sessions"] == 3


def test_dashboard_teacher_isolation_matches_explicit_group_filter(client, db_session):
    sc = _seed_rich_scenario(db_session)

    _login_as_admin(client)
    admin_scoped = client.get(f"/api/dashboard/stats?group_id={sc.group1.id}").json()

    _login(client, "stats_teacher1", "Password123!")
    teacher_view = client.get("/api/dashboard/stats").json()  # بلا فلاتر - يُفرض نطاقه تلقائياً

    assert teacher_view["totals"] == admin_scoped["totals"]
    assert teacher_view["groups_summary"] == admin_scoped["groups_summary"]

    # teacher_id الوارد من معلم آخر يجب أن يُتجاهل تماماً
    _login(client, "stats_teacher1", "Password123!")
    ignored = client.get(f"/api/dashboard/stats?teacher_id={sc.teacher2.id}").json()
    assert ignored["totals"] == teacher_view["totals"]


def test_dashboard_student_role_forbidden(client, db_session):
    _create_user(db_session, username="dash_plain_student", password="Password123!", role=UserRole.student)
    _seed_rich_scenario(db_session)

    _login(client, "dash_plain_student", "Password123!")
    resp = client.get("/api/dashboard/stats")
    assert resp.status_code == 403
