"""يبني backend/app/data/mushaf_qpc_v2.json — تخطيط مصحف المدينة (604 صفحة) وفق QPC V2.

المصادر:
  1) هيكل الأسطر (نوع كل سطر: اسم سورة / بسملة / آيات) من قاعدة بيانات SQLite
     الرسمية لمشروع QUL (Quranic Universal Library — Tarteel)، عبر المرآة العامة
     على GitHub: blueheron786/quranic-universal-library-mushaf-layouts
     (ملف qpc-v2-15-lines.db.zip — تصدير مباشر لتخطيط "KFGQPC V2 (1421H print)"
     من QUL، بلا حاجة لتسجيل دخول).
  2) نص كل كلمة (Uthmani) ورمز الحرف الخاص بخط الصفحة (QPC V2 code_v2) وترقيم
     السطر داخل الصفحة: من واجهة quran.com API v4 (/verses/by_page/{n}).

يُنتج ملفاً واحداً يحوي لكل صفحة 1..604 أسطرها بترتيبها، ولكل سطر آيات كلماته
بمعرفاتها الكاملة (سورة/آية/ترتيب الكلمة)، مع فهرس مساعد (سورة:آية) -> (صفحة، أول سطر).

يعمل داخل حاوية بايثون: يحمّل قاعدة QUL (~100 كيلوبايت مضغوطة)، ثم يستدعي
quran.com لكل صفحة على حدة (604 طلباً) مع تخزين مؤقت على القرص لإعادة التشغيل
بلا إعادة تحميل (idempotent). عند اكتشاف أي تضارب بيانات يطبع خطأً صريحاً ويتوقف.
"""

from __future__ import annotations

import json
import os
import sqlite3
import sys
import time
import urllib.error
import urllib.request
import zipfile
from concurrent.futures import ThreadPoolExecutor, as_completed

QUL_MIRROR_ZIP_URL = (
    "https://raw.githubusercontent.com/blueheron786/"
    "quranic-universal-library-mushaf-layouts/main/qpc-v2-15-lines.db.zip"
)
QURAN_COM_PAGE_URL = (
    "https://api.quran.com/api/v4/verses/by_page/{page}"
    "?words=true&word_fields=text_uthmani,line_number,code_v2,page_number"
    "&fields=text_uthmani"
)
USER_AGENT = "OLS-WP9a-mushaf-layout-builder/1.0 (+https://github.com; educational, non-commercial)"

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(HERE)
CACHE_DIR = os.environ.get(
    "WP9A_CACHE_DIR",
    os.path.join(REPO_ROOT, "scripts", ".cache", "wp9a-raw-pages"),
)
DB_CACHE_PATH = os.path.join(REPO_ROOT, "scripts", ".cache", "qpc-v2-15-lines.db")
OUT_PATH = os.path.join(REPO_ROOT, "backend", "app", "data", "mushaf_qpc_v2.json")
TOTAL_PAGES = 604


def _http_get(url: str, retries: int = 5) -> bytes:
    last_err = None
    for attempt in range(1, retries + 1):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=30) as resp:
                return resp.read()
        except (urllib.error.URLError, urllib.error.HTTPError) as exc:
            last_err = exc
            time.sleep(min(2 ** attempt, 15))
    raise RuntimeError(f"فشل تحميل {url} بعد {retries} محاولات: {last_err}")


def fetch_qul_layout_db() -> str:
    os.makedirs(os.path.dirname(DB_CACHE_PATH), exist_ok=True)
    if not os.path.exists(DB_CACHE_PATH):
        print(f"[layout-db] تحميل {QUL_MIRROR_ZIP_URL}")
        zip_bytes = _http_get(QUL_MIRROR_ZIP_URL)
        zip_path = DB_CACHE_PATH + ".zip"
        with open(zip_path, "wb") as f:
            f.write(zip_bytes)
        with zipfile.ZipFile(zip_path) as zf:
            names = [n for n in zf.namelist() if n.endswith(".db")]
            assert len(names) == 1, f"عدد ملفات db غير متوقع داخل الأرشيف: {names}"
            with zf.open(names[0]) as src, open(DB_CACHE_PATH, "wb") as dst:
                dst.write(src.read())
        os.remove(zip_path)
    else:
        print(f"[layout-db] مستخدم من الذاكرة المؤقتة: {DB_CACHE_PATH}")
    return DB_CACHE_PATH


def read_qul_lines(db_path: str) -> dict[int, list[dict]]:
    con = sqlite3.connect(db_path)
    cur = con.cursor()
    cur.execute("select name, number_of_pages, lines_per_page, font_name from info")
    info = cur.fetchone()
    print(f"[layout-db] info: {info}")
    assert info[1] == TOTAL_PAGES, f"عدد الصفحات في قاعدة QUL غير 604: {info[1]}"

    cur.execute(
        "select page_number, line_number, line_type, is_centered, surah_number "
        "from pages order by page_number, line_number"
    )
    by_page: dict[int, list[dict]] = {}
    for page_number, line_number, line_type, is_centered, surah_number in cur.fetchall():
        surah = int(surah_number) if surah_number not in ("", None) else None
        by_page.setdefault(page_number, []).append(
            {
                "line_number": line_number,
                "line_type": line_type,
                "centered": bool(is_centered),
                "surah_number": surah,
            }
        )
    con.close()
    assert len(by_page) == TOTAL_PAGES, f"عدد الصفحات المقروءة من QUL غير 604: {len(by_page)}"
    return by_page


def fetch_page_raw(page: int) -> dict:
    """يجلب استجابة quran.com الخام لصفحة (ويخزّنها مؤقتاً). ملاحظة مهمة اكتُشفت
    أثناء البناء: طرف by_page/{n} أحياناً "يسرّب" آية من الصفحة المجاورة (خطأ حدّي
    في واجهتهم — رُصد مثلاً عند 5:77 التي ظهرت ضمن رد by_page/121 رغم أن حقل
    page_number الخاص بكلماتها نفسها = 120). لذلك لا نثق بتجميع by_page نفسه؛
    نستخدمه فقط كوسيلة جلب، ونعتمد لاحقاً على حقل page_number/line_number
    المرفق بكل كلمة على حدة كمصدر الحقيقة الوحيد لمكانها."""
    cache_path = os.path.join(CACHE_DIR, f"{page:03d}.json")
    if os.path.exists(cache_path):
        with open(cache_path, "r", encoding="utf-8") as f:
            return json.load(f)
    raw_bytes = _http_get(QURAN_COM_PAGE_URL.format(page=page))
    raw = json.loads(raw_bytes)
    os.makedirs(CACHE_DIR, exist_ok=True)
    with open(cache_path, "w", encoding="utf-8") as f:
        json.dump(raw, f, ensure_ascii=False)
    return raw


def extract_words(raw: dict) -> list[dict]:
    words: list[dict] = []
    for verse in raw["verses"]:
        surah_s, ayah_s = verse["verse_key"].split(":")
        surah, ayah = int(surah_s), int(ayah_s)
        for w in verse["words"]:
            if w["char_type_name"] not in ("word", "end"):
                # لا كلمات من نوع آخر متوقعة في نص الآيات (لا ترجمة/لا وقف منفصل)؛
                # إن ظهر نوع غير معروف يجب فحصه يدوياً لا تجاهله.
                raise RuntimeError(
                    f"آية {verse['verse_key']}: char_type_name غير متوقع: {w['char_type_name']}"
                )
            words.append(
                {
                    "surah": surah,
                    "ayah": ayah,
                    "word": w["position"],
                    "text_uthmani": w["text_uthmani"],
                    "glyph": w["code_v2"],
                    "is_ayah_marker": w["char_type_name"] == "end",
                    # حقل الحقيقة: مكان الكلمة الفعلي كما تعلنه هي، لا الصفحة
                    # التي طُلبت منها الاستجابة (قد تُسرَّب كلمات من صفحة مجاورة).
                    "line_number": w["line_number"],
                    "page_number": w["page_number"],
                }
            )
    return words


def build() -> None:
    db_path = fetch_qul_layout_db()
    qul_pages = read_qul_lines(db_path)

    print(f"[quran.com] جلب {TOTAL_PAGES} صفحة (مخزّن مؤقتاً في {CACHE_DIR}) ...")
    raw_by_requested_page: dict[int, dict] = {}
    errors: list[str] = []
    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = {pool.submit(fetch_page_raw, p): p for p in range(1, TOTAL_PAGES + 1)}
        done = 0
        for fut in as_completed(futures):
            p = futures[fut]
            try:
                raw_by_requested_page[p] = fut.result()
            except Exception as exc:  # noqa: BLE001
                errors.append(f"صفحة {p}: {exc}")
            done += 1
            if done % 50 == 0 or done == TOTAL_PAGES:
                print(f"  ... {done}/{TOTAL_PAGES}")

    if errors:
        for e in errors:
            print("[خطأ]", e, file=sys.stderr)
        raise SystemExit(f"فشل جلب {len(errors)} صفحة من quran.com — أوقف البناء لإصلاح المصدر أولاً")

    # اكتُشف أن by_page/{n} قد "يسرّب" كلمات من صفحة مجاورة (راجع تعليق fetch_page_raw).
    # لذا نجمع كل الكلمات من كل الاستجابات الـ604 في مجمّع واحد، ونثق حصراً بحقل
    # page_number/line_number المرفق بكل كلمة على حدة لتحديد مكانها الحقيقي،
    # ونزيل التكرار (نفس الكلمة قد تظهر في استجابتين متجاورتين).
    dedup: dict[tuple, dict] = {}
    contradictions: list[str] = []
    for requested_page, raw in raw_by_requested_page.items():
        for w in extract_words(raw):
            key = (w["surah"], w["ayah"], w["word"])
            if key in dedup:
                prev = dedup[key]
                if (prev["page_number"], prev["line_number"], prev["text_uthmani"]) != (
                    w["page_number"],
                    w["line_number"],
                    w["text_uthmani"],
                ):
                    contradictions.append(
                        f"تضارب على الكلمة {key}: {prev} != {w}"
                    )
                continue
            dedup[key] = w
    if contradictions:
        for c in contradictions:
            print("[تضارب]", c, file=sys.stderr)
        raise SystemExit(f"وُجد {len(contradictions)} تضارب بيانات بين استجابات متجاورة — يجب فحصها")

    all_words: dict[int, list[dict]] = {}
    for w in dedup.values():
        all_words.setdefault(w["page_number"], []).append(w)

    pages_out = []
    index: dict[str, dict] = {}
    seen_ayat: dict[str, int] = {}
    current_surah_for_basmala = None

    for page in range(1, TOTAL_PAGES + 1):
        qul_lines = qul_pages[page]
        words_for_page = all_words[page]
        # فهرسة كلمات هذه الصفحة حسب رقم السطر كما ورد من quran.com
        words_by_line: dict[int, list[dict]] = {}
        for w in words_for_page:
            words_by_line.setdefault(w["line_number"], []).append(w)
        for ln in words_by_line:
            words_by_line[ln].sort(key=lambda w: (w["surah"], w["ayah"], w["word"]))

        lines_out = []
        for qline in qul_lines:
            ln = qline["line_number"]
            ltype = qline["line_type"]
            entry = {"line": ln, "type": ltype, "centered": qline["centered"]}
            if ltype == "surah_name":
                entry["surah"] = qline["surah_number"]
                current_surah_for_basmala = qline["surah_number"]
            elif ltype == "basmallah":
                entry["type"] = "basmala"
                entry["surah"] = current_surah_for_basmala
            elif ltype == "ayah":
                line_words = words_by_line.get(ln, [])
                if not line_words:
                    raise RuntimeError(f"صفحة {page} سطر {ln}: نوع 'ayah' بلا كلمات من quran.com")
                out_words = []
                for w in line_words:
                    out_words.append(
                        {
                            "surah": w["surah"],
                            "ayah": w["ayah"],
                            "word": w["word"],
                            "text_uthmani": w["text_uthmani"],
                            "glyph": w["glyph"],
                            "is_ayah_marker": w["is_ayah_marker"],
                        }
                    )
                    key = f"{w['surah']}:{w['ayah']}"
                    if key not in seen_ayat:
                        seen_ayat[key] = page
                        index[key] = {"page": page, "line": ln}
                    elif seen_ayat[key] != page:
                        raise RuntimeError(
                            f"الآية {key} ظهرت في صفحتين مختلفتين: {seen_ayat[key]} و {page}"
                        )
                entry["words"] = out_words
            else:
                raise RuntimeError(f"نوع سطر غير معروف: {ltype} (صفحة {page})")
            lines_out.append(entry)

        pages_out.append({"page": page, "lines": lines_out})

    result = {
        "meta": {
            "total_pages": TOTAL_PAGES,
            "mushaf": "مصحف المدينة النبوية (رواية حفص عن عاصم) — طباعة مجمع الملك فهد، تخطيط QPC V2 (1421هـ)",
            "sources": [
                "QUL (Quranic Universal Library — Tarteel): "
                "https://qul.tarteel.ai/resources/mushaf-layout "
                "(عبر مرآة GitHub: blueheron786/quranic-universal-library-mushaf-layouts, "
                "ملف qpc-v2-15-lines.db)",
                "quran.com API v4: https://api.quran.com/api/v4/verses/by_page/{n} "
                "(نص text_uthmani ورمز code_v2 لكل كلمة، ورقم السطر)",
            ],
        },
        "pages": pages_out,
        "index": index,
    }

    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, separators=(",", ":"))

    size_mb = os.path.getsize(OUT_PATH) / (1024 * 1024)
    print(f"[out] كُتب {OUT_PATH} ({size_mb:.2f} MB)")
    print(f"[out] عدد الآيات المفهرسة: {len(index)}")


if __name__ == "__main__":
    build()
