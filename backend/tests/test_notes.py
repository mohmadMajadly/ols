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


def _login(client, username, password):
    response = client.post("/api/auth/login", json={"username": username, "password": password})
    assert response.status_code == 200


def _setup_teacher_with_student(db_session, *, teacher_username):
    teacher = _create_user(db_session, username=teacher_username, password="Password123!", role=UserRole.teacher)
    group = _create_group(db_session, name=f"حلقة {teacher_username}", teacher_id=teacher.id)
    student = _create_student(db_session, full_name=f"طالب {teacher_username}", group_id=group.id)
    return teacher, student


def _create_session(client, student_id):
    payload = {"student_id": str(student_id), "session_type": "sabq", "attendance": "hadir"}
    resp = client.post("/api/sessions", json=payload)
    assert resp.status_code == 201
    return resp.json()["id"]


def _get_category_id(client, key):
    taxonomy = client.get("/api/taxonomy").json()
    return next(c["id"] for c in taxonomy["categories"] if c["key"] == key)


def _get_subtype_id(client, category_key):
    taxonomy = client.get("/api/taxonomy").json()
    category = next(c for c in taxonomy["categories"] if c["key"] == category_key)
    return category["subtypes"][0]["id"]


def test_note_rejects_ayah_out_of_surah_range(client, db_session):
    _, student = _setup_teacher_with_student(db_session, teacher_username="note_teacher1")
    _login(client, "note_teacher1", "Password123!")
    session_id = _create_session(client, student.id)
    category_id = _get_category_id(client, "hifz")

    resp = client.post(
        f"/api/sessions/{session_id}/notes",
        json={"category_id": category_id, "surah": 1, "ayah": 8},  # الفاتحة 7 آيات فقط
    )
    assert resp.status_code == 400


def test_note_rejects_subtype_from_different_category(client, db_session):
    _, student = _setup_teacher_with_student(db_session, teacher_username="note_teacher2")
    _login(client, "note_teacher2", "Password123!")
    session_id = _create_session(client, student.id)

    hifz_id = _get_category_id(client, "hifz")
    tajwid_subtype_id = _get_subtype_id(client, "tajwid")

    resp = client.post(
        f"/api/sessions/{session_id}/notes",
        json={"category_id": hifz_id, "subtype_id": tajwid_subtype_id},
    )
    assert resp.status_code == 400


def test_note_rejects_unknown_extra_field_key(client, db_session):
    _, student = _setup_teacher_with_student(db_session, teacher_username="note_teacher3")
    _login(client, "note_teacher3", "Password123!")
    session_id = _create_session(client, student.id)
    category_id = _get_category_id(client, "hifz")

    resp = client.post(
        f"/api/sessions/{session_id}/notes",
        json={"category_id": category_id, "extra": {"00000000-0000-0000-0000-000000000000": "قيمة"}},
    )
    assert resp.status_code == 400


def test_note_accepts_valid_payload_and_timed_ordering(client, db_session):
    _, student = _setup_teacher_with_student(db_session, teacher_username="note_teacher4")
    _login(client, "note_teacher4", "Password123!")
    session_id = _create_session(client, student.id)
    category_id = _get_category_id(client, "hifz")

    general_note = client.post(f"/api/sessions/{session_id}/notes", json={"category_id": category_id})
    assert general_note.status_code == 201

    timed_note = client.post(
        f"/api/sessions/{session_id}/notes",
        json={"category_id": category_id, "timestamp_ms": 5000, "surah": 2, "ayah": 10},
    )
    assert timed_note.status_code == 201

    detail = client.get(f"/api/sessions/{session_id}").json()
    notes = detail["notes"]
    assert len(notes) == 2
    # العامة (timestamp_ms=None) أولاً
    assert notes[0]["timestamp_ms"] is None
    assert notes[1]["timestamp_ms"] == 5000


def _setup_completed_session_with_deducting_note(client, db_session, *, teacher_username):
    _, student = _setup_teacher_with_student(db_session, teacher_username=teacher_username)
    _login(client, teacher_username, "Password123!")
    session_id = _create_session(client, student.id)

    category_id = _get_category_id(client, "hifz")
    note_resp = client.post(
        f"/api/sessions/{session_id}/notes",
        json={"category_id": category_id, "correction_mode": "talqin"},
    )
    assert note_resp.status_code == 201
    note_id = note_resp.json()["id"]

    client.put(f"/api/sessions/{session_id}/chunks/0", content=b"X")
    finalize_resp = client.post(
        f"/api/sessions/{session_id}/finalize", json={"last_chunk_index": 0, "duration_ms": 100}
    )
    assert finalize_resp.status_code == 200
    # الخصم الافتراضي لـ hifz/talqin هو 1.5 -> 100 - 1.5 = 98.5
    assert finalize_resp.json()["suggested_grade"] == 98.5
    assert finalize_resp.json()["grade"] == 98.5
    return session_id, note_id


def test_recompute_grade_after_delete_updates_untouched_auto_grade(client, db_session):
    session_id, note_id = _setup_completed_session_with_deducting_note(
        client, db_session, teacher_username="grade_teacher1"
    )

    delete_resp = client.delete(f"/api/notes/{note_id}")
    assert delete_resp.status_code == 204

    detail = client.get(f"/api/sessions/{session_id}").json()
    assert detail["suggested_grade"] == 100.0
    assert detail["grade"] == 100.0


def test_recompute_grade_after_delete_leaves_manual_grade_untouched(client, db_session):
    session_id, note_id = _setup_completed_session_with_deducting_note(
        client, db_session, teacher_username="grade_teacher2"
    )

    patch_resp = client.patch(f"/api/sessions/{session_id}", json={"grade": 70})
    assert patch_resp.status_code == 200
    assert patch_resp.json()["grade"] == 70.0

    delete_resp = client.delete(f"/api/notes/{note_id}")
    assert delete_resp.status_code == 204

    detail = client.get(f"/api/sessions/{session_id}").json()
    assert detail["suggested_grade"] == 100.0
    assert detail["grade"] == 70.0
