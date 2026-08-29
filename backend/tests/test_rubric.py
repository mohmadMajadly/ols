from app.core.config import settings
from app.core.security import hash_password
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


def _login_as_admin(client):
    response = client.post(
        "/api/auth/login",
        json={"username": settings.ADMIN_USERNAME, "password": settings.ADMIN_PASSWORD},
    )
    assert response.status_code == 200


def _login(client, username, password):
    response = client.post("/api/auth/login", json={"username": username, "password": password})
    assert response.status_code == 200


def test_default_rubric_values(client):
    _login_as_admin(client)
    response = client.get("/api/rubric")
    assert response.status_code == 200
    body = response.json()
    assert body["weights"] == {"hifz": 70, "tajwid": 25, "adaa": 5}
    assert body["deductions"]["hifz"] == {"tadaruk": 0, "tanbih": 0.75, "talqin": 1.5}


def test_admin_can_update_rubric_with_valid_weights(client):
    _login_as_admin(client)
    payload = {
        "weights": {"hifz": 60, "tajwid": 30, "adaa": 10},
        "deductions": {
            "hifz": {"tadaruk": 0, "tanbih": 1, "talqin": 2},
            "tajwid": {"tadaruk": 0, "tanbih": 0.25, "talqin": 0.5},
            "dabt": {"tadaruk": 0, "tanbih": 0.5, "talqin": 1.0},
            "waqf": {"tadaruk": 0, "tanbih": 0.25, "talqin": 0.5},
        },
    }
    response = client.put("/api/rubric", json=payload)
    assert response.status_code == 200
    assert response.json()["weights"] == payload["weights"]

    # استعادة القيم الافتراضية حتى لا تؤثر على بقية الاختبارات المشتركة لقاعدة البيانات.
    restore_payload = {
        "weights": {"hifz": 70, "tajwid": 25, "adaa": 5},
        "deductions": {
            "hifz": {"tadaruk": 0, "tanbih": 0.75, "talqin": 1.5},
            "tajwid": {"tadaruk": 0, "tanbih": 0.25, "talqin": 0.5},
            "dabt": {"tadaruk": 0, "tanbih": 0.5, "talqin": 1.0},
            "waqf": {"tadaruk": 0, "tanbih": 0.25, "talqin": 0.5},
        },
    }
    restore_response = client.put("/api/rubric", json=restore_payload)
    assert restore_response.status_code == 200


def test_update_rubric_with_invalid_weight_sum_rejected(client):
    _login_as_admin(client)
    payload = {
        "weights": {"hifz": 70, "tajwid": 25, "adaa": 50},
        "deductions": {"hifz": {"tadaruk": 0, "tanbih": 0.75, "talqin": 1.5}},
    }
    response = client.put("/api/rubric", json=payload)
    assert response.status_code in (400, 422)


def test_update_rubric_with_negative_deduction_rejected(client):
    _login_as_admin(client)
    payload = {
        "weights": {"hifz": 70, "tajwid": 25, "adaa": 5},
        "deductions": {"hifz": {"tadaruk": -1, "tanbih": 0.75, "talqin": 1.5}},
    }
    response = client.put("/api/rubric", json=payload)
    assert response.status_code in (400, 422)


def test_supervisor_cannot_update_rubric(client, db_session):
    _create_user(db_session, username="rubric_supervisor", password="Password123!", role=UserRole.supervisor)
    _login(client, "rubric_supervisor", "Password123!")

    read_response = client.get("/api/rubric")
    assert read_response.status_code == 200

    update_response = client.put(
        "/api/rubric",
        json={"weights": {"hifz": 70, "tajwid": 25, "adaa": 5}, "deductions": {}},
    )
    assert update_response.status_code == 403


def test_teacher_can_read_but_not_update_rubric(client, db_session):
    _create_user(db_session, username="rubric_teacher", password="Password123!", role=UserRole.teacher)
    _login(client, "rubric_teacher", "Password123!")

    read_response = client.get("/api/rubric")
    assert read_response.status_code == 200

    update_response = client.put(
        "/api/rubric",
        json={"weights": {"hifz": 70, "tajwid": 25, "adaa": 5}, "deductions": {}},
    )
    assert update_response.status_code == 403


def test_student_forbidden_from_rubric(client, db_session):
    _create_user(db_session, username="rubric_student", password="Password123!", role=UserRole.student)
    _login(client, "rubric_student", "Password123!")

    response = client.get("/api/rubric")
    assert response.status_code == 403
