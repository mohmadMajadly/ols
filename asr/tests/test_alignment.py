"""اختبارات وحدة لمتتبع التلاوة (خوارزمية المدير) — سيناريوهات قارئ حقيقية."""

from app.alignment import ExpectedWord, RecitationTracker
from app.normalize import normalize_text, normalize_word

# الفاتحة كلمة-كلمة (نص عثماني مضبوط كما سيصل من بيانات المصحف)
FATIHA = [
    (1, 1, ["بِسْمِ", "ٱللَّهِ", "ٱلرَّحْمَٰنِ", "ٱلرَّحِيمِ"]),
    (1, 2, ["ٱلْحَمْدُ", "لِلَّهِ", "رَبِّ", "ٱلْعَٰلَمِينَ"]),
    (1, 3, ["ٱلرَّحْمَٰنِ", "ٱلرَّحِيمِ"]),
    (1, 4, ["مَٰلِكِ", "يَوْمِ", "ٱلدِّينِ"]),
    (1, 5, ["إِيَّاكَ", "نَعْبُدُ", "وَإِيَّاكَ", "نَسْتَعِينُ"]),
    (1, 6, ["ٱهْدِنَا", "ٱلصِّرَٰطَ", "ٱلْمُسْتَقِيمَ"]),
    (1, 7, ["صِرَٰطَ", "ٱلَّذِينَ", "أَنْعَمْتَ", "عَلَيْهِمْ"]),
]


def make_expected():
    out = []
    for surah, ayah, words in FATIHA:
        for i, w in enumerate(words, start=1):
            out.append(ExpectedWord(surah=surah, ayah=ayah, word=i, text=w))
    return out


def test_normalize_uthmani_matches_whisper_orthography():
    # ما يخرجه Whisper إملاءً قياسياً يجب أن يطابق العثماني بعد التطبيع —
    # الألف الخنجرية تُكتب ألفاً في الإملاء القياسي غالباً
    assert normalize_word("ٱلصِّرَٰطَ") == normalize_word("الصراط")
    assert normalize_word("ٱلْعَٰلَمِينَ") == normalize_word("العالمين")
    assert normalize_word("مَٰلِكِ") == normalize_word("مالك")
    assert normalize_word("ٱلْحَمْدُ") == normalize_word("الحمد")
    # الاستثناء المشهور: "الرحمن" تُكتب قياسياً بلا ألف — فرق حرف واحد
    # يلتقطه التشابه الضبابي (عتبة 0.6)
    from app.alignment import _similarity

    sim = _similarity(normalize_word("ٱلرَّحْمَٰنِ"), normalize_word("الرحمن"))
    assert sim >= 0.8


def test_progressive_tracking_with_sliding_windows():
    t = RecitationTracker(make_expected())
    # نوافذ فك ترميز متداخلة كما في الواقع
    u1 = t.update("بسم الله")
    assert u1.advanced and u1.current.ayah == 1 and u1.position == 1
    u2 = t.update("بسم الله الرحمن الرحيم")
    assert u2.position == 3
    u3 = t.update("الرحمن الرحيم الحمد لله رب")
    assert u3.position == 6
    assert u3.current.text == "رَبِّ"
    # نافذة مكررة تماماً — لا تقدم مزدوج
    u4 = t.update("الرحمن الرحيم الحمد لله رب")
    assert u4.position == 6 and not u4.advanced


def test_hallucinated_word_does_not_derail():
    t = RecitationTracker(make_expected())
    t.update("بسم الله الرحمن الرحيم")
    # النموذج هلوس كلمة دخيلة وسط كلام صحيح
    u = t.update("الرحيم الحمد شيء لله رب العالمين")
    assert u.position >= 7  # وصل على الأقل إلى "رب/العالمين"
    assert u.current.surah == 1


def test_reciter_skips_a_word():
    t = RecitationTracker(make_expected())
    t.update("بسم الله الرحمن الرحيم")
    # القارئ أسقط "الحمد" وقفز إلى "لله رب العالمين" — تخطٍ قريب
    u = t.update("الرحيم لله رب العالمين")
    assert u.position == 7  # فهرس "العالمين" (0-based: 4+3)
    # عملية del للكلمة المتخطاة موجودة في المخرجات (أساس كشف الأخطاء لاحقاً)
    assert any(op.op == "del" for op in u.ops)


def test_far_jump_needs_three_consecutive_matches():
    t = RecitationTracker(make_expected())
    t.update("بسم الله")  # position=1
    # قفزة بعيدة (>6): كلمتان فقط من موضع بعيد — تُرفض
    u_two = t.update("اياك نعبد")
    assert u_two.position == 1 and not u_two.advanced
    # ثلاث كلمات متتالية بعيدة — تُقبل
    u_three = t.update("اياك نعبد واياك نستعين")
    assert u_three.advanced and u_three.current.text == "نَسْتَعِينُ"


def test_single_word_match_does_not_advance():
    t = RecitationTracker(make_expected())
    u = t.update("بسم")
    assert not u.advanced and u.position == -1


def test_reset_allows_going_back():
    t = RecitationTracker(make_expected())
    t.update("بسم الله الرحمن الرحيم الحمد لله رب العالمين")
    assert t.position >= 6
    t.reset(-1)
    u = t.update("بسم الله")
    assert u.position == 1


def test_empty_or_non_arabic_hypothesis_is_safe():
    t = RecitationTracker(make_expected())
    u = t.update("... 123 !!")
    assert not u.advanced and u.position == -1
