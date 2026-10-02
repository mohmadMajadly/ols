# OLS — منصة إدارة التسميع لمحفظي القرآن

منصة لإدارة مركز تحفيظ القرآن الكريم (الأدوار: مدير، مشرف، معلم، طالب).

## Installation / التثبيت

تثبيت بأمر واحد على خادم أو حاسوب عادي. المطلوب فقط **Docker** (وGit اختياري — يُستعاض عنه بتنزيل أرشيف).

**لينكس / ماك** (Terminal):

```bash
curl -fsSL https://raw.githubusercontent.com/mohmadMajadly/ols/main/install.sh | bash
```

**ويندوز** (PowerShell):

```powershell
irm https://raw.githubusercontent.com/mohmadMajadly/ols/main/install.ps1 | iex
```

يسألك المثبّت عن نمط الوصول وحساب المدير، ثم يبني الحاويات ويشغّلها ويطبع الرابط. المجلد الافتراضي: `~/ols` (ويندوز: `$HOME\ols`).

### أنماط الوصول

| النمط | متى | العنوان |
|---|---|---|
| **1) خادم بنطاق** | خادم عام ونطاق موجَّه إليه | `https://نطاقك` — شهادة Let's Encrypt تلقائية |
| **2) هذا الحاسوب فقط** | تجربة أو استخدام فردي | `http://localhost:8080` (المنفذ قابل للتغيير) |
| **3) الشبكة المحلية** | عدة أجهزة في نفس الشبكة | `https://<IP الجهاز>:8443` — شهادة ذاتية التوقيع |

- **خادم بنطاق:** يجب أن يشير سجل DNS من نوع A إلى عنوان الخادم العام، وأن يكون المنفذان **80 و443** مفتوحين في الجدار الناري. يطلب المثبّت بريداً إلكترونياً لإشعارات Let's Encrypt.
- **الشبكة المحلية:** يكتشف المثبّت عنوان IP تلقائياً ويتيح تعديله. سيعرض المتصفح تحذير الشهادة مرة واحدة لكل جهاز — اقبله للمتابعة. قد يلزم السماح بالمنفذ في جدار ويندوز.
- **الميكروفون** (تسجيل الجلسات) يتطلب اتصالاً آمناً HTTPS أو `localhost`؛ لذلك لا يوجد نمط HTTP عبر الشبكة.
- كلمة مرور المدير تُطبَّق عند أول إقلاع ثم تُمسح من ملف `.env`. غيّرها لاحقاً من داخل التطبيق.

### المتطلبات

- Docker (Docker Desktop على ويندوز/ماك، أو Docker Engine على لينكس) مع Compose v2.
- ذاكرة: **4 جيجابايت RAM** كحد أدنى (يُفضّل 8). قرص: **~10 جيجابايت** حرة (صور الحاويات ~4 جيجا، منها خدمة التتبع ~2.1 جيجا، + نموذج الصوت + بياناتك).
- أول إقلاع يحوّل نموذج التتبع الصوتي (قد يستغرق 10 دقائق أو أكثر)؛ التطبيق يعمل قبل ذلك والتتبع الآني يتفعّل تلقائياً بعد اكتماله. يحتاج اتصالاً بالإنترنت أثناء التثبيت (صور Docker، خطوط المصحف، النموذج).

### الإدارة اليومية

من مجلد التثبيت:

```bash
./ols.sh status          # الحالة          (ويندوز: .\ols.ps1 status)
./ols.sh logs [service]  # السجلات
./ols.sh stop            # إيقاف
./ols.sh start           # تشغيل
./ols.sh update          # تحديث (git pull + إعادة بناء، البيانات محفوظة)
./ols.sh uninstall       # إزالة (يسأل قبل حذف البيانات)
```

أو مباشرة: `docker compose logs -f` / `docker compose down` / `docker compose up -d`. لإعادة ضبط نمط الوصول أعد تشغيل أمر التثبيت واختر **Reconfigure**؛ وللتحديث اختر **Update**.

### English summary

One-command install on a server or a regular PC; only Docker is required.
Linux/macOS: `curl -fsSL https://raw.githubusercontent.com/mohmadMajadly/ols/main/install.sh | bash` — Windows PowerShell: `irm https://raw.githubusercontent.com/mohmadMajadly/ols/main/install.ps1 | iex`.
Pick one of three modes: **domain** (automatic Let's Encrypt HTTPS, needs DNS A record + ports 80/443), **this computer only** (`http://localhost:8080`), or **LAN** (HTTPS with a self-signed certificate on your local IP; browsers warn once). Microphone recording needs HTTPS or localhost. Requirements: Docker + Compose v2, 4 GB RAM (8 recommended), ~10 GB disk. The speech model is converted on first start (10+ min); the app is usable meanwhile. Manage with `./ols.sh status|logs|stop|start|update|uninstall` (`.\ols.ps1` on Windows). Env vars for unattended installs: `OLS_NONINTERACTIVE=1 OLS_MODE=domain|local|lan OLS_DOMAIN OLS_EMAIL OLS_PORT OLS_LAN_IP OLS_ADMIN_USER OLS_ADMIN_PASSWORD OLS_DIR OLS_REPO OLS_BRANCH`.

---

## Development / التطوير

منصة لإدارة مركز تحفيظ القرآن الكريم (الأدوار: مدير، مشرف، معلم، طالب).

هذا المستودع مُهيّأ للعمل بالكامل داخل حاويات Docker. لا حاجة لتثبيت
Node.js أو Python على جهازك؛ فقط Docker و Git.

## المتطلبات الأساسية

- Docker Desktop (يعمل عليه Docker Engine 29.x أو أحدث) و Docker Compose.
- Git.

## التشغيل لأول مرة

1. انسخ ملف البيئة النموذجي وعدّل القيم حسب الحاجة (القيم الافتراضية تكفي للتطوير المحلي):

   ```powershell
   copy .env.example .env
   ```

2. ابنِ الحاويات وشغّلها:

   ```powershell
   docker compose up -d --build
   ```

3. تحقق من الحالة:

   ```powershell
   docker compose ps
   ```

   يجب أن تكون قاعدة البيانات `db` بحالة healthy، وأن تعمل خدمتا `backend` و `frontend`.

4. الواجهة الخلفية: http://localhost:8000/api/health
   الواجهة الأمامية: http://localhost:5173

عند أول إقلاع، يُنشئ الخادم تلقائياً حساب مدير مبدئي من متغيرات البيئة
`ADMIN_USERNAME` و `ADMIN_PASSWORD` (إن لم يوجد أي حساب بدور admin مسبقاً).

## أوامر يومية شائعة

```powershell
# متابعة السجلات
docker compose logs -f backend
docker compose logs -f frontend

# إيقاف كل شيء
docker compose down

# إعادة البناء بعد تعديل requirements.txt أو package.json
docker compose up -d --build

# الدخول إلى حاوية الباك-إند لتشغيل أمر ما
docker compose exec backend bash
```

## قاعدة البيانات والمهاجرات (Alembic)

المخطط (schema) يُنشأ حصراً عبر Alembic، وليس عبر `create_all`.

```powershell
# تطبيق كل المهاجرات
docker compose exec backend alembic upgrade head

# إنشاء مهاجرة جديدة بعد تعديل النماذج
docker compose exec backend alembic revision --autogenerate -m "وصف التغيير"
```

## الاختبارات

اختبارات الباك-إند (pytest) تُنشئ قاعدة بيانات اختبار منفصلة (`ols_test`)
على نفس خادم Postgres وتحذفها بعد الانتهاء، وتُطبّق عليها المهاجرات
عبر Alembic تلقائياً.

```powershell
docker compose exec backend pytest -v
```

## بنية المستودع

```
backend/    واجهة خلفية FastAPI + SQLAlchemy + Alembic
frontend/   واجهة أمامية React + Vite + TypeScript
docker-compose.yml
.env.example
```

## ملاحظة حول التصميم

تصميم الواجهة في هذه المرحلة (WP0) بسيط ومحايد فقط للتأكد من عمل تدفق
الدخول (Login) وتوزيع الصلاحيات (RBAC). التصميم النهائي والهوية البصرية
سيأتيان في مرحلة عمل لاحقة مخصصة للتصميم.
