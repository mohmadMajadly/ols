"""تحميل نموذج tarteel-ai/whisper-base-ar-quran وتحويله إلى CTranslate2 INT8
مرة واحدة فقط عند أول إقلاع، ضمن volume دائم (asr_models) — راجع
docs/design/ASR-ARCHITECTURE.md §1 و docs/specs/WP9c-asr-service.md §1.

كتبه الوكيل المنفّذ (WP9c) — منفصل تماماً عن alignment.py/normalize.py
(خوارزمية المدير) التي لا يلمسها هذا الملف إطلاقاً.
"""

from __future__ import annotations

import logging
import os
import subprocess
import time
from pathlib import Path

logger = logging.getLogger(__name__)

MODEL_ID = "tarteel-ai/whisper-base-ar-quran"

# يُخزَّن النموذج المحوَّل داخل volume دائم اسمه asr_models (docker-compose.yml)
# حتى لا يُعاد التحويل الثقيل (تحميل + تحويل) عند كل إعادة تشغيل للحاوية.
MODELS_ROOT = Path(os.environ.get("ASR_MODELS_DIR", "/models"))
CT2_DIR = MODELS_ROOT / "ct2-int8"


def _is_converted(model_dir: Path) -> bool:
    return (model_dir / "model.bin").exists() and (model_dir / "config.json").exists()


def _dir_size_mb(path: Path) -> float:
    return sum(f.stat().st_size for f in path.rglob("*") if f.is_file()) / (1024 * 1024)


def ensure_model(model_dir: Path = CT2_DIR) -> Path:
    """يضمن وجود نموذج CT2 INT8 محوَّل في model_dir، ويحوّله عند الحاجة فقط.

    التحويل يستدعي ct2-transformers-converter (سكربت وحدة تثبيت ctranslate2)
    الذي يحمّل أوزان tarteel-ai/whisper-base-ar-quran الأصلية (transformers/torch)
    من HuggingFace Hub ثم يحوّلها إلى صيغة CTranslate2 بتكميم INT8. هذا يحدث
    مرة واحدة فقط طوال عمر الـvolume — التشغيلات التالية تكتشف النموذج جاهزاً
    فوراً (فحص وجود model.bin/config.json فقط، لا إعادة تحميل).
    """
    if _is_converted(model_dir):
        logger.info("النموذج المحوَّل موجود بالفعل في %s (%.1f ميجابايت) — لا تحويل", model_dir, _dir_size_mb(model_dir))
        return model_dir

    model_dir.parent.mkdir(parents=True, exist_ok=True)
    logger.info("النموذج غير موجود — بدء تحميل %s وتحويله إلى CTranslate2 INT8 (أول تشغيل فقط)...", MODEL_ID)

    t0 = time.monotonic()
    result = subprocess.run(
        [
            "ct2-transformers-converter",
            "--model",
            MODEL_ID,
            "--output_dir",
            str(model_dir),
            "--quantization",
            "int8",
            "--force",
        ],
        capture_output=True,
        text=True,
    )
    elapsed = time.monotonic() - t0

    if result.returncode != 0:
        raise RuntimeError(
            f"فشل تحويل نموذج ASR ({MODEL_ID}) عبر ct2-transformers-converter "
            f"(انتهى بعد {elapsed:.1f}s):\n--- stdout ---\n{result.stdout}\n--- stderr ---\n{result.stderr}"
        )

    if not _is_converted(model_dir):
        raise RuntimeError(
            f"ct2-transformers-converter انتهى بنجاح ظاهرياً لكن لم يُنتج model.bin/config.json في {model_dir}"
        )

    size_mb = _dir_size_mb(model_dir)
    logger.info("اكتمل تحويل النموذج في %.1f ثانية — الحجم النهائي %.1f ميجابايت (%s)", elapsed, size_mb, model_dir)
    return model_dir
