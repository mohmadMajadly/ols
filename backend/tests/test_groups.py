from app.core.config import settings
from app.core.security import hash_password
from app.models.group import Group
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


def _login_as_admin(client):
    response = client.post(
        "/api/auth/login",
        json={"username": settings.ADMIN_USERNAME, "password": settings.ADMIN_PASSWORD},
    )
    assert response.status_code == 200


def _login(client, username, password):
    response = client.post("/api/auth/login", json={"username": username, "password": password})
    assert response.status_code == 200


def test_admin_can_create_and_list_groups(client, db_session):
    teacher = _create_user(db_session, username="grp_teacher1", password="Password123!", role=UserRole.teacher)
    _login_as_admin(client)

    create_response = client.post(
        "/api/groups",
        json={"name": "حلقة الفجر", "description": "حلقة تجريبية", "teacher_id": str(teacher.id)},
    )
    assert create_response.status_code == 201
    body = create_response.json()
    assert body["name"] == "حلقة الفجر"
    assert body["students_count"] == 0

    list_response = client.get("/api/groups")
    assert list_response.status_code == 200
    names = [g["name"] for g in list_response.json()]
    assert "حلقة الفجر" in names


def test_create_group_duplicate_name_returns_409(client):
    _login_as_admin(client)
    payload = {"name": "حلقة مكررة"}
    first = client.post("/api/groups", json=payload)
    assert first.status_code == 201
    second = client.post("/api/groups", json=payload)
    assert second.status_code == 409


def test_group_deactivation_hides_from_default_list(client):
    _login_as_admin(client)
    create_response = client.post("/api/groups", json={"name": "حلقة للتعطيل"})
    group_id = create_response.json()["id"]

    patch_response = client.patch(f"/api/groups/{group_id}", json={"is_active": False})
    assert patch_response.status_code == 200
    assert patch_response.json()["is_active"] is False

    list_response = client.get("/api/groups")
    ids = [g["id"] for g in list_response.json()]
    assert group_id not in ids

    include_inactive_response = client.get("/api/groups?include_inactive=true")
    ids_with_inactive = [g["id"] for g in include_inactive_response.json()]
    assert group_id in ids_with_inactive


def test_group_students_count_reflects_added_students(client, db_session):
    _login_as_admin(client)
    create_response = client.post("/api/groups", json={"name": "حلقة العدد"})
    group_id = create_response.json()["id"]

    student_response = client.post(
        "/api/students", json={"full_name": "طالب تجريبي", "group_id": group_id}
    )
    assert student_response.status_code == 201

    get_response = client.get(f"/api/groups/{group_id}")
    assert get_response.status_code == 200
    assert get_response.json()["students_count"] == 1


def test_teacher_sees_only_own_groups(client, db_session):
    teacher1 = _create_user(db_session, username="iso_teacher1", password="Password123!", role=UserRole.teacher)
    teacher2 = _create_user(db_session, username="iso_teacher2", password="Password123!", role=UserRole.teacher)
    group1 = _create_group(db_session, name="حلقة المعلم الأول", teacher_id=teacher1.id)
    group2 = _create_group(db_session, name="حلقة المعلم الثاني", teacher_id=teacher2.id)

    _login(client, "iso_teacher1", "Password123!")

    list_response = client.get("/api/groups")
    assert list_response.status_code == 200
    ids = [g["id"] for g in list_response.json()]
    assert str(group1.id) in ids
    assert str(group2.id) not in ids

    detail_own = client.get(f"/api/groups/{group1.id}")
    assert detail_own.status_code == 200

    detail_other = client.get(f"/api/groups/{group2.id}")
    assert detail_other.status_code == 404


def test_teacher_cannot_create_or_update_groups(client, db_session):
    teacher = _create_user(db_session, username="noaccess_teacher", password="Password123!", role=UserRole.teacher)
    _login(client, "noaccess_teacher", "Password123!")

    create_response = client.post("/api/groups", json={"name": "حلقة ممنوعة"})
    assert create_response.status_code == 403


def test_student_role_forbidden_on_groups(client, db_session):
    _create_user(db_session, username="grp_student", password="Password123!", role=UserRole.student)
    _login(client, "grp_student", "Password123!")

    list_response = client.get("/api/groups")
    assert list_response.status_code == 403

    create_response = client.post("/api/groups", json={"name": "حلقة الطالب"})
    assert create_response.status_code == 403
