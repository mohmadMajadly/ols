# WP4a — تحسين التسجيل الخلفي: مقاطع متعددة (Segments) + إعادة كبس ffmpeg

Spec author: المدير (Fable). Executor: Sonnet sub-agent.
Working directory: `C:\Users\madar\Documents\OLS`. كل الأوامر داخل Docker. **Backend فقط** (+`backend/Dockerfile`). لا تلمس `frontend/` ولا `docs/`.
git: مسارات صريحة فقط. **لا تعدّل ملفات لم تذكرها هذه المواصفة.**

## المشكلة (السياق)

1. ملف webm الخارج من MediaRecorder بلا فهارس قفز (cues) وبلا مدة في الترويسة → القفز الزمني في المشغّل (جوهر ميزة الملاحظات الموقوتة) غير موثوق.
2. عند تحديث الصفحة أثناء الجلسة يبدأ MediaRecorder جديد ببث webm جديد له ترويسة مستقلة — الإلحاق البسيط للبثين في ملف واحد يُنتج ملفاً لا يُشغَّل ما بعد أول بث.

الحل: كل بث MediaRecorder = **segment** مستقل؛ عند الإنهاء يُبنى كل segment بالإلحاق (صحيح داخلياً)، ثم يدمج ffmpeg الـ segments بملف نهائي واحد سليم بفهارس ومدة صحيحة.

## التعديلات

### 1. `backend/Dockerfile`
إضافة ffmpeg (`apt-get install -y --no-install-recommends ffmpeg` مع تنظيف apt lists). أعد بناء الصورة وتحقق `ffmpeg -version` و`ffprobe -version` داخل الحاوية.

### 2. تسمية المقاطع في `media_storage.py`
`recordings/{session_id}/seg_{segment:03d}_chunk_{index:05d}.part`. (لا حاجة لتوافق خلفي — لا بيانات إنتاج.)

### 3. `PUT /api/sessions/{id}/chunks/{index}`
معامل استعلام جديد `?segment=` (int ≥ 0، افتراضي 0). نفس idempotency والحد 10MB.

### 4. `GET /api/sessions/active`
تعيد الآن: لكل segment قائمة الفهارس المرفوعة — بنية `uploaded: {"0": [0,1,2], "1": [0]}` — والعميل يبدأ segment جديداً برقم أعلى من الأقصى الموجود.

### 5. `POST /api/sessions/{id}/finalize`
- الجسم: `{segments: {"0": last_index_0, "1": last_index_1, ...}, duration_ms?, ...}` بدل `last_chunk_index` المفرد.
- التحقق: لكل segment مذكور كل الفهارس 0..last موجودة (409 بقائمة الناقص لكل segment)؛ وأي segment موجود على القرص غير مذكور في الجسم = 409 أيضاً (حماية من فقدان بيانات صامت).
- الدمج: (أ) لكل segment: إلحاق chunks بالترتيب → `seg_{n}.webm`. (ب) ffmpeg: segment واحد → `ffmpeg -i seg_0.webm -c copy recording.webm` (إعادة كبس تكتب cues والمدة)؛ أكثر من segment → concat demuxer (`-f concat -safe 0 -c copy`). إن فشل `-c copy` للتعدد (اختلاف بارامترات نادر) → fallback بإعادة ترميز `-c:a libopus -b:a 48k`. نفّذ ffmpeg عبر subprocess بمهلة (120s) والتقط stderr للسجل عند الفشل (500 برسالة عربية + status=failed).
- المدة: اقرأها بـ ffprobe من الملف النهائي (`format=duration`) وخزّنها `duration_ms` (تجاهل قيمة العميل إن وُجدت، أو اعتمدها فقط كـ fallback إن فشل ffprobe).
- التنظيف: حذف parts وseg files الوسيطة بعد النجاح.

### 6. الاختبارات (حدّث القائمة وأضف)
- حدّث اختبارات WP2 القائمة للبنية الجديدة (segment=0).
- جديد: توليد صوت حقيقي داخل الاختبار عبر ffmpeg في الحاوية (`ffmpeg -f lavfi -i "sine=frequency=440:duration=2" -c:a libopus out.webm`)، تقسيمه بايتياً كـ chunks، ورفعه على segmentين منفصلين (ولّد ملفين)، ثم finalize → تحقق: status=ready، `duration_ms` بين 3500 و4500 (2s+2s)، وffprobe على الملف النهائي يقرأ مدة صحيحة.
- فجوة في segment ثانٍ → 409 يسمي segment والفهرس.
- segment على القرص غير مذكور في finalize → 409.

## معايير القبول
1. `docker compose exec backend pytest` أخضر كاملاً (70 القديمة محدّثة + الجديدة).
2. إثبات curl: سيناريو segmentين بصوت حقيقي → تفاصيل الجلسة تُظهر duration_ms صحيحة، وRange 206 يعمل على الملف النهائي.
3. `docker compose build backend` ينجح و`ffmpeg -version` يعمل داخل الحاوية.
4. git نظيف بمسارات صريحة.

## التقرير النهائي (بالعربية)
ما بُني، الانحرافات، الإثباتات، ملاحظات.
