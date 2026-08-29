from pathlib import Path

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


def _setup_teacher_with_student(db_session, *, teacher_username):
    teacher = _create_user(db_session, username=teacher_username, password="Password123!", role=UserRole.teacher)
    group = _create_group(db_session, name=f"حلقة {teacher_username}", teacher_id=teacher.id)
    student = _create_student(db_session, full_name=f"طالب {teacher_username}", group_id=group.id)
    return teacher, student


def _create_session(client, student_id, *, session_type="sabq", attendance="hadir", **extra):
    payload = {"student_id": str(student_id), "session_type": session_type, "attendance": attendance, **extra}
    return client.post("/api/sessions", json=payload)


def test_full_session_lifecycle_merges_chunks_in_order_and_cleans_up(client, db_session):
    teacher, student = _setup_teacher_with_student(db_session, teacher_username="life_teacher")
    _login(client, "life_teacher", "Password123!")

    create_resp = _create_session(client, student.id)
    assert create_resp.status_code == 201
    session_id = create_resp.json()["id"]
    assert create_resp.json()["status"] == "recording"

    chunks = [b"AAA", b"BBB", b"CCC"]
    for index, data in enumerate(chunks):
        upload_resp = client.put(f"/api/sessions/{session_id}/chunks/{index}", content=data)
        assert upload_resp.status_code == 204

    finalize_resp = client.post(
        f"/api/sessions/{session_id}/finalize", json={"last_chunk_index": 2, "duration_ms": 12345}
    )
    assert finalize_resp.status_code == 200
    body = finalize_resp.json()
    assert body["status"] == "completed"
    assert body["recording"]["status"] == "ready"
    assert body["recording"]["size_bytes"] == len(b"AAABBBCCC")

    media_root = Path(settings.MEDIA_ROOT)
    session_dir = media_root / "recordings" / session_id
    recording_path = session_dir / "recording.webm"
    assert recording_path.read_bytes() == b"AAABBBCCC"
    assert not any(p.name.startswith("chunk_") for p in session_dir.iterdir())


def test_chunk_gap_returns_409_with_missing_index_then_succeeds(client, db_session):
    teacher, student = _setup_teacher_with_student(db_session, teacher_username="gap_teacher")
    _login(client, "gap_teacher", "Password123!")
    session_id = _create_session(client, student.id).json()["id"]

    assert client.put(f"/api/sessions/{session_id}/chunks/0", content=b"AAA").status_code == 204
    assert client.put(f"/api/sessions/{session_id}/chunks/2", content=b"CCC").status_code == 204

    gap_resp = client.post(
        f"/api/sessions/{session_id}/finalize", json={"last_chunk_index": 2, "duration_ms": 1000}
    )
    assert gap_resp.status_code == 409
    assert gap_resp.json()["detail"]["missing_indices"] == [1]

    assert client.put(f"/api/sessions/{session_id}/chunks/1", content=b"BBB").status_code == 204
    ok_resp = client.post(
        f"/api/sessions/{session_id}/finalize", json={"last_chunk_index": 2, "duration_ms": 1000}
    )
    assert ok_resp.status_code == 200
    assert ok_resp.json()["status"] == "completed"


def test_chunk_reupload_is_idempotent(client, db_session):
    teacher, student = _setup_teacher_with_student(db_session, teacher_username="idem_teacher")
    _login(client, "idem_teacher", "Password123!")
    session_id = _create_session(client, student.id).json()["id"]

    client.put(f"/api/sessions/{session_id}/chunks/0", content=b"OLD-DATA")
    client.put(f"/api/sessions/{session_id}/chunks/0", content=b"NEW")

    finalize_resp = client.post(
        f"/api/sessions/{session_id}/finalize", json={"last_chunk_index": 0, "duration_ms": 10}
    )
    assert finalize_resp.status_code == 200
    media_root = Path(settings.MEDIA_ROOT)
    recording_path = media_root / "recordings" / session_id / "recording.webm"
    assert recording_path.read_bytes() == b"NEW"


def test_active_session_reports_uploaded_chunk_indices_for_resume(client, db_session):
    teacher, student = _setup_teacher_with_student(db_session, teacher_username="resume_teacher")
    _login(client, "resume_teacher", "Password123!")
    session_id = _create_session(client, student.id).json()["id"]

    client.put(f"/api/sessions/{session_id}/chunks/0", content=b"AAA")
    client.put(f"/api/sessions/{session_id}/chunks/1", content=b"BBB")

    active_resp = client.get("/api/sessions/active")
    assert active_resp.status_code == 200
    body = active_resp.json()
    assert body["session"]["id"] == session_id
    assert sorted(body["uploaded_chunk_indices"]) == [0, 1]


def test_cannot_create_second_recording_session_for_same_teacher(client, db_session):
    teacher, student = _setup_teacher_with_student(db_session, teacher_username="double_teacher")
    student2 = _create_student(db_session, full_name="طالب آخر لنفس المعلم", group_id=student.group_id)
    _login(client, "double_teacher", "Password123!")

    first_resp = _create_session(client, student.id)
    assert first_resp.status_code == 201

    second_resp = _create_session(client, student2.id)
    assert second_resp.status_code == 409


def test_ghaib_attendance_creates_completed_session_without_recording(client, db_session):
    teacher, student = _setup_teacher_with_student(db_session, teacher_username="ghaib_teacher")
    _login(client, "ghaib_teacher", "Password123!")

    resp = _create_session(client, student.id, attendance="ghaib")
    assert resp.status_code == 201
    body = resp.json()
    assert body["status"] == "completed"
    assert body["attendance"] == "ghaib"
    assert body["recording"] is None

    # الغياب لا يمنع بدء جلسة تسجيل فعلية بعده لنفس المعلم
    other_student = _create_student(db_session, full_name="طالب حاضر", group_id=student.group_id)
    second_resp = _create_session(client, other_student.id)
    assert second_resp.status_code == 201


def test_other_teacher_cannot_see_session_or_add_notes_admin_can(client, db_session):
    teacher1, student1 = _setup_teacher_with_student(db_session, teacher_username="rbac_teacher1")
    _create_user(db_session, username="rbac_teacher2", password="Password123!", role=UserRole.teacher)

    _login(client, "rbac_teacher1", "Password123!")
    session_id = _create_session(client, student1.id).json()["id"]

    _login(client, "rbac_teacher2", "Password123!")
    get_resp = client.get(f"/api/sessions/{session_id}")
    assert get_resp.status_code == 404

    taxonomy = client.get("/api/taxonomy").json()
    category_id = next(c["id"] for c in taxonomy["categories"] if c["key"] == "hifz")
    note_resp = client.post(f"/api/sessions/{session_id}/notes", json={"category_id": category_id})
    assert note_resp.status_code == 404

    _login_as_admin(client)
    admin_get_resp = client.get(f"/api/sessions/{session_id}")
    assert admin_get_resp.status_code == 200


def test_chunk_over_max_size_rejected_with_413(client, db_session):
    teacher, student = _setup_teacher_with_student(db_session, teacher_username="oversize_teacher")
    _login(client, "oversize_teacher", "Password123!")
    session_id = _create_session(client, student.id).json()["id"]

    oversized = b"x" * (10 * 1024 * 1024 + 1)
    resp = client.put(f"/api/sessions/{session_id}/chunks/0", content=oversized)
    assert resp.status_code == 413


def test_student_role_forbidden_on_sessions_endpoints(client, db_session):
    _create_user(db_session, username="sess_student", password="Password123!", role=UserRole.student)
    _login(client, "sess_student", "Password123!")

    assert client.get("/api/sessions").status_code == 403
    assert client.get("/api/sessions/active").status_code == 403


def test_audio_range_request_returns_206_with_correct_bytes(client, db_session):
    teacher, student = _setup_teacher_with_student(db_session, teacher_username="stream_teacher")
    _login(client, "stream_teacher", "Password123!")
    session_id = _create_session(client, student.id).json()["id"]

    client.put(f"/api/sessions/{session_id}/chunks/0", content=b"0123456789")
    finalize_resp = client.post(
        f"/api/sessions/{session_id}/finalize", json={"last_chunk_index": 0, "duration_ms": 500}
    )
    assert finalize_resp.status_code == 200

    full_resp = client.get(f"/api/sessions/{session_id}/audio")
    assert full_resp.status_code == 200
    assert full_resp.content == b"0123456789"

    range_resp = client.get(f"/api/sessions/{session_id}/audio", headers={"Range": "bytes=2-5"})
    assert range_resp.status_code == 206
    assert range_resp.headers["Content-Range"] == "bytes 2-5/10"
    assert range_resp.headers["Accept-Ranges"] == "bytes"
    assert range_resp.content == b"2345"
