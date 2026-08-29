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


def test_admin_can_list_users(client):
    _login_as_admin(client)
    response = client.get("/api/users")
    assert response.status_code == 200
    assert isinstance(response.json(), list)


def test_admin_can_create_user(client):
    _login_as_admin(client)
    response = client.post(
        "/api/users",
        json={
            "username": "teacher_one",
            "password": "TeacherPass123!",
            "full_name": "معلم تجريبي",
            "role": "teacher",
        },
    )
    assert response.status_code == 201
    body = response.json()
    assert body["username"] == "teacher_one"
    assert body["role"] == "teacher"
    assert "password_hash" not in body


def test_create_user_duplicate_username_returns_409(client):
    _login_as_admin(client)
    payload = {
        "username": "dup_user",
        "password": "SomePassword123!",
        "full_name": "مستخدم مكرر",
        "role": "student",
    }
    first = client.post("/api/users", json=payload)
    assert first.status_code == 201

    second = client.post("/api/users", json=payload)
    assert second.status_code == 409


def test_admin_can_update_user(client):
    _login_as_admin(client)
    create_response = client.post(
        "/api/users",
        json={
            "username": "update_target",
            "password": "Password123!",
            "full_name": "قبل التحديث",
            "role": "student",
        },
    )
    user_id = create_response.json()["id"]

    update_response = client.patch(
        f"/api/users/{user_id}",
        json={"full_name": "بعد التحديث", "is_active": False},
    )
    assert update_response.status_code == 200
    body = update_response.json()
    assert body["full_name"] == "بعد التحديث"
    assert body["is_active"] is False


def test_teacher_forbidden_from_users_endpoints(client, db_session):
    _create_user(
        db_session,
        username="plain_teacher",
        password="TeacherPass123!",
        role=UserRole.teacher,
    )
    login_response = client.post(
        "/api/auth/login",
        json={"username": "plain_teacher", "password": "TeacherPass123!"},
    )
    assert login_response.status_code == 200

    list_response = client.get("/api/users")
    assert list_response.status_code == 403

    create_response = client.post(
        "/api/users",
        json={
            "username": "sneaky",
            "password": "Password123!",
            "full_name": "محاولة اختراق",
            "role": "admin",
        },
    )
    assert create_response.status_code == 403
