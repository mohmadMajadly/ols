# OLS — منصة إدارة التسميع لمحفظي القرآن

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
