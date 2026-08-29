"""بيانات مرجعية لسور القرآن الكريم (رواية حفص عن عاصم، العدّ الكوفي).

المفاتيح أرقام السور بترتيب المصحف (1..114)، والقيم اسم السورة وعدد آياتها.
يُستخدم هذا الثابت للتحقق من صحة نطاقات السورة/الآية في الجلسات والملاحظات.

المجموع الكلي المعروف لعدد آيات القرآن الكريم بالعدّ الكوفي هو 6236 آية،
وهو ما تتحقق منه ``_verify_totals`` أدناه عند استيراد الوحدة لأول مرة، حتى
يُكتشف أي خطأ في الأرقام فوراً بدل أن يظهر بصمت لاحقاً في التحقق.
"""

SURAH_AYAH_COUNTS: dict[int, dict[str, object]] = {
    1: {"name": "الفاتحة", "ayah_count": 7},
    2: {"name": "البقرة", "ayah_count": 286},
    3: {"name": "آل عمران", "ayah_count": 200},
    4: {"name": "النساء", "ayah_count": 176},
    5: {"name": "المائدة", "ayah_count": 120},
    6: {"name": "الأنعام", "ayah_count": 165},
    7: {"name": "الأعراف", "ayah_count": 206},
    8: {"name": "الأنفال", "ayah_count": 75},
    9: {"name": "التوبة", "ayah_count": 129},
    10: {"name": "يونس", "ayah_count": 109},
    11: {"name": "هود", "ayah_count": 123},
    12: {"name": "يوسف", "ayah_count": 111},
    13: {"name": "الرعد", "ayah_count": 43},
    14: {"name": "إبراهيم", "ayah_count": 52},
    15: {"name": "الحجر", "ayah_count": 99},
    16: {"name": "النحل", "ayah_count": 128},
    17: {"name": "الإسراء", "ayah_count": 111},
    18: {"name": "الكهف", "ayah_count": 110},
    19: {"name": "مريم", "ayah_count": 98},
    20: {"name": "طه", "ayah_count": 135},
    21: {"name": "الأنبياء", "ayah_count": 112},
    22: {"name": "الحج", "ayah_count": 78},
    23: {"name": "المؤمنون", "ayah_count": 118},
    24: {"name": "النور", "ayah_count": 64},
    25: {"name": "الفرقان", "ayah_count": 77},
    26: {"name": "الشعراء", "ayah_count": 227},
    27: {"name": "النمل", "ayah_count": 93},
    28: {"name": "القصص", "ayah_count": 88},
    29: {"name": "العنكبوت", "ayah_count": 69},
    30: {"name": "الروم", "ayah_count": 60},
    31: {"name": "لقمان", "ayah_count": 34},
    32: {"name": "السجدة", "ayah_count": 30},
    33: {"name": "الأحزاب", "ayah_count": 73},
    34: {"name": "سبأ", "ayah_count": 54},
    35: {"name": "فاطر", "ayah_count": 45},
    36: {"name": "يس", "ayah_count": 83},
    37: {"name": "الصافات", "ayah_count": 182},
    38: {"name": "ص", "ayah_count": 88},
    39: {"name": "الزمر", "ayah_count": 75},
    40: {"name": "غافر", "ayah_count": 85},
    41: {"name": "فصلت", "ayah_count": 54},
    42: {"name": "الشورى", "ayah_count": 53},
    43: {"name": "الزخرف", "ayah_count": 89},
    44: {"name": "الدخان", "ayah_count": 59},
    45: {"name": "الجاثية", "ayah_count": 37},
    46: {"name": "الأحقاف", "ayah_count": 35},
    47: {"name": "محمد", "ayah_count": 38},
    48: {"name": "الفتح", "ayah_count": 29},
    49: {"name": "الحجرات", "ayah_count": 18},
    50: {"name": "ق", "ayah_count": 45},
    51: {"name": "الذاريات", "ayah_count": 60},
    52: {"name": "الطور", "ayah_count": 49},
    53: {"name": "النجم", "ayah_count": 62},
    54: {"name": "القمر", "ayah_count": 55},
    55: {"name": "الرحمن", "ayah_count": 78},
    56: {"name": "الواقعة", "ayah_count": 96},
    57: {"name": "الحديد", "ayah_count": 29},
    58: {"name": "المجادلة", "ayah_count": 22},
    59: {"name": "الحشر", "ayah_count": 24},
    60: {"name": "الممتحنة", "ayah_count": 13},
    61: {"name": "الصف", "ayah_count": 14},
    62: {"name": "الجمعة", "ayah_count": 11},
    63: {"name": "المنافقون", "ayah_count": 11},
    64: {"name": "التغابن", "ayah_count": 18},
    65: {"name": "الطلاق", "ayah_count": 12},
    66: {"name": "التحريم", "ayah_count": 12},
    67: {"name": "الملك", "ayah_count": 30},
    68: {"name": "القلم", "ayah_count": 52},
    69: {"name": "الحاقة", "ayah_count": 52},
    70: {"name": "المعارج", "ayah_count": 44},
    71: {"name": "نوح", "ayah_count": 28},
    72: {"name": "الجن", "ayah_count": 28},
    73: {"name": "المزمل", "ayah_count": 20},
    74: {"name": "المدثر", "ayah_count": 56},
    75: {"name": "القيامة", "ayah_count": 40},
    76: {"name": "الإنسان", "ayah_count": 31},
    77: {"name": "المرسلات", "ayah_count": 50},
    78: {"name": "النبأ", "ayah_count": 40},
    79: {"name": "النازعات", "ayah_count": 46},
    80: {"name": "عبس", "ayah_count": 42},
    81: {"name": "التكوير", "ayah_count": 29},
    82: {"name": "الانفطار", "ayah_count": 19},
    83: {"name": "المطففين", "ayah_count": 36},
    84: {"name": "الانشقاق", "ayah_count": 25},
    85: {"name": "البروج", "ayah_count": 22},
    86: {"name": "الطارق", "ayah_count": 17},
    87: {"name": "الأعلى", "ayah_count": 19},
    88: {"name": "الغاشية", "ayah_count": 26},
    89: {"name": "الفجر", "ayah_count": 30},
    90: {"name": "البلد", "ayah_count": 20},
    91: {"name": "الشمس", "ayah_count": 15},
    92: {"name": "الليل", "ayah_count": 21},
    93: {"name": "الضحى", "ayah_count": 11},
    94: {"name": "الشرح", "ayah_count": 8},
    95: {"name": "التين", "ayah_count": 8},
    96: {"name": "العلق", "ayah_count": 19},
    97: {"name": "القدر", "ayah_count": 5},
    98: {"name": "البينة", "ayah_count": 8},
    99: {"name": "الزلزلة", "ayah_count": 8},
    100: {"name": "العاديات", "ayah_count": 11},
    101: {"name": "القارعة", "ayah_count": 11},
    102: {"name": "التكاثر", "ayah_count": 8},
    103: {"name": "العصر", "ayah_count": 3},
    104: {"name": "الهمزة", "ayah_count": 9},
    105: {"name": "الفيل", "ayah_count": 5},
    106: {"name": "قريش", "ayah_count": 4},
    107: {"name": "الماعون", "ayah_count": 7},
    108: {"name": "الكوثر", "ayah_count": 3},
    109: {"name": "الكافرون", "ayah_count": 6},
    110: {"name": "النصر", "ayah_count": 3},
    111: {"name": "المسد", "ayah_count": 5},
    112: {"name": "الإخلاص", "ayah_count": 4},
    113: {"name": "الفلق", "ayah_count": 5},
    114: {"name": "الناس", "ayah_count": 6},
}

TOTAL_AYAH_COUNT = 6236


def _verify_totals() -> None:
    assert len(SURAH_AYAH_COUNTS) == 114, "يجب أن تحتوي القائمة على 114 سورة بالضبط"
    total = sum(int(entry["ayah_count"]) for entry in SURAH_AYAH_COUNTS.values())
    assert total == TOTAL_AYAH_COUNT, f"مجموع الآيات غير صحيح: {total} (المتوقع {TOTAL_AYAH_COUNT})"


_verify_totals()


def is_valid_surah(surah: int) -> bool:
    return surah in SURAH_AYAH_COUNTS


def is_valid_ayah(surah: int, ayah: int) -> bool:
    entry = SURAH_AYAH_COUNTS.get(surah)
    if entry is None:
        return False
    return 1 <= ayah <= int(entry["ayah_count"])
