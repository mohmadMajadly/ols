# WP2 — جلسات التسميع (Backend): التسجيل المقطعي، الملاحظات الموقوتة، الدرجة المقترحة

Spec author: المدير (Fable). Executor: Sonnet sub-agent.
Working directory: `C:\Users\madar\Documents\OLS`. كل الأوامر داخل Docker. **Backend فقط — لا تلمس `frontend/` ولا `docs/`.**
قاعدة git: مسارات صريحة فقط (`git add backend/...` وملف compose إن عدّلته) — ممنوع `git add -A`.

## الهدف

الواجهات الخلفية الكاملة لجلسة التسميع: إنشاء جلسة تبدأ التسجيل فوراً، استقبال الصوت مقطعياً بشكل مقاوم للانقطاع، ملاحظات مربوطة باللحظة الزمنية، إنهاء الجلسة بدرجة مقترحة محسوبة من الملاحظات وسلّم التقييم، وبث التسجيل مع دعم القفز (Range requests).

## تخزين الوسائط

- أضف إلى `docker-compose.yml`: named volume `media` يُركّب في backend على `/data/media`؛ ومتغير بيئة `MEDIA_ROOT=/data/media` (أضفه لـ config وenv.example — هذان الملفان مسموح تعديلهما).
- بنية الملفات: `/data/media/recordings/{session_id}/chunk_{index:05d}.part` أثناء الرفع، و`/data/media/recordings/{session_id}/recording.webm` بعد الإنهاء (تُحذف الأجزاء بعد نجاح الدمج).

## نموذج البيانات (Alembic migration `0003`)

### `sessions`
`id` UUID PK, `student_id` FK→students NOT NULL, `teacher_id` FK→users NOT NULL, `session_type` TEXT CHECK in (`sabq`,`sabqiyat`,`murajaah`) — (سبق/سبقيات/مراجعة كبرى), `status` TEXT CHECK in (`recording`,`completed`,`cancelled`) DEFAULT `recording`, `attendance` TEXT CHECK in (`hadir`,`mutaakhir`,`ghaib`) DEFAULT `hadir`, `range_start_surah` INT NULL, `range_start_ayah` INT NULL, `range_end_surah` INT NULL, `range_end_ayah` INT NULL, `suggested_grade` NUMERIC(5,2) NULL, `grade` NUMERIC(5,2) NULL (النهائية — يحررها المعلم), `summary` TEXT NULL, `started_at` timestamptz DEFAULT now, `ended_at` timestamptz NULL. فهارس: student_id، teacher_id، started_at.

### `recordings`
`id` UUID PK, `session_id` FK→sessions UNIQUE NOT NULL, `status` TEXT CHECK in (`uploading`,`ready`,`failed`) DEFAULT `uploading`, `mime_type` TEXT DEFAULT `audio/webm`, `duration_ms` INT NULL, `size_bytes` BIGINT NULL, `file_path` TEXT NULL (نسبي من MEDIA_ROOT), `created_at`, `finalized_at` NULL.

### `notes`
`id` UUID PK, `session_id` FK→sessions NOT NULL, `timestamp_ms` INT NULL (NULL = ملاحظة عامة غير موقوتة), `category_id` FK→note_categories NOT NULL, `subtype_id` FK→note_subtypes NULL, `severity` TEXT NULL CHECK in (`khafif`,`mutawassit`,`jasim`), `correction_mode` TEXT NULL CHECK in (`tadaruk`,`tanbih`,`talqin`), `surah` INT NULL, `ayah` INT NULL, `text` TEXT NULL, `extra` JSONB DEFAULT '{}' (قيم الحقول المخصصة: مفتاح = note_field id), `created_by` FK→users NOT NULL, `created_at`. فهرس على session_id.

### ثابت مرجعي في الكود
`app/core/quran_meta.py`: قاموس `SURAH_AYAH_COUNTS` للسور الـ114 (الاسم العربي وعدد الآيات — رواية حفص/العد الكوفي). يُستخدم للتحقق: `1 ≤ surah ≤ 114` و`1 ≤ ayah ≤ عدد آيات السورة`، والنطاق start ≤ end (بترتيب المصحف). أضف endpoint خفيف `GET /api/quran/surahs` يعيد القائمة (لكل الموظفين) — ستستعمله الواجهة لاختيار النطاق.

## دورة حياة الجلسة (APIs)

RBAC عام: **teacher** على طلاب حلقاته فقط؛ **admin/supervisor** قراءة كل شيء + إدارة أي جلسة؛ **student** 403. منفذ الجلسة (teacher_id) هو من أنشأها؛ لا يعدل جلسةَ غيرِه إلا admin/supervisor.

1. `POST /api/sessions` `{student_id, session_type, attendance?, range_start_*?, range_end_*?}` → ينشئ الجلسة (status=recording) + صف recording (status=uploading). يرفض (409 برسالة عربية) إن كان للمعلم جلسة أخرى بحالة recording. الغياب (`ghaib`): يُنشئ جلسة مكتملة فوراً بلا تسجيل (recording تُعلَّم failed أو لا تُنشأ — اختر الأنظف ووثّقه).
2. `PUT /api/sessions/{id}/chunks/{index}` — الجسم bytes خام (`Content-Type: application/octet-stream`). يكتب `chunk_{index:05d}.part` (idempotent — إعادة رفع نفس الفهرس تستبدله). حد أقصى لحجم المقطع 10MB (413). مسموح فقط والجلسة recording.
3. `GET /api/sessions/active` — جلسة المعلم الحالية بحالة recording (إن وجدت) + قائمة فهارس المقاطع المرفوعة فعلاً (من القرص) — هذه آلية الاستئناف بعد انقطاع/تحديث صفحة.
4. `POST /api/sessions/{id}/finalize` `{last_chunk_index, duration_ms, attendance?, grade?, summary?}` → يتحقق أن كل الفهارس 0..last موجودة (وإلا 409 مع قائمة الفهارس الناقصة — الواجهة تعيد رفعها)، يدمجها بالترتيب في `recording.webm` (مقاطع MediaRecorder من نفس الجلسة تُدمج بالإلحاق البسيط)، يحذف الـ parts، يحدّث recording (ready, size, duration, file_path) والجلسة (completed, ended_at)، ويحسب `suggested_grade` (أدناه). إن لم يُمرَّر grade تُنسخ المقترحة إليها.
5. `POST /api/sessions/{id}/cancel` → cancelled + حذف المقاطع.
6. `PATCH /api/sessions/{id}` — بعد الإكمال: تعديل grade/summary/attendance/النطاق فقط.
7. `GET /api/sessions` — فلاتر: `student_id`, `group_id`, `session_type`, `from`, `to` (على started_at)، ترقيم صفحات `limit/offset` (افتراضي 50). المعلم يرى جلساته فقط. تتضمن كل عنصر: بيانات مختصرة + اسم الطالب + عدد الملاحظات + الدرجة.
8. `GET /api/sessions/{id}` — التفاصيل الكاملة: الجلسة + الملاحظات مرتبة بـ timestamp_ms (العامة أولاً) + حالة التسجيل.

## الملاحظات (APIs)

- `POST /api/sessions/{id}/notes` `{timestamp_ms?, category_id, subtype_id?, severity?, correction_mode?, surah?, ayah?, text?, extra?}` — مسموح أثناء recording وبعد completed (مراجعة لاحقة). تحقق: الفئة نشطة؛ subtype تابع للفئة؛ صحة surah/ayah من `SURAH_AYAH_COUNTS`؛ مفاتيح extra موجودة في note_fields النشطة وقيمها بحسب field_type (نص/رقم/خيار من options). أخطاء عربية واضحة.
- `PATCH /api/notes/{id}` / `DELETE /api/notes/{id}` — منشئها أو admin/supervisor. لو عُدلت/حُذفت ملاحظة بعد إكمال الجلسة يُعاد حساب suggested_grade (والـ grade **لا** تُلمس إن كان المعلم عدّلها يدوياً — قارن: إن كانت grade == suggested_grade القديمة حدّثها معها، وإلا اتركها).

## احتساب الدرجة المقترحة

في `app/services/grading.py` (دالة نقية قابلة للاختبار):
- البداية 100. لكل ملاحظة: حدد سلة الخصم من `category.color` → (`hifz`/`tajwid`/`dabt`/`waqf`؛ الألوان `sahih`/`neutral` = خصم 0). القيمة = `rubric.deductions[bucket][correction_mode]`؛ إن كانت correction_mode فارغة اعتمد `tanbih`. اطرح الجميع؛ الحد الأدنى 0؛ قرّب لمنزلتين.
- (الأوزان `weights` غير مستخدمة في هذه الصيغة الآن — ستدخل في تقارير لاحقة؛ لا تستخدمها هنا.)

## بث التسجيل

`GET /api/sessions/{id}/audio` — يخدم `recording.webm` بدعم **HTTP Range** كامل (206, Accept-Ranges, Content-Range — ضروري للقفز في المشغّل). مصادقة عبر كوكي الجلسة العادية + نفس قواعد RBAC. 404 إن لم يكن ready. استخدم `fastapi.responses` مع قراءة مجزأة — لا تحميل الملف كاملاً في الذاكرة.

## الاختبارات (إضافة للسويت القائم — كله يجب أن يبقى أخضر)

- دورة كاملة: إنشاء → رفع 3 مقاطع (بايتات وهمية) → finalize → الملف المدموج = تسلسل البايتات بالترتيب، الجلسة completed، الأجزاء حُذفت.
- فجوة مقاطع: رفع 0 و2 ثم finalize(last=2) → 409 يذكر الفهرس 1؛ بعد رفعه ينجح.
- الاستئناف: `GET /api/sessions/active` يعيد الجلسة والفهارس المرفوعة.
- منع جلستين recording لنفس المعلم (409).
- ملاحظات: صحة التحقق (آية خارج نطاق السورة تُرفض؛ subtype من فئة أخرى يُرفض؛ extra بمفتاح غير معروف يُرفض)، وإعادة حساب الدرجة بعد حذف ملاحظة (بالحالتين: grade يدوية لا تُمس / grade تابعة تتحدث).
- grading: اختبارات وحدة مباشرة على الدالة (خصومات متعددة الفئات والأوضاع، أرضية الصفر، فئة sahih لا تخصم).
- RBAC: معلم آخر لا يرى الجلسة (404) ولا يضيف ملاحظة؛ admin يرى.
- بث: طلب Range يعيد 206 والمحتوى الجزئي الصحيح.

## معايير القبول

1. `docker compose exec backend pytest` أخضر كاملاً (القديم + الجديد).
2. سيناريو curl كامل موثق: دخول معلم → إنشاء جلسة لطالبه → رفع مقاطع → ملاحظة موقوتة أثناءها → finalize → GET التفاصيل تُظهر الدرجة المقترحة والملاحظات → طلب Range على الصوت يعيد 206.
3. `docker compose down -v` ثم up: سلسلة المهاجرات 0001→0003 تمر نظيفة والبذور تعمل.
4. git نظيف، commits منطقية بمسارات صريحة.

## التقرير النهائي (بالعربية)
ما بُني، الانحرافات ولماذا، إثباتات المعايير، ملاحظات للمراجعة.
