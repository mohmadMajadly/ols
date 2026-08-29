from app.core.config import settings
from app.core.security import hash_password
from app.db.init_db import seed_note_taxonomy
from app.models.note_taxonomy import NoteCategory
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


def test_get_taxonomy_returns_seeded_tree(client):
    _login_as_admin(client)
    response = client.get("/api/taxonomy")
    assert response.status_code == 200
    body = response.json()
    keys = [c["key"] for c in body["categories"]]
    assert keys == ["hifz", "tajwid", "dabt", "waqf", "itqan"]
    hifz_category = next(c for c in body["categories"] if c["key"] == "hifz")
    assert len(hifz_category["subtypes"]) == 9
    assert hifz_category["color"] == "hifz"


def test_seed_is_idempotent_and_preserves_user_edits(db_session):
    # إعادة تشغيل البذرة لا تكرر الفئات.
    seed_note_taxonomy(db_session)
    count_after_reseed = db_session.query(NoteCategory).filter(NoteCategory.is_system.is_(True)).count()
    assert count_after_reseed == 5

    category = db_session.query(NoteCategory).filter(NoteCategory.key == "hifz").first()
    category.name = "اسم معدّل من طرف المستخدم"
    db_session.commit()

    seed_note_taxonomy(db_session)
    db_session.refresh(category)
    assert category.name == "اسم معدّل من طرف المستخدم"

    total_after = db_session.query(NoteCategory).filter(NoteCategory.is_system.is_(True)).count()
    assert total_after == 5


def test_cannot_delete_system_category(client):
    _login_as_admin(client)
    taxonomy = client.get("/api/taxonomy").json()
    hifz_id = next(c["id"] for c in taxonomy["categories"] if c["key"] == "hifz")

    delete_response = client.delete(f"/api/taxonomy/categories/{hifz_id}")
    assert delete_response.status_code == 400


def test_deactivating_category_hides_it_from_taxonomy(client):
    _login_as_admin(client)
    taxonomy = client.get("/api/taxonomy").json()
    waqf_id = next(c["id"] for c in taxonomy["categories"] if c["key"] == "waqf")

    patch_response = client.patch(f"/api/taxonomy/categories/{waqf_id}", json={"is_active": False})
    assert patch_response.status_code == 200

    refreshed = client.get("/api/taxonomy").json()
    keys = [c["key"] for c in refreshed["categories"]]
    assert "waqf" not in keys

    # إعادة التفعيل لاستعادة الحالة لبقية الاختبارات المشتركة لقاعدة البيانات.
    client.patch(f"/api/taxonomy/categories/{waqf_id}", json={"is_active": True})


def test_non_system_category_can_be_created_and_deleted(client):
    _login_as_admin(client)
    create_response = client.post(
        "/api/taxonomy/categories",
        json={"name": "فئة مخصصة", "color": "neutral", "sort_order": 99},
    )
    assert create_response.status_code == 201
    category_id = create_response.json()["id"]
    assert create_response.json()["is_system"] is False

    delete_response = client.delete(f"/api/taxonomy/categories/{category_id}")
    assert delete_response.status_code == 204


def test_teacher_can_read_but_not_modify_taxonomy(client, db_session):
    _create_user(db_session, username="tax_teacher", password="Password123!", role=UserRole.teacher)
    _login(client, "tax_teacher", "Password123!")

    read_response = client.get("/api/taxonomy")
    assert read_response.status_code == 200

    create_response = client.post(
        "/api/taxonomy/categories",
        json={"name": "فئة ممنوعة", "color": "neutral"},
    )
    assert create_response.status_code == 403


def test_student_forbidden_from_taxonomy(client, db_session):
    _create_user(db_session, username="tax_student", password="Password123!", role=UserRole.student)
    _login(client, "tax_student", "Password123!")

    response = client.get("/api/taxonomy")
    assert response.status_code == 403
