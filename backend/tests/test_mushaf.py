"""التحقق القرآني الصارم لبيانات تخطيط مصحف المدينة (WP9a).

هذا نص القرآن الكريم — لا يُقبل فيه احتمال خطأ. كل اختبار هنا يتحقق من ثابت
معروف يقيناً (عدد الآيات 6236، عدد صفحات المصحف 604، بداية/نهاية الفاتحة/الناس،
نص عشر آيات موزعة مطابق حرفياً لنص Tanzil العثماني الرسمي المُنزَّل مباشرة من
tanzil.net) وليس مجرد إعادة اختبار للكود الذي بنى البيانات.

ملاحظة توثيقية مهمة حول عيّنات النص (راجع تقرير WP9a للتفصيل الكامل):
نص كل كلمة (``text_uthmani``) في ``mushaf_qpc_v2.json`` مصدره حقل
``text_uthmani`` من واجهة quran.com API v4، وهو نص Tanzil العثماني الكامل
(بالتشكيل والعلامات وحرف التطويل قبل الألف الخنجرية) — تم التحقق من مطابقته
لملف Tanzil الرسمي المُنزَّل مباشرة (quranType=uthmani, marks=true) حرفاً
حرفاً. الفرق الوحيد بين الاثنين هو اصطلاح المسافات حول علامات الوقف الصغيرة
المنفصلة (مثل ۚ ۖ ۗ ۜ) وحول البسملة الافتتاحية لأول آية في كل سورة غير
التوبة: quran.com يُلحقها بالكلمة السابقة/يفصلها كسطر بسملة مستقل بلا مسافة،
بينما ملف Tanzil النصي يفصلها بمسافة ويُدرج البسملة داخل نص الآية الأولى نفسها
(بما أن البسملة عندنا سطر مستقل في تخطيط المصحف، لا جزء من كلمات الآية، إلا في
الفاتحة حيث البسملة هي الآية الأولى فعلاً). لذلك تُقارَن النصوص هنا بعد إزالة
كل المسافات البيضاء من الطرفين (لا حذف حرف واحد) وبعد نزع بادئة البسملة من
نص Tanzil لأول آية في كل سورة (عدا الفاتحة والتوبة) — وهو ما يطابق تماماً بنية
تخطيط المصحف نفسها لا تعديلاً في النص.
"""

from __future__ import annotations

import json
import os
import re

import pytest

from app.core import mushaf_data
from app.core.config import settings
from app.core.quran_meta import SURAH_AYAH_COUNTS, TOTAL_AYAH_COUNT
from app.core.security import hash_password
from app.models.user import User, UserRole

BACKEND_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO_ROOT = os.path.dirname(BACKEND_ROOT)
FONTS_DIR = os.path.join(REPO_ROOT, "frontend", "public", "fonts", "qpc-v2")


def _login_as_admin(client):
    response = client.post(
        "/api/auth/login",
        json={"username": settings.ADMIN_USERNAME, "password": settings.ADMIN_PASSWORD},
    )
    assert response.status_code == 200


def _create_student_user(db_session) -> None:
    user = User(
        username="wp9a_student_test",
        password_hash=hash_password("Password123!"),
        full_name="طالب اختبار WP9a",
        role=UserRole.student,
        is_active=True,
    )
    db_session.add(user)
    db_session.commit()


def _login(client, username, password):
    response = client.post("/api/auth/login", json={"username": username, "password": password})
    assert response.status_code == 200


def _all_pages():
    return [mushaf_data.get_page(p) for p in range(1, mushaf_data.TOTAL_PAGES + 1)]


def _ayah_index():
    """يبني خريطة (surah, ayah) -> قائمة كل الصفحات التي ظهرت فيها كلماتها،
    مباشرة من ملف البيانات (بلا مرور عبر فهرس index المبني مسبقاً) للتأكد
    من أن الفهرس المساعد نفسه غير مصطنع/غير متوافق مع محتوى الصفحات الفعلي."""
    occurrences: dict[tuple[int, int], set[int]] = {}
    for page in _all_pages():
        for line in page["lines"]:
            if line["type"] != "ayah":
                continue
            for w in line["words"]:
                occurrences.setdefault((w["surah"], w["ayah"]), set()).add(page["page"])
    return occurrences


def _ayah_word_text(surah: int, ayah: int) -> str:
    """يعيد نص الآية (بلا رمز نهاية الآية) بترتيب كلماتها كما وردت في البيانات."""
    words = []
    for page in _all_pages():
        for line in page["lines"]:
            if line["type"] != "ayah":
                continue
            for w in line["words"]:
                if w["surah"] == surah and w["ayah"] == ayah and not w["is_ayah_marker"]:
                    words.append(w)
    words.sort(key=lambda w: w["word"])
    return "".join(w["text_uthmani"] for w in words)


def _strip_ws(s: str) -> str:
    return re.sub(r"\s+", "", s)


# نص Tanzil العثماني الرسمي لعشر آيات موزعة عبر المصحف — محمَّل من
# backend/tests/data/tanzil_samples.json، وهو ملف نُسخ برمجياً (بلا طباعة
# يدوية قد تُعيد ترتيب علامات التشكيل المركّبة) مباشرة من نص خام نُزِّل من
# tanzil.net (quranType=uthmani, marks=true) أثناء بناء هذه الحزمة. راجع
# حقل "_source" داخل الملف لتفاصيل رابط ومعطيات التنزيل.
_TANZIL_FIXTURE_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "tanzil_samples.json")
with open(_TANZIL_FIXTURE_PATH, encoding="utf-8") as _f:
    _TANZIL_FIXTURE = json.load(_f)
_TANZIL_BASMALA: str = _TANZIL_FIXTURE["_basmala"]
_TANZIL_SAMPLES: dict[tuple[int, int], str] = {
    tuple(int(x) for x in key.split(":")): text  # type: ignore[misc]
    for key, text in _TANZIL_FIXTURE["samples"].items()
}


class TestPageCount:
    def test_total_pages_is_exactly_604(self):
        data = mushaf_data._load()
        assert len(data["pages"]) == 604
        assert data["meta"]["total_pages"] == 604

    def test_page_numbers_are_1_to_604_in_order(self):
        for i, page in enumerate(_all_pages(), start=1):
            assert page["page"] == i


class TestAllAyatPresentExactlyOnce:
    def test_total_ayat_covered_is_6236(self):
        occurrences = _ayah_index()
        assert len(occurrences) == TOTAL_AYAH_COUNT == 6236

    def test_no_ayah_missing_and_none_extra(self):
        occurrences = _ayah_index()
        expected = {
            (surah, ayah)
            for surah, entry in SURAH_AYAH_COUNTS.items()
            for ayah in range(1, int(entry["ayah_count"]) + 1)
        }
        missing = expected - occurrences.keys()
        extra = occurrences.keys() - expected
        assert missing == set(), f"آيات مفقودة: {sorted(missing)[:20]}"
        assert extra == set(), f"آيات زائدة/غير معروفة: {sorted(extra)[:20]}"

    def test_no_ayah_spans_or_duplicates_across_pages(self):
        occurrences = _ayah_index()
        offenders = {k: v for k, v in occurrences.items() if len(v) != 1}
        assert offenders == {}, f"آيات ظهرت في أكثر من صفحة: {list(offenders.items())[:10]}"

    def test_helper_index_matches_actual_page_content(self):
        """الفهرس المساعد (سورة:آية) -> صفحة يجب أن يطابق الصفحة الفعلية
        التي وُجدت فيها كلمات الآية، لا صفحة مختلفة."""
        data = mushaf_data._load()
        occurrences = _ayah_index()
        for (surah, ayah), pages in occurrences.items():
            key = f"{surah}:{ayah}"
            assert key in data["index"], f"الآية {key} غائبة عن الفهرس المساعد"
            assert data["index"][key]["page"] == next(iter(pages))


class TestFatihaAndNasBoundaries:
    def test_page_1_is_complete_fatiha_7_ayat(self):
        page1 = mushaf_data.get_page(1)
        ayah_lines = [l for l in page1["lines"] if l["type"] == "ayah"]
        surah_lines = [l for l in page1["lines"] if l["type"] == "surah_name"]
        assert len(surah_lines) == 1
        assert surah_lines[0]["surah"] == 1
        all_ayat = sorted({(w["surah"], w["ayah"]) for l in ayah_lines for w in l["words"]})
        assert all_ayat == [(1, a) for a in range(1, 8)]

    def test_page_2_starts_al_baqarah(self):
        page2 = mushaf_data.get_page(2)
        surah_lines = [l for l in page2["lines"] if l["type"] == "surah_name"]
        assert len(surah_lines) == 1
        assert surah_lines[0]["surah"] == 2
        first_ayah_line = next(l for l in page2["lines"] if l["type"] == "ayah")
        assert first_ayah_line["words"][0]["surah"] == 2
        assert first_ayah_line["words"][0]["ayah"] == 1
        assert first_ayah_line["words"][0]["word"] == 1

    def test_page_604_ends_with_last_ayah_of_an_nas(self):
        page604 = mushaf_data.get_page(604)
        ayah_lines = [l for l in page604["lines"] if l["type"] == "ayah"]
        last_word = ayah_lines[-1]["words"][-1]
        assert last_word["surah"] == 114
        assert last_word["ayah"] == 6
        assert last_word["is_ayah_marker"] is True

    def test_surah_9_at_tawbah_has_no_basmala_line(self):
        data = mushaf_data._load()
        page = mushaf_data.get_page(data["index"]["9:1"]["page"])
        types_around_surah9 = [l["type"] for l in page["lines"] if l.get("surah") == 9]
        assert "surah_name" in types_around_surah9
        assert "basmala" not in types_around_surah9


class TestWordAndAyahOrdering:
    def test_word_positions_within_each_ayah_are_sequential_no_gaps(self):
        per_ayah: dict[tuple[int, int], list[int]] = {}
        for page in _all_pages():
            for line in page["lines"]:
                if line["type"] != "ayah":
                    continue
                for w in line["words"]:
                    per_ayah.setdefault((w["surah"], w["ayah"]), []).append(w["word"])
        for key, positions in per_ayah.items():
            assert sorted(positions) == list(range(1, len(positions) + 1)), (
                f"ترتيب كلمات غير متسلسل في الآية {key}: {sorted(positions)}"
            )

    def test_last_word_of_every_ayah_is_the_ayah_marker(self):
        # يُتحقق على مستوى المصحف كله (آية قد تمتد كلماتها عبر عدة أسطر)
        per_ayah: dict[tuple[int, int], list[dict]] = {}
        for page in _all_pages():
            for line in page["lines"]:
                if line["type"] != "ayah":
                    continue
                for w in line["words"]:
                    per_ayah.setdefault((w["surah"], w["ayah"]), []).append(w)
        for key, words in per_ayah.items():
            words.sort(key=lambda w: w["word"])
            assert words[-1]["is_ayah_marker"] is True, f"لا رمز نهاية آية للآية {key}"
            assert all(not w["is_ayah_marker"] for w in words[:-1]), (
                f"رمز نهاية آية في غير آخر كلمة للآية {key}"
            )

    def test_ayat_appear_in_mushaf_order_within_each_page(self):
        for page in _all_pages():
            seq = []
            for line in page["lines"]:
                if line["type"] != "ayah":
                    continue
                for w in line["words"]:
                    key = (w["surah"], w["ayah"])
                    if not seq or seq[-1] != key:
                        seq.append(key)
            for a, b in zip(seq, seq[1:]):
                assert b >= a, f"ترتيب آيات غير مصحفي في صفحة {page['page']}: {a} ثم {b}"


class TestLineCounts:
    def test_standard_pages_have_15_lines(self):
        exceptions = {1, 2}
        non_standard = []
        for page in _all_pages():
            n = len(page["lines"])
            if page["page"] in exceptions:
                continue
            if n != 15:
                non_standard.append((page["page"], n))
        assert non_standard == [], f"صفحات بعدد أسطر غير 15 خارج الاستثناءات: {non_standard}"

    def test_pages_1_and_2_documented_exception(self):
        page1 = mushaf_data.get_page(1)
        page2 = mushaf_data.get_page(2)
        # الفاتحة (7 آيات) + سطر اسم السورة = 8 أسطر فقط، لا 15 (لا بسملة منفصلة
        # لأن البسملة هي الآية الأولى فعلاً). صفحة 2: سطر اسم السورة + بسملة +
        # 6 أسطر آيات = 8.
        assert len(page1["lines"]) == 8
        assert len(page2["lines"]) == 8


class TestTanzilTextSamples:
    @pytest.mark.parametrize("surah_ayah", sorted(_TANZIL_SAMPLES.keys()))
    def test_word_text_matches_tanzil_uthmani(self, surah_ayah):
        surah, ayah = surah_ayah
        expected = _TANZIL_SAMPLES[surah_ayah]
        if ayah == 1 and surah not in (1, 9):
            assert expected.startswith(_TANZIL_BASMALA)
            expected = expected[len(_TANZIL_BASMALA) :]
        actual = _ayah_word_text(surah, ayah)
        assert _strip_ws(actual) == _strip_ws(expected), (
            f"نص الآية {surah}:{ayah} لا يطابق Tanzil.\n"
            f"  البيانات: {_strip_ws(actual)!r}\n"
            f"  Tanzil:   {_strip_ws(expected)!r}"
        )


class TestFontsOnDisk:
    def test_all_604_page_fonts_exist_when_fetched(self):
        if not os.path.isdir(FONTS_DIR):
            pytest.skip(f"مجلد الخطوط غير موجود في هذه البيئة ({FONTS_DIR}) — لم تُجلب الخطوط هنا")
        missing = []
        empty_or_bad = []
        for p in range(1, 605):
            path = os.path.join(FONTS_DIR, f"p{p:03d}.woff2")
            if not os.path.isfile(path):
                missing.append(p)
                continue
            with open(path, "rb") as f:
                magic = f.read(4)
            if magic != b"wOF2":
                empty_or_bad.append(p)
        assert missing == [], f"خطوط صفحات مفقودة: {missing[:20]} (المجموع {len(missing)})"
        assert empty_or_bad == [], f"ملفات خط بلا magic bytes صحيحة: {empty_or_bad[:20]}"


class TestApiEndpoints:
    def test_admin_can_read_a_page(self, client):
        _login_as_admin(client)
        response = client.get("/api/mushaf/pages/1")
        assert response.status_code == 200
        body = response.json()
        assert body["page"] == 1
        assert len(body["lines"]) == 8

    def test_student_role_is_allowed_to_read_a_page(self, client, db_session):
        """الشرط الصريح في مواصفة WP9a: متاح لكل الأدوار المسجَّلة بمن فيهم الطالب."""
        _create_student_user(db_session)
        _login(client, "wp9a_student_test", "Password123!")
        response = client.get("/api/mushaf/pages/1")
        assert response.status_code == 200
        response = client.get("/api/mushaf/page-for", params={"surah": 2, "ayah": 255})
        assert response.status_code == 200

    def test_page_endpoint_rejects_out_of_range(self, client):
        _login_as_admin(client)
        assert client.get("/api/mushaf/pages/0").status_code == 404
        assert client.get("/api/mushaf/pages/605").status_code == 404
        body = client.get("/api/mushaf/pages/0").json()
        assert "604" in body["detail"]

    def test_page_for_endpoint(self, client):
        _login_as_admin(client)
        response = client.get("/api/mushaf/page-for", params={"surah": 2, "ayah": 255})
        assert response.status_code == 200
        body = response.json()
        assert body["page"] == mushaf_data.get_page_for_ayah(2, 255)["page"]

    def test_page_for_endpoint_rejects_invalid_ayah(self, client):
        _login_as_admin(client)
        response = client.get("/api/mushaf/page-for", params={"surah": 1, "ayah": 8})
        assert response.status_code == 400

    def test_page_for_endpoint_rejects_invalid_surah(self, client):
        _login_as_admin(client)
        response = client.get("/api/mushaf/page-for", params={"surah": 115, "ayah": 1})
        assert response.status_code == 400

    def test_unauthenticated_request_is_rejected(self, client):
        response = client.get("/api/mushaf/pages/1")
        assert response.status_code == 401
