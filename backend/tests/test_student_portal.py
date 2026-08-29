"""WP8 — حسابات دخول الطلاب وبوابة الطالب.

يغطي: إنشاء الحساب وربطه، منع الربط المزدوج ومنع تكرار اسم المستخدم، حساب
معطّل لا يدخل، دخول الطالب ورؤية بياناته فقط (me/stats/جلساته/تفاصيل/صوت
206)، وعزل صارم — مصفوفة الـ403 الكاملة لكل ما عدا مسارات القراءة الذاتية.
"""

from app.core.config import settings
from app.core.security import hash_password
from app.models.group import Group
from app.models.student import Student
from app.models.user import User, UserRole


def _create_user(db_session, *, username, password, role, is_active=True, full_name="مستخدم اختبار"):
    user = User(
        username=username.lower(),
        password_hash=hash_password(password),
        full_name=full_name,
        role=role,
        is_active=is_active,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


def _create_group(db_session, *, name, teacher_id=None, is_active=True):
    group = Group(name=name, teacher_id=teacher_id, is_active=is_active)
    db_session.add(group)
    db_session.commit()
    db_session.refresh(group)
    return group


def _create_student(db_session, *, full_name, group_id=None, is_active=True):
    student = Student(full_name=full_name, group_id=group_id, is_active=is_active)
    db_session.add(student)
    db_session.commit()
    db_session.refresh(student)
    return student


def _login_as_admin(client):
    response = client.post(
        "/api/auth/login",
        json={"username": settings.ADMIN_USERNAME, "password": settings.ADMIN_PASSWORD},
    )
    assert response.status_code == 200


def _login(client, username, password):
    response = client.post("/api/auth/login", json={"username": username, "password": password})
    assert response.status_code == 200


def _setup_teacher_with_student(db_session, *, teacher_username, student_name=None):
    teacher = _create_user(db_session, username=teacher_username, password="Password123!", role=UserRole.teacher)
    group = _create_group(db_session, name=f"حلقة {teacher_username}", teacher_id=teacher.id)
    student = _create_student(
        db_session, full_name=student_name or f"طالب {teacher_username}", group_id=group.id
    )
    return teacher, student


def _create_session(client, student_id, *, session_type="sabq", attendance="hadir", **extra):
    payload = {"student_id": str(student_id), "session_type": session_type, "attendance": attendance, **extra}
    return client.post("/api/sessions", json=payload)


def _split_bytes(data: bytes, n: int) -> list[bytes]:
    n = max(1, min(n, len(data)))
    size = len(data) // n
    parts = [data[i * size : (i + 1) * size] for i in range(n - 1)]
    parts.append(data[(n - 1) * size :])
    return parts


def _finalize_with_audio(client, session_id, audio: bytes):
    """يرفع صوتاً حقيقياً على segment=0 وينهي الجلسة — لإنتاج recording.status=ready
    كي يمكن اختبار بث الصوت (206) من بوابة الطالب."""
    parts = _split_bytes(audio, 2)
    for index, part in enumerate(parts):
        resp = client.put(f"/api/sessions/{session_id}/chunks/{index}", content=part)
        assert resp.status_code == 204
    finalize_resp = client.post(f"/api/sessions/{session_id}/finalize", json={"segments": {"0": len(parts) - 1}})
    assert finalize_resp.status_code == 200
    return finalize_resp.json()


# ---------------------------------------------------------------------------
# إنشاء الحساب وربطه
# ---------------------------------------------------------------------------


def test_admin_creates_and_links_student_account(client, db_session):
    _, student = _setup_teacher_with_student(db_session, teacher_username="acc_teacher1")
    _login_as_admin(client)

    resp = client.post(
        f"/api/students/{student.id}/account",
        json={"username": "student_acc1", "password": "StudentPass123!"},
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["account_username"] == "student_acc1"
    assert body["account_is_active"] is True
    assert body["user_id"] is not None

    # الاسم الكامل للحساب = اسم الطالب
    created_user = db_session.query(User).filter(User.username == "student_acc1").one()
    assert created_user.full_name == student.full_name
    assert created_user.role == UserRole.student

    # ينعكس في get_student وlist_students أيضاً (بلا حقول حساسة)
    detail = client.get(f"/api/students/{student.id}")
    assert detail.status_code == 200
    assert detail.json()["account_username"] == "student_acc1"
    assert "password_hash" not in detail.json()

    listing = client.get("/api/students")
    listed = next(s for s in listing.json() if s["id"] == str(student.id))
    assert listed["account_username"] == "student_acc1"


def test_supervisor_can_create_account_teacher_cannot(client, db_session):
    _create_user(db_session, username="acc_supervisor", password="Password123!", role=UserRole.supervisor)
    teacher, student = _setup_teacher_with_student(db_session, teacher_username="acc_teacher2")

    _login(client, "acc_teacher2", "Password123!")
    forbidden = client.post(
        f"/api/students/{student.id}/account", json={"username": "sneaky_acc", "password": "Password123!"}
    )
    assert forbidden.status_code == 403

    _login(client, "acc_supervisor", "Password123!")
    ok = client.post(
        f"/api/students/{student.id}/account", json={"username": "sup_created_acc", "password": "Password123!"}
    )
    assert ok.status_code == 201


def test_double_link_returns_409(client, db_session):
    _, student = _setup_teacher_with_student(db_session, teacher_username="acc_teacher3")
    _login_as_admin(client)

    first = client.post(
        f"/api/students/{student.id}/account", json={"username": "double_acc", "password": "Password123!"}
    )
    assert first.status_code == 201

    second = client.post(
        f"/api/students/{student.id}/account", json={"username": "double_acc_2", "password": "Password123!"}
    )
    assert second.status_code == 409
    assert "مربوط" in second.json()["detail"]


def test_duplicate_username_returns_409(client, db_session):
    _, student1 = _setup_teacher_with_student(db_session, teacher_username="acc_teacher4")
    _, student2 = _setup_teacher_with_student(db_session, teacher_username="acc_teacher5")
    _login_as_admin(client)

    first = client.post(
        f"/api/students/{student1.id}/account", json={"username": "shared_username", "password": "Password123!"}
    )
    assert first.status_code == 201

    second = client.post(
        f"/api/students/{student2.id}/account", json={"username": "shared_username", "password": "Password123!"}
    )
    assert second.status_code == 409
    assert "مستخدم" in second.json()["detail"]


def test_disabled_student_account_cannot_login(client, db_session):
    _, student = _setup_teacher_with_student(db_session, teacher_username="acc_teacher6")
    _login_as_admin(client)

    create_resp = client.post(
        f"/api/students/{student.id}/account", json={"username": "disabled_acc", "password": "Password123!"}
    )
    user_id = create_resp.json()["user_id"]

    disable_resp = client.patch(f"/api/users/{user_id}", json={"is_active": False})
    assert disable_resp.status_code == 200

    login_resp = client.post("/api/auth/login", json={"username": "disabled_acc", "password": "Password123!"})
    assert login_resp.status_code == 401

    detail_resp = client.get(f"/api/students/{student.id}")
    assert detail_resp.status_code == 200
    assert detail_resp.json()["account_is_active"] is False


# ---------------------------------------------------------------------------
# دخول الطالب ورؤية بياناته
# ---------------------------------------------------------------------------


def test_student_without_linked_record_gets_404_on_me(client, db_session):
    _create_user(db_session, username="unlinked_student", password="Password123!", role=UserRole.student)
    _login(client, "unlinked_student", "Password123!")

    me_resp = client.get("/api/students/me")
    assert me_resp.status_code == 404
    assert "طالب" in me_resp.json()["detail"]

    stats_resp = client.get("/api/students/me/stats")
    assert stats_resp.status_code == 404

    # قائمة الجلسات لا تُخفق - فارغة فقط، بلا تسريب أو خطأ.
    sessions_resp = client.get("/api/sessions")
    assert sessions_resp.status_code == 200
    assert sessions_resp.json() == []


def test_student_sees_own_data_me_stats_sessions_detail_and_audio(client, db_session, make_webm_audio):
    teacher, student = _setup_teacher_with_student(
        db_session, teacher_username="portal_teacher", student_name="طالب البوابة"
    )
    _login(client, "portal_teacher", "Password123!")
    session_id = _create_session(client, student.id).json()["id"]
    audio = make_webm_audio(0.5)
    finalized = _finalize_with_audio(client, session_id, audio)
    assert finalized["recording"]["status"] == "ready"

    _login_as_admin(client)
    account_resp = client.post(
        f"/api/students/{student.id}/account", json={"username": "portal_student", "password": "Password123!"}
    )
    assert account_resp.status_code == 201

    _login(client, "portal_student", "Password123!")

    me_resp = client.get("/api/students/me")
    assert me_resp.status_code == 200
    assert me_resp.json()["id"] == str(student.id)
    assert me_resp.json()["full_name"] == "طالب البوابة"

    stats_resp = client.get("/api/students/me/stats")
    assert stats_resp.status_code == 200
    stats_body = stats_resp.json()
    assert stats_body["totals"]["sessions"] == 1

    list_resp = client.get("/api/sessions")
    assert list_resp.status_code == 200
    ids = [s["id"] for s in list_resp.json()]
    assert session_id in ids

    detail_resp = client.get(f"/api/sessions/{session_id}")
    assert detail_resp.status_code == 200
    assert detail_resp.json()["student_id"] == str(student.id)

    audio_resp = client.get(f"/api/sessions/{session_id}/audio", headers={"Range": "bytes=0-9"})
    assert audio_resp.status_code == 206
    assert audio_resp.headers["Accept-Ranges"] == "bytes"


def test_strict_isolation_between_students(client, db_session, make_webm_audio):
    teacher1, student1 = _setup_teacher_with_student(
        db_session, teacher_username="iso_teacher1", student_name="طالب أول"
    )
    teacher2, student2 = _setup_teacher_with_student(
        db_session, teacher_username="iso_teacher2", student_name="طالب ثانٍ"
    )

    _login(client, "iso_teacher2", "Password123!")
    other_session_id = _create_session(client, student2.id).json()["id"]
    audio = make_webm_audio(0.3)
    _finalize_with_audio(client, other_session_id, audio)

    _login_as_admin(client)
    client.post(f"/api/students/{student1.id}/account", json={"username": "iso_student1", "password": "Password123!"})
    client.post(f"/api/students/{student2.id}/account", json={"username": "iso_student2", "password": "Password123!"})

    _login(client, "iso_student1", "Password123!")

    results = {}

    # جلسة طالب آخر: تفاصيلها وصوتها 404 لا تسريب
    results["other_session_detail"] = client.get(f"/api/sessions/{other_session_id}").status_code
    results["other_session_audio"] = client.get(f"/api/sessions/{other_session_id}/audio").status_code

    # قائمة الجلسات لا تحتوي جلسة الطالب الآخر إطلاقاً
    listing = client.get("/api/sessions").json()
    results["other_session_in_list"] = other_session_id in [s["id"] for s in listing]

    # ملف الطالب الآخر عبر مسار الإدارة (مصرّح فقط للطاقم) — 403
    results["other_student_detail"] = client.get(f"/api/students/{student2.id}").status_code
    results["other_student_stats"] = client.get(f"/api/students/{student2.id}/stats").status_code

    # POST ملاحظة على جلسة طالب آخر — 403 (الدور ممنوع من الكتابة أصلاً)
    results["note_on_other_session"] = client.post(
        f"/api/sessions/{other_session_id}/notes",
        json={"category_id": "00000000-0000-0000-0000-000000000000"},
    ).status_code

    print("WP8 isolation check results:", results)

    assert results["other_session_detail"] == 404
    assert results["other_session_audio"] == 404
    assert results["other_session_in_list"] is False
    assert results["other_student_detail"] == 403
    assert results["other_student_stats"] == 403
    assert results["note_on_other_session"] == 403


# ---------------------------------------------------------------------------
# مصفوفة الـ403 الكاملة لدور student
# ---------------------------------------------------------------------------


def test_student_role_full_403_matrix(client, db_session, make_webm_audio):
    teacher, student = _setup_teacher_with_student(db_session, teacher_username="matrix_teacher")
    _login(client, "matrix_teacher", "Password123!")
    session_id = _create_session(client, student.id).json()["id"]
    audio = make_webm_audio(0.3)
    _finalize_with_audio(client, session_id, audio)

    _login_as_admin(client)
    client.post(f"/api/students/{student.id}/account", json={"username": "matrix_student", "password": "Password123!"})

    _login(client, "matrix_student", "Password123!")

    checks: list[tuple[str, int]] = []

    def check(label, response):
        checks.append((label, response.status_code))

    # جلسات: كتابة/تعديل ممنوعة كلها
    check("create_session", _create_session(client, student.id))
    check("patch_session", client.patch(f"/api/sessions/{session_id}", json={"summary": "محاولة"}))
    check("cancel_session", client.post(f"/api/sessions/{session_id}/cancel"))
    check("upload_chunk", client.put(f"/api/sessions/{session_id}/chunks/0", content=b"x"))
    check("finalize_session", client.post(f"/api/sessions/{session_id}/finalize", json={"segments": {"0": 0}}))
    check("active_session", client.get("/api/sessions/active"))

    # ملاحظات
    fake_category = "00000000-0000-0000-0000-000000000000"
    check("create_note", client.post(f"/api/sessions/{session_id}/notes", json={"category_id": fake_category}))
    check("update_note", client.patch(f"/api/notes/{fake_category}", json={"text": "محاولة"}))
    check("delete_note", client.delete(f"/api/notes/{fake_category}"))

    # طلاب/حلقات/مستخدمون
    check("list_students", client.get("/api/students"))
    check("create_student", client.post("/api/students", json={"full_name": "محاولة"}))
    check("patch_student", client.patch(f"/api/students/{student.id}", json={"full_name": "محاولة"}))
    check(
        "create_account",
        client.post(f"/api/students/{student.id}/account", json={"username": "abcdef", "password": "Password123!"}),
    )
    check("list_groups", client.get("/api/groups"))
    check("create_group", client.post("/api/groups", json={"name": "محاولة"}))
    check("list_users", client.get("/api/users"))
    check(
        "create_user",
        client.post(
            "/api/users",
            json={"username": "abcdef", "password": "Password123!", "full_name": "x", "role": "student"},
        ),
    )

    # سلّم التقييم/لوحة التحكم يبقيان محجوبين
    check("rubric", client.get("/api/rubric"))
    check("dashboard", client.get("/api/dashboard/stats"))

    print("WP8 student 403 matrix:", checks)

    for label, status_code in checks:
        assert status_code == 403, f"{label} expected 403, got {status_code}"

    # مرجعان عامان غير حساسين متاحان للطالب قراءةً (لعرض تصنيفات ملاحظاته
    # وأسماء السور في بوابته) — والنشط فقط: include_inactive لا يُفعَّل لغير الإدارة
    taxonomy = client.get("/api/taxonomy?include_inactive=true")
    assert taxonomy.status_code == 200
    assert all(c["is_active"] for c in taxonomy.json()["categories"])
    surahs = client.get("/api/quran/surahs")
    assert surahs.status_code == 200
    assert len(surahs.json()) == 114
