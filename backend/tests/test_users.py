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


def test_supervisor_can_list_users_but_not_create(client, db_session):
    _create_user(
        db_session,
        username="plain_supervisor",
        password="SupervisorPass123!",
        role=UserRole.supervisor,
    )
    login_response = client.post(
        "/api/auth/login",
        json={"username": "plain_supervisor", "password": "SupervisorPass123!"},
    )
    assert login_response.status_code == 200

    list_response = client.get("/api/users")
    assert list_response.status_code == 200
    assert isinstance(list_response.json(), list)

    create_response = client.post(
        "/api/users",
        json={
            "username": "sneaky_via_supervisor",
            "password": "Password123!",
            "full_name": "محاولة إنشاء",
            "role": "student",
        },
    )
    assert create_response.status_code == 403

    update_response = client.patch(
        f"/api/users/{login_response.json()['id']}",
        json={"full_name": "تعديل عبر مشرف"},
    )
    assert update_response.status_code == 403


def test_role_filter_returns_only_matching_role(client, db_session):
    _create_user(db_session, username="filter_teacher", password="Password123!", role=UserRole.teacher)
    _create_user(db_session, username="filter_student", password="Password123!", role=UserRole.student)
    _login_as_admin(client)

    response = client.get("/api/users", params={"role": "teacher"})
    assert response.status_code == 200
    roles = {item["role"] for item in response.json()}
    assert roles == {"teacher"}
    usernames = {item["username"] for item in response.json()}
    assert "filter_teacher" in usernames
    assert "filter_student" not in usernames


def test_disabling_last_active_admin_is_rejected(client, db_session):
    _login_as_admin(client)
    admin_user = db_session.query(User).filter(User.role == UserRole.admin).one()

    response = client.patch(f"/api/users/{admin_user.id}", json={"is_active": False})
    assert response.status_code == 400
    assert "مدير" in response.json()["detail"]

    # الدور أيضاً محمي، ليس فقط التعطيل.
    role_change_response = client.patch(f"/api/users/{admin_user.id}", json={"role": "supervisor"})
    assert role_change_response.status_code == 400


def test_disabling_non_last_admin_succeeds(client, db_session):
    _login_as_admin(client)
    second_admin = _create_user(
        db_session,
        username="second_admin",
        password="Password123!",
        role=UserRole.admin,
    )

    response = client.patch(f"/api/users/{second_admin.id}", json={"is_active": False})
    assert response.status_code == 200
    assert response.json()["is_active"] is False
