from app.core.config import settings
from app.core.quran_meta import SURAH_AYAH_COUNTS, TOTAL_AYAH_COUNT


def _login_as_admin(client):
    response = client.post(
        "/api/auth/login",
        json={"username": settings.ADMIN_USERNAME, "password": settings.ADMIN_PASSWORD},
    )
    assert response.status_code == 200


def test_surah_ayah_counts_totals_6236():
    assert len(SURAH_AYAH_COUNTS) == 114
    total = sum(int(e["ayah_count"]) for e in SURAH_AYAH_COUNTS.values())
    assert total == TOTAL_AYAH_COUNT == 6236


def test_key_surah_counts_are_correct():
    assert SURAH_AYAH_COUNTS[1]["ayah_count"] == 7  # الفاتحة
    assert SURAH_AYAH_COUNTS[2]["ayah_count"] == 286  # البقرة
    assert SURAH_AYAH_COUNTS[112]["ayah_count"] == 4  # الإخلاص
    assert SURAH_AYAH_COUNTS[114]["ayah_count"] == 6  # الناس


def test_surahs_endpoint_returns_114_entries_for_staff(client):
    _login_as_admin(client)
    response = client.get("/api/quran/surahs")
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 114
    assert body[0] == {"number": 1, "name": "الفاتحة", "ayah_count": 7}
