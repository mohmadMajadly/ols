"""اختبارات وسيط التتبع الصوتي (WP9c): كلمات النطاق المتوقعة + WebSocket
الترحيل إلى خدمة asr (مُموَّهة بالكامل هنا — لا اتصال شبكي حقيقي ولا نموذج)."""

import asyncio

import app.services.asr_client as asr_client
from app.core.security import hash_password
from app.models.group import Group
from app.models.student import Student
from app.models.user import User, UserRole
from starlette.websockets import WebSocketDisconnect


def _create_user(db_session, *, username, password, role, full_name="مستخدم اختبار"):
    user = User(username=username.lower(), password_hash=hash_password(password), full_name=full_name, role=role)
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


def _create_group(db_session, *, name, teacher_id):
    group = Group(name=name, teacher_id=teacher_id)
    db_session.add(group)
    db_session.commit()
    db_session.refresh(group)
    return group


def _create_student(db_session, *, full_name, group_id):
    student = Student(full_name=full_name, group_id=group_id)
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


def _create_recording_session(client, student_id, *, range_end_ayah=7):
    resp = client.post(
        "/api/sessions",
        json={
            "student_id": str(student_id),
            "session_type": "sabq",
            "attendance": "hadir",
            "range_start_surah": 1,
            "range_start_ayah": 1,
            "range_end_surah": 1,
            "range_end_ayah": range_end_ayah,
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


# ---------- GET /api/sessions/{id}/expected-words ----------


def test_expected_words_returns_range_in_order(client, db_session):
    teacher, student = _setup_teacher_with_student(db_session, teacher_username="teacher_ew1")
    _login(client, "teacher_ew1", "Password123!")
    session = _create_recording_session(client, student.id, range_end_ayah=2)

    resp = client.get(f"/api/sessions/{session['id']}/expected-words")
    assert resp.status_code == 200, resp.text
    words = resp.json()
    assert len(words) > 4
    assert words[0] == {"surah": 1, "ayah": 1, "word": 1, "text": "بِسْمِ"}
    assert all(w["surah"] == 1 and w["ayah"] in (1, 2) for w in words)
    # لا كلمات is_ayah_marker (أرقام الآي) بين الكلمات المتوقعة
    assert all(w["text"] not in ("١", "٢") for w in words)


def test_expected_words_requires_range(client, db_session):
    teacher, student = _setup_teacher_with_student(db_session, teacher_username="teacher_ew2")
    _login(client, "teacher_ew2", "Password123!")
    resp = client.post(
        "/api/sessions", json={"student_id": str(student.id), "session_type": "sabq", "attendance": "hadir"}
    )
    assert resp.status_code == 201
    session = resp.json()

    resp = client.get(f"/api/sessions/{session['id']}/expected-words")
    assert resp.status_code == 400
    assert "نطاق" in resp.json()["detail"]


def test_expected_words_hidden_from_non_owner_teacher(client, db_session):
    teacher_a, student_a = _setup_teacher_with_student(db_session, teacher_username="teacher_ew3a")
    _create_user(db_session, username="teacher_ew3b", password="Password123!", role=UserRole.teacher)
    _login(client, "teacher_ew3a", "Password123!")
    session = _create_recording_session(client, student_a.id)

    _login(client, "teacher_ew3b", "Password123!")
    resp = client.get(f"/api/sessions/{session['id']}/expected-words")
    assert resp.status_code == 404


# ---------- WebSocket /api/sessions/{id}/track ----------


class _FakeAsrConnection:
    """يحاكي اتصال WS بخدمة asr: يسجّل ما أُرسل إليه، ويبث رسائل جاهزة عائدة
    للعميل ثم يعلَّق (بلا مزيد) حتى يُلغى — كاتصال حي بلا ردود جديدة."""

    def __init__(self, replies):
        self.sent: list[str | bytes] = []
        self._replies = list(replies)

    async def send(self, data):
        self.sent.append(data)

    def __aiter__(self):
        return self

    async def __anext__(self):
        if self._replies:
            return self._replies.pop(0)
        await asyncio.Event().wait()


class _FakeConnectAsr:
    def __init__(self, conn: _FakeAsrConnection):
        self._conn = conn

    def __call__(self, *args, **kwargs):
        return self

    async def __aenter__(self):
        return self._conn

    async def __aexit__(self, *exc_info):
        return False


def test_track_ws_rejects_unauthenticated(client, db_session):
    teacher, student = _setup_teacher_with_student(db_session, teacher_username="teacher_tw1")
    _login(client, "teacher_tw1", "Password123!")
    session = _create_recording_session(client, student.id)
    client.cookies.clear()

    import pytest

    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect(f"/api/sessions/{session['id']}/track"):
            pass


def test_track_ws_rejects_non_owner_teacher(client, db_session, monkeypatch):
    teacher_a, student_a = _setup_teacher_with_student(db_session, teacher_username="teacher_tw2a")
    _create_user(db_session, username="teacher_tw2b", password="Password123!", role=UserRole.teacher)
    _login(client, "teacher_tw2a", "Password123!")
    session = _create_recording_session(client, student_a.id)

    fake = _FakeConnectAsr(_FakeAsrConnection([]))
    monkeypatch.setattr(asr_client, "connect_asr", fake)

    _login(client, "teacher_tw2b", "Password123!")

    import pytest

    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect(f"/api/sessions/{session['id']}/track"):
            pass
    assert fake._conn.sent == []  # لم يصل حتى لمرحلة الاتصال بـasr


def test_track_ws_rejects_non_recording_session(client, db_session, monkeypatch):
    teacher, student = _setup_teacher_with_student(db_session, teacher_username="teacher_tw3")
    _login(client, "teacher_tw3", "Password123!")
    session = _create_recording_session(client, student.id)
    cancel_resp = client.post(f"/api/sessions/{session['id']}/cancel")
    assert cancel_resp.status_code == 200

    fake = _FakeConnectAsr(_FakeAsrConnection([]))
    monkeypatch.setattr(asr_client, "connect_asr", fake)

    import pytest

    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect(f"/api/sessions/{session['id']}/track"):
            pass
    assert fake._conn.sent == []


def test_track_ws_relays_init_and_position(client, db_session, monkeypatch):
    teacher, student = _setup_teacher_with_student(db_session, teacher_username="teacher_tw4")
    _login(client, "teacher_tw4", "Password123!")
    session = _create_recording_session(client, student.id)

    position_msg = '{"type":"position","surah":1,"ayah":1,"word":1,"position":0,"confidence":0.9}'
    fake_conn = _FakeAsrConnection([position_msg])
    fake = _FakeConnectAsr(fake_conn)
    monkeypatch.setattr(asr_client, "connect_asr", fake)

    with client.websocket_connect(f"/api/sessions/{session['id']}/track") as ws:
        received = ws.receive_text()
        assert received == position_msg
        ws.send_bytes(b"\x00\x01\x02\x03")

    # أول رسالة أُرسلت لـasr هي init بكلمات النطاق المتوقعة
    assert len(fake_conn.sent) >= 1
    import json

    init_payload = json.loads(fake_conn.sent[0])
    assert init_payload["type"] == "init"
    assert init_payload["expected_words"][0] == {"surah": 1, "ayah": 1, "word": 1, "text": "بِسْمِ"}
    # الإطار الثنائي وصل asr كما هو دون تعديل
    assert b"\x00\x01\x02\x03" in fake_conn.sent
