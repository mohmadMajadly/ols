import subprocess
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


def _split_bytes(data: bytes, n: int) -> list[bytes]:
    """يقسّم data إلى n قطعة متتالية بالترتيب (يحاكي chunks MediaRecorder)."""
    n = max(1, min(n, len(data)))
    size = len(data) // n
    parts = [data[i * size : (i + 1) * size] for i in range(n - 1)]
    parts.append(data[(n - 1) * size :])
    return parts


def _upload_segment(client, session_id, data: bytes, *, segment=0, n=3):
    """يرفع data كـ n مقاطع (chunks) متتالية على segment معيّن، ويعيد
    last_chunk_index المستخدم."""
    parts = _split_bytes(data, n)
    for index, part in enumerate(parts):
        resp = client.put(
            f"/api/sessions/{session_id}/chunks/{index}", content=part, params={"segment": segment}
        )
        assert resp.status_code == 204
    return len(parts) - 1


def test_full_session_lifecycle_merges_chunks_in_order_and_cleans_up(client, db_session, make_webm_audio):
    teacher, student = _setup_teacher_with_student(db_session, teacher_username="life_teacher")
    _login(client, "life_teacher", "Password123!")

    create_resp = _create_session(client, student.id)
    assert create_resp.status_code == 201
    session_id = create_resp.json()["id"]
    assert create_resp.json()["status"] == "recording"

    audio = make_webm_audio(1.0)
    last_index = _upload_segment(client, session_id, audio, segment=0, n=3)

    finalize_resp = client.post(f"/api/sessions/{session_id}/finalize", json={"segments": {"0": last_index}})
    assert finalize_resp.status_code == 200
    body = finalize_resp.json()
    assert body["status"] == "completed"
    assert body["recording"]["status"] == "ready"
    assert body["recording"]["size_bytes"] > 0
    assert body["recording"]["duration_ms"] is not None
    assert 700 <= body["recording"]["duration_ms"] <= 1300

    media_root = Path(settings.MEDIA_ROOT)
    session_dir = media_root / "recordings" / session_id
    recording_path = session_dir / "recording.webm"
    assert recording_path.exists()
    assert recording_path.stat().st_size == body["recording"]["size_bytes"]
    # كل الملفات الوسيطة (parts وseg files) حُذفت، لا يبقى إلا recording.webm
    assert [p.name for p in session_dir.iterdir()] == ["recording.webm"]


def test_chunk_gap_returns_409_with_missing_index_then_succeeds(client, db_session, make_webm_audio):
    teacher, student = _setup_teacher_with_student(db_session, teacher_username="gap_teacher")
    _login(client, "gap_teacher", "Password123!")
    session_id = _create_session(client, student.id).json()["id"]

    audio = make_webm_audio(0.5)
    parts = _split_bytes(audio, 3)
    assert client.put(f"/api/sessions/{session_id}/chunks/0", content=parts[0]).status_code == 204
    assert client.put(f"/api/sessions/{session_id}/chunks/2", content=parts[2]).status_code == 204

    gap_resp = client.post(f"/api/sessions/{session_id}/finalize", json={"segments": {"0": 2}})
    assert gap_resp.status_code == 409
    assert gap_resp.json()["detail"]["missing"] == {"0": [1]}

    assert client.put(f"/api/sessions/{session_id}/chunks/1", content=parts[1]).status_code == 204
    ok_resp = client.post(f"/api/sessions/{session_id}/finalize", json={"segments": {"0": 2}})
    assert ok_resp.status_code == 200
    assert ok_resp.json()["status"] == "completed"


def test_finalize_gap_in_second_segment_returns_409_naming_segment_and_index(
    client, db_session, make_webm_audio
):
    teacher, student = _setup_teacher_with_student(db_session, teacher_username="gap2_teacher")
    _login(client, "gap2_teacher", "Password123!")
    session_id = _create_session(client, student.id).json()["id"]

    seg0_audio = make_webm_audio(0.3, frequency=440)
    _upload_segment(client, session_id, seg0_audio, segment=0, n=2)

    seg1_audio = make_webm_audio(0.3, frequency=550)
    seg1_parts = _split_bytes(seg1_audio, 3)
    assert client.put(
        f"/api/sessions/{session_id}/chunks/0", content=seg1_parts[0], params={"segment": 1}
    ).status_code == 204
    # فهرس 1 مفقود عمداً على segment=1
    assert client.put(
        f"/api/sessions/{session_id}/chunks/2", content=seg1_parts[2], params={"segment": 1}
    ).status_code == 204

    resp = client.post(f"/api/sessions/{session_id}/finalize", json={"segments": {"0": 1, "1": 2}})
    assert resp.status_code == 409
    assert resp.json()["detail"]["missing"] == {"1": [1]}


def test_finalize_segment_on_disk_not_declared_returns_409(client, db_session, make_webm_audio):
    teacher, student = _setup_teacher_with_student(db_session, teacher_username="undeclared_teacher")
    _login(client, "undeclared_teacher", "Password123!")
    session_id = _create_session(client, student.id).json()["id"]

    seg0_audio = make_webm_audio(0.3)
    _upload_segment(client, session_id, seg0_audio, segment=0, n=1)
    seg1_audio = make_webm_audio(0.3, frequency=660)
    _upload_segment(client, session_id, seg1_audio, segment=1, n=1)

    # segment=1 موجود فعلياً على القرص لكن غير مذكور في الجسم
    resp = client.post(f"/api/sessions/{session_id}/finalize", json={"segments": {"0": 0}})
    assert resp.status_code == 409
    assert resp.json()["detail"]["unexpected_segments"] == [1]


def test_finalize_two_segments_real_audio_produces_correct_duration(client, db_session, make_webm_audio):
    teacher, student = _setup_teacher_with_student(db_session, teacher_username="twoseg_teacher")
    _login(client, "twoseg_teacher", "Password123!")
    session_id = _create_session(client, student.id).json()["id"]

    seg0_audio = make_webm_audio(2.0, frequency=440)
    last0 = _upload_segment(client, session_id, seg0_audio, segment=0, n=3)
    seg1_audio = make_webm_audio(2.0, frequency=880)
    last1 = _upload_segment(client, session_id, seg1_audio, segment=1, n=2)

    finalize_resp = client.post(
        f"/api/sessions/{session_id}/finalize", json={"segments": {"0": last0, "1": last1}}
    )
    assert finalize_resp.status_code == 200
    body = finalize_resp.json()
    assert body["status"] == "completed"
    assert body["recording"]["status"] == "ready"
    duration_ms = body["recording"]["duration_ms"]
    assert duration_ms is not None
    assert 3500 <= duration_ms <= 4500

    media_root = Path(settings.MEDIA_ROOT)
    recording_path = media_root / "recordings" / session_id / "recording.webm"
    assert recording_path.exists()

    probe = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            str(recording_path),
        ],
        capture_output=True,
        timeout=30,
    )
    assert probe.returncode == 0, probe.stderr.decode("utf-8", errors="replace")
    probed_seconds = float(probe.stdout.decode("utf-8").strip())
    assert 3.5 <= probed_seconds <= 4.5

    range_resp = client.get(f"/api/sessions/{session_id}/audio", headers={"Range": "bytes=0-99"})
    assert range_resp.status_code == 206
    assert range_resp.headers["Accept-Ranges"] == "bytes"


def test_chunk_reupload_is_idempotent(client, db_session, make_webm_audio):
    teacher, student = _setup_teacher_with_student(db_session, teacher_username="idem_teacher")
    _login(client, "idem_teacher", "Password123!")
    session_id = _create_session(client, student.id).json()["id"]

    # الرفع الأول بيانات غير صالحة كملف webm (ffmpeg سيرفضها إن بقيت)؛
    # إعادة الرفع لنفس الفهرس يجب أن تستبدلها بالكامل ببيانات صوت صحيحة -
    # نجاح finalize لاحقاً هو دليل الاستبدال (لولاه لفشل ffmpeg بخطأ 500).
    client.put(f"/api/sessions/{session_id}/chunks/0", content=b"OLD-NOT-VALID-WEBM-DATA")
    audio = make_webm_audio(0.3)
    client.put(f"/api/sessions/{session_id}/chunks/0", content=audio)

    finalize_resp = client.post(f"/api/sessions/{session_id}/finalize", json={"segments": {"0": 0}})
    assert finalize_resp.status_code == 200
    media_root = Path(settings.MEDIA_ROOT)
    recording_path = media_root / "recordings" / session_id / "recording.webm"
    assert recording_path.exists()
    assert recording_path.stat().st_size > 0


def test_finalize_with_invalid_audio_data_returns_500_and_marks_recording_failed(client, db_session):
    teacher, student = _setup_teacher_with_student(db_session, teacher_username="badaudio_teacher")
    _login(client, "badaudio_teacher", "Password123!")
    session_id = _create_session(client, student.id).json()["id"]

    # بيانات غير صالحة كملف webm إطلاقاً - ffmpeg سيرفض فتحها كمدخل.
    client.put(f"/api/sessions/{session_id}/chunks/0", content=b"NOT-A-VALID-WEBM-FILE-AT-ALL")

    resp = client.post(f"/api/sessions/{session_id}/finalize", json={"segments": {"0": 0}})
    assert resp.status_code == 500
    assert "detail" in resp.json()

    # الجلسة تبقى قيد التسجيل (finalize لم يُنهِها)، لكن التسجيل يُعلَّم فاشلاً.
    detail = client.get(f"/api/sessions/{session_id}").json()
    assert detail["recording"]["status"] == "failed"


def test_active_session_reports_uploaded_indices_by_segment_for_resume(client, db_session):
    teacher, student = _setup_teacher_with_student(db_session, teacher_username="resume_teacher")
    _login(client, "resume_teacher", "Password123!")
    session_id = _create_session(client, student.id).json()["id"]

    client.put(f"/api/sessions/{session_id}/chunks/0", content=b"AAA", params={"segment": 0})
    client.put(f"/api/sessions/{session_id}/chunks/1", content=b"BBB", params={"segment": 0})
    client.put(f"/api/sessions/{session_id}/chunks/0", content=b"CCC", params={"segment": 1})

    active_resp = client.get("/api/sessions/active")
    assert active_resp.status_code == 200
    body = active_resp.json()
    assert body["session"]["id"] == session_id
    assert body["uploaded"] == {"0": [0, 1], "1": [0]}


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


def test_finalize_generates_waveform_from_real_audio_and_exposes_it_in_session_detail(
    client, db_session, make_webm_audio
):
    teacher, student = _setup_teacher_with_student(db_session, teacher_username="waveform_teacher")
    _login(client, "waveform_teacher", "Password123!")
    session_id = _create_session(client, student.id).json()["id"]

    audio = make_webm_audio(1.5)
    last_index = _upload_segment(client, session_id, audio, segment=0, n=2)

    finalize_resp = client.post(f"/api/sessions/{session_id}/finalize", json={"segments": {"0": last_index}})
    assert finalize_resp.status_code == 200
    waveform = finalize_resp.json()["recording"]["waveform"]
    assert waveform is not None
    assert 0 < len(waveform) <= 800
    assert all(isinstance(v, int) and 0 <= v <= 100 for v in waveform)
    # صوت جيبي (sine) بمطال ثابت تقريباً - يجب ألا تكون كل القمم صفراً
    assert any(v > 0 for v in waveform)

    detail_resp = client.get(f"/api/sessions/{session_id}")
    assert detail_resp.status_code == 200
    assert detail_resp.json()["recording"]["waveform"] == waveform
    assert detail_resp.json()["recording"]["duration_ms"] is not None


def test_audio_range_request_returns_206_with_correct_bytes(client, db_session, make_webm_audio):
    teacher, student = _setup_teacher_with_student(db_session, teacher_username="stream_teacher")
    _login(client, "stream_teacher", "Password123!")
    session_id = _create_session(client, student.id).json()["id"]

    audio = make_webm_audio(0.5)
    client.put(f"/api/sessions/{session_id}/chunks/0", content=audio)
    finalize_resp = client.post(f"/api/sessions/{session_id}/finalize", json={"segments": {"0": 0}})
    assert finalize_resp.status_code == 200

    full_resp = client.get(f"/api/sessions/{session_id}/audio")
    assert full_resp.status_code == 200
    full_content = full_resp.content
    assert len(full_content) > 20

    range_resp = client.get(f"/api/sessions/{session_id}/audio", headers={"Range": "bytes=2-5"})
    assert range_resp.status_code == 206
    assert range_resp.headers["Content-Range"] == f"bytes 2-5/{len(full_content)}"
    assert range_resp.headers["Accept-Ranges"] == "bytes"
    assert range_resp.content == full_content[2:6]
