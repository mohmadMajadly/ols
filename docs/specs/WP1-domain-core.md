# WP1 — نواة النطاق (Backend): الحلقات، الطلاب، تصنيفات الملاحظات، سلّم التقييم

Spec author: المدير (Fable). Executor: Sonnet sub-agent.
Working directory: `C:\Users\madar\Documents\OLS`. كل الأوامر داخل Docker. **Backend فقط — لا تلمس `frontend/` ولا `docs/` إطلاقاً.**
قاعدة git: أضف الملفات بمسارات صريحة (`git add backend/...`) — ممنوع `git add -A` أو `git add .`.

## الهدف

نمذجة قلب النظام وواجهاته: الحلقات (groups)، الطلاب، شجرة تصنيفات الملاحظات الديناميكية (فئات + أنواع فرعية + حقول مخصصة)، وإعدادات سلّم التقييم — مع RBAC كامل واختبارات.

## نموذج البيانات (Alembic migration جديدة واحدة `0002`)

### `groups` (الحلقات)
`id` UUID PK, `name` TEXT NOT NULL UNIQUE, `description` TEXT NULL, `teacher_id` UUID NULL FK→users.id (معلم الحلقة), `is_active` BOOL DEFAULT true, `created_at` timestamptz.

### `students`
`id` UUID PK, `full_name` TEXT NOT NULL, `group_id` UUID NULL FK→groups.id, `user_id` UUID NULL UNIQUE FK→users.id (حساب دخول الطالب — يبقى NULL في هذه الحزمة), `phone` TEXT NULL, `guardian_phone` TEXT NULL (هاتف ولي الأمر), `birth_year` INT NULL, `joined_at` DATE DEFAULT CURRENT_DATE, `memorization_note` TEXT NULL (وصف حر لمستوى الحفظ الحالي), `is_active` BOOL DEFAULT true, `created_at` timestamptz. فهرس على `group_id` وعلى `full_name`.

### `note_categories` (فئات الملاحظات — ديناميكية)
`id` UUID PK, `key` TEXT UNIQUE NULL (للفئات النظامية فقط), `name` TEXT NOT NULL (عربي), `color` TEXT NOT NULL — قيمة من enum تطبيقي محصور: `hifz | tajwid | dabt | waqf | sahih | neutral` (تشير لـ design tokens، لا hex), `sort_order` INT, `is_system` BOOL DEFAULT false (النظامية لا تُحذف — تُعطّل فقط), `is_active` BOOL DEFAULT true.

### `note_subtypes` (الأنواع الفرعية)
`id` UUID PK, `category_id` UUID FK→note_categories.id ON DELETE CASCADE, `name` TEXT NOT NULL, `sort_order` INT, `is_active` BOOL DEFAULT true. UNIQUE(category_id, name).

### `note_fields` (حقول مخصصة تظهر في نموذج الملاحظة — مرونة الإكسل)
`id` UUID PK, `name` TEXT NOT NULL, `field_type` TEXT CHECK in (`text`,`number`,`select`), `options` JSONB NULL (لقوائم select: مصفوفة نصوص), `sort_order` INT, `is_active` BOOL DEFAULT true.

### `rubric_settings` (سلّم التقييم — صف واحد)
`id` INT PK CHECK (id=1), `weights` JSONB NOT NULL — الافتراضي `{"hifz":70,"tajwid":25,"adaa":5}`, `deductions` JSONB NOT NULL — الافتراضي:
```json
{
  "hifz":   {"tadaruk": 0,   "tanbih": 0.75, "talqin": 1.5},
  "tajwid": {"tadaruk": 0,   "tanbih": 0.25, "talqin": 0.5},
  "dabt":   {"tadaruk": 0,   "tanbih": 0.5,  "talqin": 1.0},
  "waqf":   {"tadaruk": 0,   "tanbih": 0.25, "talqin": 0.5}
}
```
(القيم من أعراف لوائح تحكيم المسابقات؛ قابلة للتعديل من الإعدادات.)

### Enums تطبيقية (في الكود لا في قاعدة البيانات — تُخزن لاحقاً على الملاحظات)
- `severity`: `khafif | mutawassit | jasim`
- `correction_mode`: `tadaruk | tanbih | talqin` (تدارك ذاتي / تنبيه / تلقين «فُتح عليه»)

## بذرة التصنيفات (seed idempotent — يعمل عند الإقلاع كزرع الأدمن، لا يكرر ولا يعيد إنشاء ما عدّله المستخدم؛ استخدم `key` للتمييز)

1. **أخطاء الحفظ** (key=`hifz`, color=`hifz`): إبدال حرف، إبدال حركة، إبدال كلمة، زيادة حرف/كلمة، نقص حرف/كلمة، تقديم وتأخير، تردد وتلعثم، نسيان آية، خلط بالمتشابهات.
2. **أخطاء التجويد** (key=`tajwid`, color=`tajwid`): المدود، الغنة، المخارج والصفات، التفخيم والترقيق، القلقلة، أحكام النون الساكنة والتنوين، أحكام الميم الساكنة.
3. **الضبط والتشكيل** (key=`dabt`, color=`dabt`): تحريك ساكن، تسكين متحرك، خطأ حركة إعرابية.
4. **الوقف والابتداء** (key=`waqf`, color=`waqf`): وقف قبيح، ابتداء غير صحيح، تجاوز وقف لازم.
5. **إتقان** (key=`itqan`, color=`sahih`): أداء متقن، تحسّن ملحوظ. (فئة إيجابية — التقييم ليس أخطاء فقط.)

## الواجهات (APIs)

قواعد RBAC (استخدم `require_roles` القائمة):
- **admin/supervisor**: كل شيء.
- **teacher**: يرى ويدير حلقاته فقط (groups حيث teacher_id=هو) وطلابها: قراءة قوائمها، إضافة/تعديل طلاب فيها. لا يعدّل التصنيفات ولا الـ rubric (قراءة فقط).
- **student**: لا شيء في هذه الحزمة (403).

المسارات:
- `GET/POST /api/groups`, `GET/PATCH /api/groups/{id}` — لا حذف صلب؛ تعطيل فقط. GET يدعم `?include_inactive=`. تضمين عدد الطلاب في الاستجابة (`students_count`).
- `GET/POST /api/students`, `GET/PATCH /api/students/{id}` — GET قائمة تدعم `?group_id=&q=` (بحث substring في الاسم) و`?include_inactive=`. تحقّق أن teacher لا يضيف طالباً لحلقة ليست له (403).
- `GET /api/taxonomy` — الشجرة كاملة (فئات نشطة بترتيبها وداخلها أنواعها + الحقول المخصصة) — متاحة لكل الأدوار الموظفة (admin/supervisor/teacher).
- `POST/PATCH /api/taxonomy/categories[/{id}]`, `POST/PATCH /api/taxonomy/subtypes[/{id}]`, `POST/PATCH /api/taxonomy/fields[/{id}]` — admin/supervisor فقط. محاولة حذف فئة نظامية = 400 برسالة عربية؛ التعطيل مسموح. إعادة الترتيب عبر PATCH sort_order.
- `GET /api/rubric` (كل الموظفين) / `PUT /api/rubric` (admin فقط) — تحقق: الأوزان أرقام ≥0 ومجموعها 100؛ قيم الخصومات أرقام ≥0.

كل رسائل الأخطاء بالعربية. كل الاستجابات تستثني الحقول الحساسة.

## الاختبارات (أضف إلى pytest suite القائمة)

- CRUD الحلقات والطلاب + الفلاتر والبحث.
- عزل المعلم: teacher1 لا يرى طلاب حلقة teacher2 (قائمة وتفصيلاً 404/403)، ولا يضيف طالباً لحلقتها.
- الطالب (دور student) يُرفض في كل المسارات.
- بذرة التصنيفات: موجودة بعد الإقلاع، وإعادة الإقلاع لا تكررها، وتعديل اسم فئة نظامية ثم إعادة الإقلاع لا يسترجعه.
- منع حذف فئة نظامية؛ تعطيلها يخفيها من `GET /api/taxonomy`.
- rubric: القيم الافتراضية صحيحة؛ PUT بوزن مجموعه ≠100 يُرفض 422/400.

## معايير القبول

1. `docker compose exec backend pytest` أخضر بالكامل (القديم والجديد).
2. `alembic upgrade head` نظيف من حالة WP0 (جرب: `docker compose down -v` ثم up — يجب أن يمر 0001 ثم 0002 والبذور تعمل).
3. إثباتات curl: إنشاء حلقة بمعلم، إنشاء طالب فيها، دخول كمعلم آخر والتحقق من العزل (403/404)، `GET /api/taxonomy` يعيد الشجرة المبذورة، `PUT /api/rubric` بأوزان خاطئة يُرفض.
4. git نظيف بنهاية العمل، commits بمسارات صريحة.

## التقرير النهائي (بالعربية)
ما بُني، الانحرافات ولماذا، إثباتات المعايير، ملاحظات للمراجعة.
