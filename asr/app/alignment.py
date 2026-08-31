"""متتبع موضع التلاوة داخل نص متوقع معروف (كتبه المدير).

المبدأ (docs/design/ASR-ARCHITECTURE.md §4): المسألة محاذاة لا تعرفاً حراً.
كل دورة فك ترميز تعطينا كلمات النافذة الصوتية الأخيرة (متداخلة مع سابقتها)،
فنحاذيها مع نافذة توقع حول المؤشر الحالي بخوارزمية Needleman-Wunsch بمشابهة
حرفية ضبابية، ثم نتقدم بالمؤشر وفق قواعد ممانعة صارمة:

- التقدم رتيب: المؤشر لا يرجع أبداً (إلا بـ reset صريح).
- التقدم القريب (ضمن jump_threshold) يتطلب مطابقتين متتاليتين متسقتين.
- القفزة البعيدة (تجاوز/انتقال) تتطلب ≥3 مطابقات متتالية في الموضع الجديد.

المخرج يشمل أيضاً عمليات المحاذاة الخام (match/sub/del/ins) — أساس كشف
الأخطاء في الدرجة الرابعة دون إعادة تصميم.
"""

from dataclasses import dataclass, field

from rapidfuzz.distance import Levenshtein

from .normalize import normalize_word

# أوزان المحاذاة: المطابقة تكسب، والفجوات تخسر خسارة أصغر من خسارة
# إبدال بعيد — حتى تُفضَّل الفجوة على مطابقة كاذبة.
SIM_MATCH_THRESHOLD = 0.60  # أدنى مشابهة تُعد "مطابقة"
GAP_PENALTY = -0.55
MIN_RUN_NEAR = 2  # مطابقات متتالية لازمة للتقدم القريب
MIN_RUN_FAR = 3  # ...وللقفزة البعيدة
NEAR_JUMP_LIMIT = 6  # ما بعده يُعد قفزة بعيدة
# جسر التسامح: عدد العمليات غير المطابقة (sub/ins/del) المسموح ابتلاعها داخل
# السلسلة الواحدة دون قطعها — خلل واحد من ضجيج النموذج لا يجمّد المؤشر
# (كان القطع الصارم سبب نمط «توقف ثم قفزة» الذي لمسه المستخدم فعلياً).
RUN_BRIDGE_TOLERANCE = 1


@dataclass(frozen=True)
class ExpectedWord:
    surah: int
    ayah: int
    word: int  # ترتيب الكلمة داخل الآية (1-based)
    text: str  # النص العثماني كما في بيانات المصحف

    def key(self) -> tuple[int, int, int]:
        return (self.surah, self.ayah, self.word)


@dataclass
class AlignmentOp:
    """عملية محاذاة واحدة — للاستهلاك المستقبلي في كشف الأخطاء."""

    op: str  # match | sub | del (كلمة متوقعة بلا صوت) | ins (صوت بلا كلمة متوقعة)
    hyp_index: int | None
    exp_index: int | None  # فهرس مطلق في مصفوفة الكلمات المتوقعة
    similarity: float


@dataclass
class TrackerUpdate:
    position: int  # فهرس آخر كلمة متوقعة مؤكدة (مطلق، -1 قبل البداية)
    current: ExpectedWord | None
    advanced: bool
    confidence: float  # متوسط مشابهة المطابقات التي بُني عليها التقدم
    ops: list[AlignmentOp] = field(default_factory=list)


def _similarity(a: str, b: str) -> float:
    if not a or not b:
        return 0.0
    return 1.0 - Levenshtein.normalized_distance(a, b)


class RecitationTracker:
    def __init__(
        self,
        expected: list[ExpectedWord],
        *,
        window_back: int = 3,
        window_ahead: int = 25,
    ):
        if not expected:
            raise ValueError("قائمة الكلمات المتوقعة فارغة")
        self.expected = expected
        self.norm_expected = [normalize_word(w.text) for w in expected]
        self.window_back = window_back
        self.window_ahead = window_ahead
        self.position = -1  # لم تُؤكد أي كلمة بعد

    def reset(self, position: int = -1) -> None:
        """إرجاع صريح (المعلم أعاد القارئ إلى موضع)."""
        self.position = max(-1, min(position, len(self.expected) - 1))

    # ---------- المحاذاة ----------

    def _align(self, hyp: list[str], lo: int, hi: int) -> list[AlignmentOp]:
        """Needleman-Wunsch كاملة بين hyp و expected[lo:hi] مع إرجاع المسار."""
        exp = self.norm_expected[lo:hi]
        n, m = len(hyp), len(exp)
        # score/backtrack: 0=diag, 1=up (فجوة في المتوقع), 2=left (فجوة في الفرضية)
        score = [[0.0] * (m + 1) for _ in range(n + 1)]
        back = [[0] * (m + 1) for _ in range(n + 1)]
        for i in range(1, n + 1):
            score[i][0] = score[i - 1][0] + GAP_PENALTY
            back[i][0] = 1
        for j in range(1, m + 1):
            score[0][j] = score[0][j - 1] + GAP_PENALTY
            back[0][j] = 2
        for i in range(1, n + 1):
            for j in range(1, m + 1):
                sim = _similarity(hyp[i - 1], exp[j - 1])
                diag = score[i - 1][j - 1] + (2.0 * sim - 1.0)
                up = score[i - 1][j] + GAP_PENALTY
                left = score[i][j - 1] + GAP_PENALTY
                best = max(diag, up, left)
                score[i][j] = best
                back[i][j] = 0 if best == diag else (1 if best == up else 2)

        ops: list[AlignmentOp] = []
        i, j = n, m
        while i > 0 or j > 0:
            b = back[i][j]
            if i > 0 and j > 0 and b == 0:
                sim = _similarity(hyp[i - 1], exp[j - 1])
                ops.append(
                    AlignmentOp(
                        op="match" if sim >= SIM_MATCH_THRESHOLD else "sub",
                        hyp_index=i - 1,
                        exp_index=lo + j - 1,
                        similarity=sim,
                    )
                )
                i, j = i - 1, j - 1
            elif i > 0 and (j == 0 or b == 1):
                ops.append(AlignmentOp(op="ins", hyp_index=i - 1, exp_index=None, similarity=0.0))
                i -= 1
            else:
                ops.append(AlignmentOp(op="del", hyp_index=None, exp_index=lo + j - 1, similarity=0.0))
                j -= 1
        ops.reverse()
        return ops

    # ---------- التقدم ----------

    def update(self, hypothesis_text_or_words) -> TrackerUpdate:
        if isinstance(hypothesis_text_or_words, str):
            from .normalize import normalize_text

            hyp = normalize_text(hypothesis_text_or_words)
        else:
            hyp = [normalize_word(w) for w in hypothesis_text_or_words]
            hyp = [w for w in hyp if w]

        lo = max(0, self.position - self.window_back)
        hi = min(len(self.expected), max(self.position, 0) + self.window_ahead + 1)
        if not hyp or lo >= hi:
            return self._result(advanced=False, confidence=0.0, ops=[])

        ops = self._align(hyp, lo, hi)

        # اجمع "سلاسل" المطابقات (قطرية متصلة في exp_index) مع جسر تسامح: حتى
        # RUN_BRIDGE_TOLERANCE عملية غير مطابقة بين مطابقتين لا تقطع السلسلة —
        # بشرط أن تبقى المطابقة التالية استمراراً قريباً في المتوقع (فجوة ≤2).
        runs: list[list[AlignmentOp]] = []
        current_run: list[AlignmentOp] = []
        prev_exp: int | None = None
        pending_bridge = 0
        for op in ops:
            if op.op == "match":
                continues_run = (
                    current_run
                    and prev_exp is not None
                    and op.exp_index is not None
                    and 0 < op.exp_index - prev_exp <= 1 + pending_bridge
                )
                if continues_run:
                    current_run.append(op)
                else:
                    if current_run:
                        runs.append(current_run)
                    current_run = [op]
                prev_exp = op.exp_index
                pending_bridge = 0
            else:
                if not current_run:
                    continue
                if pending_bridge < RUN_BRIDGE_TOLERANCE:
                    pending_bridge += 1
                else:
                    runs.append(current_run)
                    current_run = []
                    prev_exp = None
                    pending_bridge = 0
        if current_run:
            runs.append(current_run)

        # رشّح أفضل موضع جديد: أبعد سلسلة تحقق شرط الطول حسب بعد القفزة.
        # خطوة الكلمة-التالية (+1) تُقبل بمطابقة واحدة — انزلاق سلس كلمة-كلمة
        # بدل انتظار مطابقتين ثم الوثب (سلاسة طلبها المستخدم صراحة).
        best_pos = self.position
        best_conf = 0.0
        for run in runs:
            end = run[-1].exp_index
            assert end is not None
            if end <= self.position:
                continue
            jump = end - self.position
            needed = (
                1
                if jump == 1
                else MIN_RUN_NEAR
                if jump <= NEAR_JUMP_LIMIT
                else MIN_RUN_FAR
            )
            if len(run) >= needed and end > best_pos:
                best_pos = end
                best_conf = sum(o.similarity for o in run) / len(run)

        advanced = best_pos > self.position
        if advanced:
            self.position = best_pos
        return self._result(advanced=advanced, confidence=best_conf, ops=ops)

    def _result(self, *, advanced: bool, confidence: float, ops: list[AlignmentOp]) -> TrackerUpdate:
        current = self.expected[self.position] if self.position >= 0 else None
        return TrackerUpdate(
            position=self.position,
            current=current,
            advanced=advanced,
            confidence=round(confidence, 3),
            ops=ops,
        )
