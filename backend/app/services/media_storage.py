"""تخزين ملفات الوسائط (تسجيلات الجلسات) على القرص تحت MEDIA_ROOT.

بنية الملفات:
    {MEDIA_ROOT}/recordings/{session_id}/chunk_{index:05d}.part  (أثناء الرفع)
    {MEDIA_ROOT}/recordings/{session_id}/recording.webm          (بعد الإنهاء)

كل القراءة/الكتابة هنا مجزأة (streamed) بحجم ثابت - لا تحميل ملفات
كاملة في الذاكرة.
"""

import re
import shutil
import uuid
from collections.abc import Iterator
from pathlib import Path

from app.core.config import settings

CHUNK_INDEX_RE = re.compile(r"^chunk_(\d{5})\.part$")
STREAM_READ_SIZE = 1024 * 1024  # 1MB


def session_media_dir(session_id: uuid.UUID) -> Path:
    return Path(settings.MEDIA_ROOT) / "recordings" / str(session_id)


def chunk_file_path(session_id: uuid.UUID, index: int) -> Path:
    return session_media_dir(session_id) / f"chunk_{index:05d}.part"


def recording_file_path(session_id: uuid.UUID) -> Path:
    return session_media_dir(session_id) / "recording.webm"


def recording_relative_path(session_id: uuid.UUID) -> str:
    """المسار المخزَّن في recordings.file_path، نسبي من MEDIA_ROOT."""
    return f"recordings/{session_id}/recording.webm"


def write_chunk(session_id: uuid.UUID, index: int, data: bytes) -> None:
    """يكتب مقطعاً على القرص. عملية idempotent: إعادة رفع نفس الفهرس تستبدله."""
    directory = session_media_dir(session_id)
    directory.mkdir(parents=True, exist_ok=True)
    final_path = chunk_file_path(session_id, index)
    tmp_path = final_path.with_name(final_path.name + ".tmp")
    with open(tmp_path, "wb") as f:
        f.write(data)
    tmp_path.replace(final_path)


def list_uploaded_chunk_indices(session_id: uuid.UUID) -> list[int]:
    directory = session_media_dir(session_id)
    if not directory.exists():
        return []
    indices = []
    for entry in directory.iterdir():
        match = CHUNK_INDEX_RE.match(entry.name)
        if match:
            indices.append(int(match.group(1)))
    return sorted(indices)


def missing_chunk_indices(uploaded: list[int], last_chunk_index: int) -> list[int]:
    uploaded_set = set(uploaded)
    return [i for i in range(last_chunk_index + 1) if i not in uploaded_set]


def merge_chunks(session_id: uuid.UUID, last_chunk_index: int) -> int:
    """يدمج chunk_00000..chunk_{last} بالترتيب في recording.webm، يحذف
    الأجزاء بعد نجاح الدمج، ويعيد حجم الملف الناتج بالبايت."""
    out_path = recording_file_path(session_id)
    size = 0
    with open(out_path, "wb") as out_f:
        for index in range(last_chunk_index + 1):
            part_path = chunk_file_path(session_id, index)
            with open(part_path, "rb") as in_f:
                while True:
                    buf = in_f.read(STREAM_READ_SIZE)
                    if not buf:
                        break
                    out_f.write(buf)
                    size += len(buf)

    for index in range(last_chunk_index + 1):
        chunk_file_path(session_id, index).unlink(missing_ok=True)

    return size


def delete_session_media(session_id: uuid.UUID) -> None:
    """يحذف كل ملفات الجلسة (الأجزاء والتسجيل المدموج إن وُجد)."""
    directory = session_media_dir(session_id)
    shutil.rmtree(directory, ignore_errors=True)


def iter_file_range(path: Path, start: int, end: int, chunk_size: int = STREAM_READ_SIZE) -> Iterator[bytes]:
    """مولّد يقرأ [start, end] (شامل) من الملف على دفعات، دون تحميله كاملاً."""
    with open(path, "rb") as f:
        f.seek(start)
        remaining = end - start + 1
        while remaining > 0:
            read_size = min(chunk_size, remaining)
            data = f.read(read_size)
            if not data:
                break
            remaining -= len(data)
            yield data
