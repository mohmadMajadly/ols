from app.services.grading import compute_suggested_grade

DEDUCTIONS = {
    "hifz": {"tadaruk": 0, "tanbih": 0.75, "talqin": 1.5},
    "tajwid": {"tadaruk": 0, "tanbih": 0.25, "talqin": 0.5},
    "dabt": {"tadaruk": 0, "tanbih": 0.5, "talqin": 1.0},
    "waqf": {"tadaruk": 0, "tanbih": 0.25, "talqin": 0.5},
}


def test_no_notes_gives_full_score():
    assert compute_suggested_grade([], DEDUCTIONS) == 100.0


def test_sahih_and_neutral_categories_never_deduct():
    entries = [("sahih", None), ("neutral", "talqin")]
    assert compute_suggested_grade(entries, DEDUCTIONS) == 100.0


def test_missing_correction_mode_defaults_to_tanbih():
    assert compute_suggested_grade([("hifz", None)], DEDUCTIONS) == 99.25


def test_multiple_categories_and_modes_sum_deductions():
    entries = [("hifz", "talqin"), ("tajwid", "tanbih"), ("dabt", "tadaruk")]
    # 100 - 1.5 - 0.25 - 0 = 98.25
    assert compute_suggested_grade(entries, DEDUCTIONS) == 98.25


def test_score_floors_at_zero_and_never_goes_negative():
    entries = [("hifz", "talqin")] * 100
    assert compute_suggested_grade(entries, DEDUCTIONS) == 0.0


def test_result_is_rounded_to_two_decimal_places():
    deductions = {"hifz": {"tanbih": 0.333}}
    assert compute_suggested_grade([("hifz", "tanbih")], deductions) == 99.67
