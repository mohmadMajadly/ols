"""محمّل بيانات تخطيط مصحف المدينة (QPC V2، 604 صفحة) — نمط lazy singleton.

يقرأ ``app/data/mushaf_qpc_v2.json`` مرة واحدة فقط عند أول استخدام (لا قراءة
ملف لكل طلب HTTP)، ويُبقيه في الذاكرة طوال عمر العملية. الملف نفسه يُبنى
بواسطة ``scripts/build-mushaf-layout.py`` (راجعه لتفاصيل المصادر).
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "mushaf_qpc_v2.json"

TOTAL_PAGES = 604


@lru_cache(maxsize=1)
def _load() -> dict[str, Any]:
    with DATA_PATH.open("r", encoding="utf-8") as f:
        data = json.load(f)
    if data["meta"]["total_pages"] != TOTAL_PAGES:
        raise RuntimeError(
            f"بيانات المصحف تالفة: عدد الصفحات {data['meta']['total_pages']} بدل {TOTAL_PAGES}"
        )
    return data


def get_meta() -> dict[str, Any]:
    return _load()["meta"]


def is_valid_page(page: int) -> bool:
    return 1 <= page <= TOTAL_PAGES


def get_page(page: int) -> dict[str, Any] | None:
    """يعيد بيانات الصفحة (1..604) أو None إن كان الرقم خارج النطاق."""
    if not is_valid_page(page):
        return None
    data = _load()
    # فهرس الصفحات في الملف مرتب ومطابق لرقم الصفحة (page N في الموضع N-1)،
    # لكن نتحقق بدل الافتراض الأعمى لأن هذا نص القرآن.
    entry = data["pages"][page - 1]
    if entry["page"] != page:
        raise RuntimeError(f"ترتيب صفحات ملف المصحف غير متطابق عند الصفحة {page}")
    return entry


def get_page_for_ayah(surah: int, ayah: int) -> dict[str, int] | None:
    """يعيد {"page":.., "line":..} لأول ظهور لهذه الآية، أو None إن لم توجد."""
    data = _load()
    key = f"{surah}:{ayah}"
    return data["index"].get(key)
