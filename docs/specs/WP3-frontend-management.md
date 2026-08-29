# WP3 — واجهات الإدارة (Frontend): الحلقات، الطلاب، المستخدمون

Spec author: المدير (Fable). Executor: Sonnet sub-agent.
Working directory: `C:\Users\madar\Documents\OLS`. كل الأوامر داخل Docker.

## قواعد خاصة بهذه الحزمة

- **ممنوع استخدام git نهائياً** (لا add ولا commit) — وكيل آخر يعمل على الـ backend بالتوازي، والمدير هو من يثبّت عملك بعد المراجعة.
- نطاق الملفات: `frontend/src/**` فقط، **باستثناء** تعديلين خلفيين محددين مسموحين حصراً:
  1. `backend/app/api/routes/users.py`: اجعل `GET /api/users` متاحاً لـ admin **و**supervisor (البقية تبقى admin فقط)، وأضف فلتر `?role=` اختيارياً؛ وأضف حماية: رفض (400 برسالة عربية) أي PATCH يعطّل أو يغيّر دور **آخر admin نشط** في النظام.
  2. `backend/tests/test_users.py`: اختبارات للتعديلين (supervisor يستطيع GET، teacher لا؛ فلتر role يعمل؛ تعطيل آخر admin يُرفض 400؛ تعطيل admin غير أخير ينجح).
- لا مكتبات npm جديدة. استخدم مكونات `frontend/src/ui/` القائمة حصراً؛ إن احتجت مكوناً عاماً جديداً فابنه بنفس الأسلوب داخل `src/ui/` ملتزماً بـ `docs/design/DIRECTION.md` (اقرأها).
- كل النصوص عربية بصوت الواجهة المحدد في DIRECTION.md §7 (أفعال أمر واضحة، لا تعجب، مصطلحات شرعية صحيحة).

## الواجهات الخلفية المتاحة (مبنية ومختبرة)

- `GET/POST /api/groups`, `GET/PATCH /api/groups/{id}` — الحقول: name, description, teacher_id, is_active + students_count في القراءة. admin/supervisor يكتبان؛ teacher يقرأ حلقاته فقط.
- `GET/POST /api/students`, `GET/PATCH /api/students/{id}` — full_name, group_id, phone, guardian_phone, birth_year, memorization_note, is_active. فلاتر: `?group_id=&q=&include_inactive=`. teacher مقيد بحلقاته.
- `GET /api/users` (بعد تعديلك: admin+supervisor، `?role=`), `POST /api/users`, `PATCH /api/users/{id}` (admin فقط) — username, password, full_name, role (admin/supervisor/teacher/student), is_active.
- `GET /api/auth/me` — فيه `role` (موجود في AuthContext).

## الصفحات المطلوبة

### 1. الحلقات `/groups`
- جدول: اسم الحلقة، المعلم (اسمه الكامل — اجلب المستخدمين بدور teacher لعرض الاسم؛ للمعلم الذي لا يملك صلاحية جلب المستخدمين اعرض «—» بدون كسر الصفحة)، عدد الطلاب، الحالة (Badge)، تاريخ الإنشاء.
- زر «إضافة حلقة» (admin/supervisor فقط) → Modal: الاسم (مطلوب)، الوصف، المعلم (Select من users بدور teacher، اختياري). التعديل من صف الجدول → نفس الـ Modal + مفتاح تعطيل/تفعيل.
- Toast نجاح/فشل بالعربية. حالة فارغة: «لا حلقات بعد — أضف أول حلقة».
- صف الجدول ينقل إلى `/students?group_id=...` (عرض طلاب الحلقة).

### 2. الطلاب `/students`
- شريط أدوات: بحث فوري بالاسم (debounce 300ms)، فلتر حلقة (Select)، مفتاح «إظهار غير النشطين».
- جدول: الاسم الكامل، الحلقة، هاتف ولي الأمر، سنة الميلاد، الحالة، تاريخ الالتحاق. ترقيم عرض بسيط إن زاد العدد عن 50 (client-side يكفي الآن).
- «إضافة طالب» → Modal بكل الحقول؛ **للمعلم: حقل الحلقة مطلوب** (حلقاته فقط تظهر في القائمة — إن كان الدور teacher فالمصدر `GET /api/groups` يعيد حلقاته أصلاً)، لغير المعلم اختياري. التعديل بنفس النمط.
- النقر على اسم الطالب → `/students/{id}` صفحة placeholder (PageHeader باسم الطالب + EmptyState «ملف الطالب قيد الإنشاء») — الملف الكامل حزمة لاحقة.

### 3. المستخدمون `/users` (admin فقط)
- جدول: اسم المستخدم، الاسم الكامل، الدور (Badge بألوان محايدة/لازوردية)، الحالة، تاريخ الإنشاء.
- «إضافة مستخدم» → Modal: username, password (مع مؤشر بسيط لطول ≥8 — تحقق واجهة فقط), full_name, role (أسماء الأدوار بالعربية: مدير/مشرف/معلم/طالب).
- تعديل: full_name, role, تفعيل/تعطيل، «تعيين كلمة مرور جديدة» (حقل اختياري في نفس الـ Modal).
- أخطاء الخادم (409 تكرار، 400 آخر أدمن) تُعرض كما وردت بالعربية.

### 4. التنقل والصلاحيات
- في AppShell: أضف بند «المستخدمون» (يظهر لـ admin فقط)، وأخفِ «الإعدادات» عن teacher (ستكون admin/supervisor لاحقاً). بنود لا صفحة لها بعد تبقى placeholder كما هي.
- حارس مسار عام: صفحة `/users` لغير admin تعيد توجيهاً لـ `/` (ولا تظهر في التنقل أصلاً).

## أنماط تقنية إلزامية

- كل جلب بيانات عبر `@tanstack/react-query` مع مفاتيح queryKey منظمة (`['groups']`, `['students', filters]`...) وinvalidation صحيحة بعد كل mutation.
- الأخطاء: ApiError.detail يظهر في Toast؛ خطأ الشبكة رسالة عامة عربية.
- حالات التحميل: Spinner متمركز للصفحة، وloading على أزرار الحفظ.
- لا أي hex color ولا استيراد CDN (سيُفحص grep).

## التحقق الذاتي البصري (إلزامي)

بعد اكتمال البناء، التقط لقطات شاشة عبر حاوية Playwright واحفظها في
`C:\Users\madar\AppData\Local\Temp\claude\C--Users-madar-Documents-OLS\5322a076-cfdd-4829-912e-c63c39d20a94\scratchpad\wp3\`:

اكتب سكربت `shoot.mjs` في مجلد scratchpad أعلاه (خارج المستودع) يستخدم playwright: يفتح `http://host.docker.internal:5173/login`، يسجل دخول admin (`admin` / `ChangeMe123!`)، ينشئ عبر الواجهة حلقة وطالباً تجريبيين إن لم يوجدا (أو عبر fetch مباشرة قبل اللقطات)، ثم يلتقط: `groups.png`, `students.png`, `students-modal.png` (والـ Modal مفتوح), `users.png`. شغّله بـ:
```
docker run --rm --add-host=host.docker.internal:host-gateway -v "<scratchpad>:/work" mcr.microsoft.com/playwright:v1.49.0-jammy bash -lc "cd /work && npm i playwright@1.49.0 >/dev/null 2>&1 && node wp3/shoot.mjs"
```
(الصورة موجودة محلياً مسبقاً — لن يعيد تحميلها). افحص اللقطات بنفسك (اقرأ الصور) وصحح أي خلل بصري (تراكب، اتجاه خاطئ، نص مقصوص) قبل التسليم.

## معايير القبول

1. `docker compose exec frontend npm run build` ينجح بلا أخطاء TypeScript.
2. `docker compose exec backend pytest` أخضر كاملاً (بعد تعديلي users.py والاختبارات).
3. اللقطات الأربع موجودة وسليمة بصرياً (سيراجعها المدير).
4. grep: لا hex خارج التوكنز، لا CDN.
5. سيناريو فعلي عبر الواجهة (يمكن ضمن سكربت اللقطات): إنشاء حلقة، إنشاء طالب فيها، البحث عنه بالاسم، تعديل بياناته — كله يعمل.
6. لا أي أمر git صدر منك (سيُفحص `git status` من المدير).

## التقرير النهائي (بالعربية)
ما بُني، الانحرافات ولماذا، إثباتات المعايير، قائمة الملفات التي أنشأتها/عدّلتها كاملة (للتثبيت اليدوي من المدير)، ملاحظات للمراجعة.
