"""مخطط كلمات نطاق الجلسة المتوقعة — تُستهلك من الواجهة (لحساب فهرس reset) ومن
خدمة asr (تُبنى نفس البيانات داخلياً عند init الاتصال). راجع WP9c-asr-service.md §2."""

from pydantic import BaseModel


class ExpectedWordOut(BaseModel):
    surah: int
    ayah: int
    word: int
    text: str
