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


def test_login_success_sets_cookie(client):
    response = client.post(
        "/api/auth/login",
        json={"username": settings.ADMIN_USERNAME, "password": settings.ADMIN_PASSWORD},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["username"] == settings.ADMIN_USERNAME.lower()
    assert "ols_session" in response.cookies
    assert "password_hash" not in body


def test_login_wrong_password_returns_401(client):
    response = client.post(
        "/api/auth/login",
        json={"username": settings.ADMIN_USERNAME, "password": "totally-wrong-password"},
    )
    assert response.status_code == 401
    assert response.json()["detail"] == "اسم المستخدم أو كلمة المرور غير صحيحة"


def test_login_unknown_user_returns_401_generic_message(client):
    response = client.post(
        "/api/auth/login",
        json={"username": "no-such-user", "password": "whatever123"},
    )
    assert response.status_code == 401
    assert response.json()["detail"] == "اسم المستخدم أو كلمة المرور غير صحيحة"


def test_login_inactive_user_returns_401(client, db_session):
    _create_user(
        db_session,
        username="inactive_user",
        password="Password123!",
        role=UserRole.teacher,
        is_active=False,
    )
    response = client.post(
        "/api/auth/login",
        json={"username": "inactive_user", "password": "Password123!"},
    )
    assert response.status_code == 401


def test_me_without_cookie_returns_401(client):
    response = client.get("/api/auth/me")
    assert response.status_code == 401


def test_me_with_cookie_returns_user(client):
    login_response = client.post(
        "/api/auth/login",
        json={"username": settings.ADMIN_USERNAME, "password": settings.ADMIN_PASSWORD},
    )
    assert login_response.status_code == 200

    me_response = client.get("/api/auth/me")
    assert me_response.status_code == 200
    assert me_response.json()["username"] == settings.ADMIN_USERNAME.lower()


def test_logout_clears_cookie(client):
    client.post(
        "/api/auth/login",
        json={"username": settings.ADMIN_USERNAME, "password": settings.ADMIN_PASSWORD},
    )
    logout_response = client.post("/api/auth/logout")
    assert logout_response.status_code == 200

    me_response = client.get("/api/auth/me")
    assert me_response.status_code == 401


def test_password_is_stored_as_argon2_and_never_leaked(db_session):
    user = _create_user(
        db_session,
        username="argon_check",
        password="Password123!",
        role=UserRole.student,
    )
    assert user.password_hash.startswith("$argon2")


def test_password_hash_never_appears_in_login_response(client):
    response = client.post(
        "/api/auth/login",
        json={"username": settings.ADMIN_USERNAME, "password": settings.ADMIN_PASSWORD},
    )
    assert "password_hash" not in response.text


def test_rate_limit_login_after_five_attempts(client):
    for _ in range(5):
        response = client.post(
            "/api/auth/login",
            json={"username": settings.ADMIN_USERNAME, "password": "wrong-password"},
        )
        assert response.status_code == 401

    sixth_response = client.post(
        "/api/auth/login",
        json={"username": settings.ADMIN_USERNAME, "password": "wrong-password"},
    )
    assert sixth_response.status_code == 429
