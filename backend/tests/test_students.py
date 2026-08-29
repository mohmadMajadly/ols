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


def test_admin_can_create_update_list_students(client, db_session):
    group = _create_group(db_session, name="حلقة الطلاب")
    _login_as_admin(client)

    create_response = client.post(
        "/api/students",
        json={"full_name": "أحمد محمد", "group_id": str(group.id), "phone": "0500000000"},
    )
    assert create_response.status_code == 201
    student_id = create_response.json()["id"]

    update_response = client.patch(
        f"/api/students/{student_id}", json={"memorization_note": "حفظ نصف القرآن"}
    )
    assert update_response.status_code == 200
    assert update_response.json()["memorization_note"] == "حفظ نصف القرآن"

    list_response = client.get(f"/api/students?group_id={group.id}")
    assert list_response.status_code == 200
    assert any(s["id"] == student_id for s in list_response.json())


def test_student_search_by_name_substring(client, db_session):
    _create_student(db_session, full_name="سالم العتيبي")
    _create_student(db_session, full_name="خالد الحربي")
    _login_as_admin(client)

    response = client.get("/api/students?q=سالم")
    assert response.status_code == 200
    names = [s["full_name"] for s in response.json()]
    assert "سالم العتيبي" in names
    assert "خالد الحربي" not in names


def test_inactive_student_hidden_unless_include_inactive(client, db_session):
    _login_as_admin(client)
    create_response = client.post("/api/students", json={"full_name": "طالب معطل"})
    student_id = create_response.json()["id"]
    client.patch(f"/api/students/{student_id}", json={"is_active": False})

    default_list = client.get("/api/students")
    assert student_id not in [s["id"] for s in default_list.json()]

    inclusive_list = client.get("/api/students?include_inactive=true")
    assert student_id in [s["id"] for s in inclusive_list.json()]


def test_teacher_isolation_on_students(client, db_session):
    teacher1 = _create_user(db_session, username="stu_teacher1", password="Password123!", role=UserRole.teacher)
    teacher2 = _create_user(db_session, username="stu_teacher2", password="Password123!", role=UserRole.teacher)
    group1 = _create_group(db_session, name="حلقة الطالب الأول", teacher_id=teacher1.id)
    group2 = _create_group(db_session, name="حلقة الطالب الثاني", teacher_id=teacher2.id)
    student_in_group2 = _create_student(db_session, full_name="طالب المعلم الثاني", group_id=group2.id)

    _login(client, "stu_teacher1", "Password123!")

    list_response = client.get("/api/students")
    assert list_response.status_code == 200
    ids = [s["id"] for s in list_response.json()]
    assert str(student_in_group2.id) not in ids

    detail_response = client.get(f"/api/students/{student_in_group2.id}")
    assert detail_response.status_code == 404

    create_response = client.post(
        "/api/students",
        json={"full_name": "محاولة إضافة", "group_id": str(group2.id)},
    )
    assert create_response.status_code == 403

    own_group_create = client.post(
        "/api/students",
        json={"full_name": "طالب صحيح", "group_id": str(group1.id)},
    )
    assert own_group_create.status_code == 201


def test_student_role_forbidden_on_students_endpoints(client, db_session):
    _create_user(db_session, username="plain_student2", password="Password123!", role=UserRole.student)
    _login(client, "plain_student2", "Password123!")

    list_response = client.get("/api/students")
    assert list_response.status_code == 403

    create_response = client.post("/api/students", json={"full_name": "طالب ممنوع"})
    assert create_response.status_code == 403
