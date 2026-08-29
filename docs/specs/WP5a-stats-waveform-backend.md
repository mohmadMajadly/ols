# WP5a — إحصائيات الطالب ولوحة التحكم + المخطط الموجي (Backend)

Spec author: المدير (Fable). Executor: Sonnet sub-agent.
Working directory: `C:\Users\madar\Documents\OLS`. كل الأوامر داخل Docker. **Backend فقط.** لا تلمس `frontend/` ولا `docs/`.
git: **لا تنشئ commits** — المدير يثبّت بعد المراجعة (وكيل آخر يعمل بالتوازي). اذكر قائمة ملفاتك كاملة في التقرير.

## الجزء الأول — المخطط الموجي (Waveform peaks)

عند `finalize` الناجح، ولّد قمم الموجة من الملف النهائي وخزّنها:
- Migration `0004`: عمود `waveform` JSONB NULL على `recordings`.
- التوليد في `media_storage.py`: ffmpeg يفك الملف إلى PCM خام (`-f s16le -ac 1 -ar 8000 -`) عبر stdout، اقرأ البايتات، قسّمها إلى **800 دلو** متساوٍ، خذ أقصى قيمة مطلقة لكل دلو، وطبّعها إلى أعداد صحيحة 0..100. النتيجة: مصفوفة 800 int (أقصر إن كان التسجيل أقصر من 800 عينة دلو — لا padding).
- فشل التوليد **لا يفشل** الإنهاء (سجّل تحذيراً واترك waveform=NULL).
- `GET /api/sessions/{id}` يعيد الآن ضمن بيانات التسجيل: `waveform` و`duration_ms`.

## الجزء الثاني — إحصائيات الطالب

`GET /api/students/{id}/stats` (نفس قواعد رؤية الطالب في `students.py`؛ الجلسات المحسوبة completed فقط ما لم يُذكر غير ذلك):
```json
{
  "totals": {
    "sessions": 0, "notes": 0, "total_recorded_ms": 0,
    "avg_grade": null, "attendance_rate": null
  },
  "grades_trend": [{"session_id": "...", "date": "...", "grade": 95.5, "session_type": "sabq"}],
  "errors_by_category": [{"category_id": "...", "name": "...", "color": "hifz", "count": 12}],
  "top_subtypes": [{"subtype_id": "...", "name": "...", "category_name": "...", "color": "hifz", "count": 5}],
  "sessions_by_type": {"sabq": 10, "sabqiyat": 5, "murajaah": 3},
  "repeated_mistakes": [{"surah": 2, "surah_name": "البقرة", "ayah": 30, "count": 3, "categories": ["أخطاء الحفظ"]}]
}
```
- `avg_grade`: متوسط grade للجلسات المكتملة ذات الدرجة (منزلتان).
- `attendance_rate`: نسبة الجلسات hadir/mutaakhir من الكل (شاملة الملغاة؟ لا — المكتملة فقط + جلسات الغياب).
- `grades_trend`: آخر 20 جلسة مكتملة بدرجة، تصاعدياً بالتاريخ.
- `top_subtypes`: أعلى 10.
- `repeated_mistakes`: مواضع (سورة، آية) عليها ملاحظات من فئات خصم (ألوان hifz/tajwid/dabt/waqf) في **جلستين مختلفتين أو أكثر** (أو ≥3 ملاحظات إجمالاً)، الأعلى تكراراً أولاً، حد 20. اسم السورة من `quran_meta`.

## الجزء الثالث — إحصائيات لوحة التحكم

`GET /api/dashboard/stats?group_id=&teacher_id=&session_type=&from=&to=`
- RBAC: teacher تُفرض عليه جلساته/حلقاته تلقائياً (يتجاهل teacher_id الوارد)؛ admin/supervisor بلا قيد. student → 403.
- الفترة الافتراضية: آخر 30 يوماً (from/to على `started_at`).
```json
{
  "totals": {"active_students": 0, "sessions": 0, "notes": 0, "avg_grade": null,
              "attendance_rate": null, "total_recorded_ms": 0},
  "sessions_over_time": [{"date": "2026-08-01", "count": 4}],
  "errors_by_category": [{"category_id": "...", "name": "...", "color": "hifz", "count": 30}],
  "grade_distribution": [{"bucket": "90-100", "count": 12}, {"bucket": "80-89", "count": 5},
                          {"bucket": "70-79", "count": 2}, {"bucket": "أقل من 70", "count": 1}],
  "needs_attention": [{"student_id": "...", "full_name": "...", "group_name": "...",
                        "avg_grade": 71.2, "sessions": 4}],
  "groups_summary": [{"group_id": "...", "name": "...", "students": 12, "sessions": 40, "avg_grade": 88.1}]
}
```
- `sessions_over_time`: عدّ يومي للجلسات المكتملة داخل الفترة (أيام بلا جلسات لا تُرسل — الواجهة تملأ الفراغ).
- `needs_attention`: طلاب لهم ≥3 جلسات مكتملة بدرجة في الفترة ومتوسطهم الأدنى — حد 5 (هدفها مساعدة المعلم لا التشهير؛ التسمية مقصودة «بحاجة لعناية»).
- `groups_summary`: للحلقات النشطة ضمن نطاق الرؤية.
- استخدم استعلامات SQL مجمعة (GROUP BY) لا حلقات بايثون على صفوف كاملة.

## الاختبارات

سيناريو مبذور غني في fixture: حلقتان بمعلمين، 3 طلاب، ~8 جلسات مكتملة بتواريخ ودرجات وأنواع مختلفة + ملاحظات بفئات وأنواع فرعية ومواضع متعمدة (منها موضع مكرر عبر جلستين) + جلسة غياب + جلسة ملغاة (يجب ألا تُحسب):
- صحة كل حقل رقمي في stats الطالب (قيم متوقعة محسوبة يدوياً في الاختبار).
- repeated_mistakes يلتقط الموضع المكرر ولا يلتقط موضع فئة itqan.
- dashboard: الفلاتر (group_id/session_type/from/to) تغيّر النتائج كما متوقع؛ عزل teacher (يرى أرقام حلقاته فقط)؛ student → 403.
- waveform: بعد finalize بصوت حقيقي (fixture `make_webm_audio` القائمة) — المصفوفة طولها ≤800 وغير فارغة وقيمها 0..100، وتظهر في `GET /api/sessions/{id}`.

## معايير القبول
1. `docker compose exec backend pytest` أخضر كاملاً (74 القائمة + الجديدة).
2. إثبات curl: stats طالب حقيقي + dashboard بفلترين مختلفين، وأرقامهما متسقة.
3. `down -v` ثم up: سلسلة 0001→0004 نظيفة.
4. لا commits؛ قائمة الملفات في التقرير.

## التقرير (بالعربية)
ما بُني، الانحرافات، الإثباتات، قائمة الملفات، ملاحظات.
