"""حساب الدرجة المقترحة لجلسة تسميع (دالة نقية قابلة للاختبار).

القاعدة: البداية 100. لكل ملاحظة نحدد سلة الخصم من لون فئتها
(hifz/tajwid/dabt/waqf) - الألوان sahih/neutral لا تُخصم شيئاً. قيمة
الخصم تُقرأ من ``rubric.deductions[bucket][correction_mode]``؛ إن كانت
correction_mode فارغة (None) نعتمد "tanbih". تُطرح كل الخصومات من 100،
بحد أدنى صفر، وتُقرَّب النتيجة لمنزلتين عشريتين.

ملاحظة: ``weights`` في سلّم التقييم غير مستخدمة في هذه الصيغة حالياً
(محجوزة لتقارير لاحقة) - لا تُقحَم هنا عمداً.
"""

from collections.abc import Iterable

# الفئات (ألوان) التي تُسبب خصماً؛ sahih و neutral لا تخصمان شيئاً.
DEDUCTION_BUCKETS = {"hifz", "tajwid", "dabt", "waqf"}
DEFAULT_CORRECTION_MODE = "tanbih"
STARTING_SCORE = 100.0


def compute_suggested_grade(
    note_entries: Iterable[tuple[str, str | None]],
    deductions: dict[str, dict[str, float]],
) -> float:
    """note_entries: تسلسل من أزواج (لون الفئة، وضع التصحيح أو None)."""
    score = STARTING_SCORE
    for color, correction_mode in note_entries:
        if color not in DEDUCTION_BUCKETS:
            continue
        mode = correction_mode or DEFAULT_CORRECTION_MODE
        bucket = deductions.get(color, {})
        score -= float(bucket.get(mode, 0))
    score = max(score, 0.0)
    return round(score, 2)
