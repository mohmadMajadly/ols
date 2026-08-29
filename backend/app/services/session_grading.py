"""غلاف قاعدة-بيانات حول ``grading.compute_suggested_grade`` + قاعدة عدم
الكتابة فوق درجة حرّرها المعلم يدوياً.

نخزّن الدرجات كـ ``Decimal`` (يطابق نوع العمود Numeric(5,2)) بدل float
حتى تكون مقارنة "هل ما زالت grade تساوي suggested_grade القديمة؟" دقيقة
تماماً ولا تتأثر بأخطاء تمثيل الأعداد العشرية الثنائية.
"""

import uuid
from decimal import Decimal

from sqlalchemy.orm import Session

from app.models.note import Note
from app.models.note_taxonomy import NoteCategory
from app.models.rubric import DEFAULT_RUBRIC_DEDUCTIONS, RubricSettings
from app.models.session import TasmeeSession
from app.services.grading import compute_suggested_grade


def to_decimal_grade(value: float) -> Decimal:
    return Decimal(str(round(float(value), 2)))


def compute_session_suggested_grade(db: Session, session_id: uuid.UUID) -> Decimal:
    rubric = db.get(RubricSettings, 1)
    deductions = rubric.deductions if rubric is not None else DEFAULT_RUBRIC_DEDUCTIONS

    notes = db.query(Note).filter(Note.session_id == session_id).all()
    category_ids = {n.category_id for n in notes}
    categories = (
        {c.id: c for c in db.query(NoteCategory).filter(NoteCategory.id.in_(category_ids)).all()}
        if category_ids
        else {}
    )
    entries = [
        (categories[n.category_id].color, n.correction_mode) for n in notes if n.category_id in categories
    ]
    return to_decimal_grade(compute_suggested_grade(entries, deductions))


def recompute_session_grade(db: Session, session: TasmeeSession) -> None:
    """تُستدعى بعد إضافة/تعديل/حذف ملاحظة على جلسة مكتملة. تُحدّث
    suggested_grade دائماً؛ أما grade النهائية فتُحدَّث فقط إذا كانت لا
    تزال تساوي suggested_grade القديمة (أي لم يحرّرها المعلم يدوياً بعد
    الإنهاء) - وإلا تُترك كما هي دون لمس."""
    old_suggested = session.suggested_grade
    new_suggested = compute_session_suggested_grade(db, session.id)
    session.suggested_grade = new_suggested
    if session.grade is None or (old_suggested is not None and session.grade == old_suggested):
        session.grade = new_suggested
