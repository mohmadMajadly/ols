"""تخزين ملفات الوسائط (تسجيلات الجلسات) على القرص تحت MEDIA_ROOT.

بنية الملفات:
    {MEDIA_ROOT}/recordings/{session_id}/seg_{segment:03d}_chunk_{index:05d}.part
        أثناء الرفع - كل بث MediaRecorder (segment) له فهرسة chunks خاصة به.
    {MEDIA_ROOT}/recordings/{session_id}/seg_{segment:03d}.webm
        ملف وسيط: إلحاق chunks segment واحد بالترتيب (صحيح داخلياً لأنه بث
        MediaRecorder واحد متصل).
    {MEDIA_ROOT}/recordings/{session_id}/recording.webm
        الملف النهائي بعد إعادة كبس/دمج ffmpeg لكل الـsegments - له فهارس
        قفز (cues) ومدة صحيحة في الترويسة.

كل القراءة/الكتابة هنا مجزأة (streamed) بحجم ثابت - لا تحميل ملفات
كاملة في الذاكرة. دمج الـsegments النهائي يمر عبر ffmpeg/ffprobe
(subprocess) لأن الإلحاق الخام لبثوق webm منفصلة ينتج ملفاً غير قابل
للتشغيل بعد أول بث.
"""

import re
import shutil
import struct
import subprocess
import uuid
from collections.abc import Iterator
from pathlib import Path

from app.core.config import settings

SEG_CHUNK_RE = re.compile(r"^seg_(\d{3})_chunk_(\d{5})\.part$")
STREAM_READ_SIZE = 1024 * 1024  # 1MB
FFMPEG_TIMEOUT_SECONDS = 120

WAVEFORM_BUCKET_COUNT = 800
WAVEFORM_SAMPLE_RATE = 8000
WAVEFORM_MAX_ABS_SAMPLE = 32768  # |أدنى قيمة int16| = 32768، نطبّع عليها


class FfmpegError(RuntimeError):
    """يُرفع عند فشل عملية ffmpeg/ffprobe أثناء دمج التسجيل النهائي."""


def session_media_dir(session_id: uuid.UUID) -> Path:
    return Path(settings.MEDIA_ROOT) / "recordings" / str(session_id)


def chunk_file_path(session_id: uuid.UUID, segment: int, index: int) -> Path:
    return session_media_dir(session_id) / f"seg_{segment:03d}_chunk_{index:05d}.part"


def segment_file_path(session_id: uuid.UUID, segment: int) -> Path:
    return session_media_dir(session_id) / f"seg_{segment:03d}.webm"


def recording_file_path(session_id: uuid.UUID) -> Path:
    return session_media_dir(session_id) / "recording.webm"


def recording_relative_path(session_id: uuid.UUID) -> str:
    """المسار المخزَّن في recordings.file_path، نسبي من MEDIA_ROOT."""
    return f"recordings/{session_id}/recording.webm"


def write_chunk(session_id: uuid.UUID, segment: int, index: int, data: bytes) -> None:
    """يكتب مقطعاً على القرص. عملية idempotent: إعادة رفع نفس (segment, index)
    تستبدله بالكامل (كتابة بملف مؤقت ثم استبدال ذرّي)."""
    directory = session_media_dir(session_id)
    directory.mkdir(parents=True, exist_ok=True)
    final_path = chunk_file_path(session_id, segment, index)
    tmp_path = final_path.with_name(final_path.name + ".tmp")
    with open(tmp_path, "wb") as f:
        f.write(data)
    tmp_path.replace(final_path)


def list_uploaded_indices_by_segment(session_id: uuid.UUID) -> dict[int, list[int]]:
    """يعيد {segment: [الفهارس المرفوعة مرتّبة]} اعتماداً على أجزاء .part
    الموجودة فعلياً على القرص."""
    directory = session_media_dir(session_id)
    if not directory.exists():
        return {}
    result: dict[int, list[int]] = {}
    for entry in directory.iterdir():
        match = SEG_CHUNK_RE.match(entry.name)
        if match:
            segment = int(match.group(1))
            index = int(match.group(2))
            result.setdefault(segment, []).append(index)
    for indices in result.values():
        indices.sort()
    return result


def missing_chunk_indices(uploaded: list[int], last_chunk_index: int) -> list[int]:
    uploaded_set = set(uploaded)
    return [i for i in range(last_chunk_index + 1) if i not in uploaded_set]


def merge_segment_chunks(session_id: uuid.UUID, segment: int, last_chunk_index: int) -> Path:
    """يدمج seg_{segment}_chunk_00000..last بالترتيب في seg_{segment}.webm
    (إلحاق خام صحيح لأنه نفس بث MediaRecorder المتصل)، يحذف أجزاء .part
    الخاصة بهذا الـsegment بعد النجاح، ويعيد مسار الملف الناتج."""
    out_path = segment_file_path(session_id, segment)
    with open(out_path, "wb") as out_f:
        for index in range(last_chunk_index + 1):
            part_path = chunk_file_path(session_id, segment, index)
            with open(part_path, "rb") as in_f:
                while True:
                    buf = in_f.read(STREAM_READ_SIZE)
                    if not buf:
                        break
                    out_f.write(buf)

    for index in range(last_chunk_index + 1):
        chunk_file_path(session_id, segment, index).unlink(missing_ok=True)

    return out_path


def _run_subprocess(args: list[str], *, error_label: str) -> subprocess.CompletedProcess:
    try:
        return subprocess.run(args, capture_output=True, timeout=FFMPEG_TIMEOUT_SECONDS)
    except subprocess.TimeoutExpired as exc:
        raise FfmpegError(f"{error_label} انتهت مهلته (timeout) عند تنفيذ: {' '.join(args)}") from exc
    except OSError as exc:
        raise FfmpegError(f"{error_label} تعذّر تشغيله: {exc}") from exc


def _run_ffmpeg(args: list[str]) -> None:
    result = _run_subprocess(args, error_label="ffmpeg")
    if result.returncode != 0:
        stderr = result.stderr.decode("utf-8", errors="replace")
        raise FfmpegError(f"فشل ffmpeg (rc={result.returncode}) عند تنفيذ: {' '.join(args)}\n{stderr}")


def concat_segments(session_id: uuid.UUID, segment_paths: list[Path]) -> Path:
    """يبني recording.webm النهائي من ملفات الـsegments (كل منها webm سليم
    داخلياً بفضل merge_segment_chunks) عبر إعادة كبس ffmpeg، ما يمنحه فهارس
    قفز (cues) ومدة صحيحة في الترويسة. segment واحد فقط → إعادة كبس مباشرة
    (`-c copy`). أكثر من segment → دمج concat demuxer (`-c copy`)، ومع فشل
    نادر (اختلاف بارامترات ترميز بين الـsegments) → إعادة محاولة بإعادة ترميز
    الصوت (`-c:a libopus`). يحذف ملفات الـsegments الوسيطة بعد النجاح فقط."""
    if not segment_paths:
        raise FfmpegError("لا توجد segments لدمجها")

    directory = session_media_dir(session_id)
    out_path = recording_file_path(session_id)

    if len(segment_paths) == 1:
        _run_ffmpeg(["ffmpeg", "-y", "-i", str(segment_paths[0]), "-c", "copy", str(out_path)])
    else:
        concat_list_path = directory / "concat_list.txt"
        list_content = "\n".join(f"file '{p}'" for p in segment_paths)
        concat_list_path.write_text(list_content, encoding="utf-8")
        try:
            try:
                _run_ffmpeg(
                    [
                        "ffmpeg",
                        "-y",
                        "-f",
                        "concat",
                        "-safe",
                        "0",
                        "-i",
                        str(concat_list_path),
                        "-c",
                        "copy",
                        str(out_path),
                    ]
                )
            except FfmpegError:
                # تعذّر النسخ المباشر (اختلاف نادر في بارامترات الترميز بين
                # الـsegments) - أعد المحاولة بإعادة ترميز الصوت.
                _run_ffmpeg(
                    [
                        "ffmpeg",
                        "-y",
                        "-f",
                        "concat",
                        "-safe",
                        "0",
                        "-i",
                        str(concat_list_path),
                        "-c:a",
                        "libopus",
                        "-b:a",
                        "48k",
                        str(out_path),
                    ]
                )
        finally:
            concat_list_path.unlink(missing_ok=True)

    for p in segment_paths:
        p.unlink(missing_ok=True)

    return out_path


def probe_duration_ms(path: Path) -> int | None:
    """يقرأ مدة الملف بالميلي ثانية عبر ffprobe. يعيد None إن فشل (استدعاء
    الطرف - المسؤول عن fallback لقيمة العميل إن وُجدت)."""
    try:
        result = _run_subprocess(
            [
                "ffprobe",
                "-v",
                "error",
                "-show_entries",
                "format=duration",
                "-of",
                "default=noprint_wrappers=1:nokey=1",
                str(path),
            ],
            error_label="ffprobe",
        )
    except FfmpegError:
        return None
    if result.returncode != 0:
        return None
    try:
        seconds = float(result.stdout.decode("utf-8", errors="replace").strip())
    except ValueError:
        return None
    return round(seconds * 1000)


def generate_waveform(path: Path) -> list[int]:
    """يفكّ الملف الصوتي إلى PCM خام (mono، 16-bit، 8kHz) عبر ffmpeg/stdout،
    ويقسّم العينات إلى 800 دلو متساوٍ (أقصر إن كانت العينات أقل من 800 -
    بلا padding)، ويأخذ أقصى قيمة مطلقة لكل دلو مطبّعة إلى عدد صحيح 0..100.

    يرفع ``FfmpegError`` عند فشل ffmpeg - المسؤول عن استدعاء هذه الدالة هو
    من يقرر عدم إفشال finalize بسببها (تحذير + NULL)."""
    result = _run_subprocess(
        [
            "ffmpeg",
            "-v",
            "error",
            "-i",
            str(path),
            "-f",
            "s16le",
            "-ac",
            "1",
            "-ar",
            str(WAVEFORM_SAMPLE_RATE),
            "-",
        ],
        error_label="ffmpeg (waveform)",
    )
    if result.returncode != 0:
        stderr = result.stderr.decode("utf-8", errors="replace")
        raise FfmpegError(f"فشل توليد المخطط الموجي (rc={result.returncode})\n{stderr}")

    raw = result.stdout
    sample_count = len(raw) // 2
    if sample_count == 0:
        return []

    samples = struct.unpack(f"<{sample_count}h", raw[: sample_count * 2])
    bucket_count = min(WAVEFORM_BUCKET_COUNT, sample_count)

    peaks: list[int] = []
    for i in range(bucket_count):
        start = i * sample_count // bucket_count
        end = (i + 1) * sample_count // bucket_count
        end = max(end, start + 1)
        bucket_max = max(abs(s) for s in samples[start:end])
        peaks.append(min(100, round(bucket_max * 100 / WAVEFORM_MAX_ABS_SAMPLE)))

    return peaks


def delete_session_media(session_id: uuid.UUID) -> None:
    """يحذف كل ملفات الجلسة (أجزاء .part وملفات seg_*.webm الوسيطة والتسجيل
    المدموج النهائي إن وُجد)."""
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
