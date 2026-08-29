"""تحقق الرؤية/الملكية لجلسات التسميع (مشترك بين routes/sessions و routes/notes).

يتبع نفس نمط ``_get_visible_student_or_404`` في ``routes/students.py``:
المعلم يرى فقط الجلسات التي هو منفّذها (teacher_id)، وأي جلسة أخرى تُخفى
عنه بإرجاع 404 بدل 403 (حتى لا يُكشف له عن وجودها). admin/supervisor
يريان كل الجلسات. الطالب (WP8) يرى فقط جلساته هو (session.student.user_id
== current_user.id) — نفس منطق الإخفاء بـ404 لا 403.
"""

import uuid

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.session import TasmeeSession
from app.models.student import Student
from app.models.user import User, UserRole


def get_visible_session_or_404(db: Session, session_id: uuid.UUID, current_user: User) -> TasmeeSession:
    session = db.get(TasmeeSession, session_id)
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="الجلسة غير موجودة")
    if current_user.role == UserRole.teacher and session.teacher_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="الجلسة غير موجودة")
    if current_user.role == UserRole.student:
        own_student = db.query(Student).filter(Student.user_id == current_user.id).first()
        if own_student is None or session.student_id != own_student.id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="الجلسة غير موجودة")
    return session
