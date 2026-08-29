# WP9c — خدمة التتبع الصوتي والدمج في شاشة الجلسة (الدرجة الثالثة، الجزء الأخير)

Spec author: المدير (Fable). Executor: Sonnet sub-agent.
Working directory: `C:\Users\madar\Documents\OLS`. كل الأوامر داخل Docker.
**ممنوع git نهائياً.** النطاق: `asr/**` (عدا الملفين أدناه)، `backend/**`، `frontend/src/**`، `docker-compose.yml`، `.env.example`.
**ممنوع تعديل ملفات المدير**: `asr/app/alignment.py`، `asr/app/normalize.py` (خوارزمية التتبع — تُستهلك كما هي؛ اقرأها وتقرير أي شك فيها)، ومحرك التسجيل بملفيه، و`ui/index.ts`/`Modal`/`BottomSheet`.

اقرأ أولاً بالترتيب: `docs/design/ASR-ARCHITECTURE.md` (المعمارية الملزمة حرفياً)، هذه الوثيقة، `asr/app/alignment.py` + `asr/tests/test_alignment.py` (فهم عقد الـ API: `RecitationTracker(expected).update(text) → TrackerUpdate`)، ثم عقد `mushafControl` في مكوّن المصحف (من WP9b).

## 1. خدمة `asr` (حاوية جديدة)

- `asr/Dockerfile`: python:3.12-slim + requirements: `faster-whisper`, `rapidfuzz`, `websockets` (أو FastAPI+uvicorn ws — اختر الأبسط), `numpy`, `pytest`, `huggingface_hub`, `ctranslate2`, `transformers` (للتحويل).
- **النموذج**: `tarteel-ai/whisper-base-ar-quran` محوَّلاً CTranslate2 INT8. التحويل مرة واحدة عند أول إقلاع إلى volume `asr_models` (سكربت `asr/app/model_setup.py`: إن لم يوجد النموذج المحوَّل → حمّل وحوّل بـ `ct2-transformers-converter --quantization int8` — وثّق الحجم والزمن). الخدمة لا تُعلن جاهزة (healthcheck) قبل اكتمال النموذج.
- `asr/app/main.py`: خادم WebSocket داخلي (منفذ 8090، **غير مكشوف للمضيف** — شبكة compose فقط):
  - رسالة أولى JSON من الـ backend: `{type:"init", expected_words:[{surah,ayah,word,text}...]}` → ينشئ `RecitationTracker`.
  - بعدها إطارات ثنائية: PCM Int16 mono 16kHz (~250ms لكل إطار).
  - حلقة القرار (ASR-ARCHITECTURE §3): ring buffer؛ كل ~1s فك ترميز آخر 7 ثوانٍ بـ faster-whisper (`language="ar"`, `beam_size=1`, `condition_on_previous_text=False`, `vad_filter=True` بعتبة متساهلة) ثم `tracker.update(hypothesis_text)`.
  - عند كل تقدم: إرسال `{type:"position", surah, ayah, word, position, confidence}`. رسائل تحكم: `{type:"reset", position}` من العميل، `{type:"status", ...}` دورية (rtf، طول الطابور).
  - قواعد الانهيار الرشيق (§5): إسقاط الأقدم عند التأخر، وإغلاق نظيف.
- `docker-compose.yml`: خدمة `asr` + volume `asr_models` + healthcheck. أضف `ASR_URL=ws://asr:8090` لبيئة backend.
- اختبارات `asr/tests/test_service.py`: بروتوكول init/frames/position بمحاكاة (mock للنموذج — لا تشغّل whisper في الاختبار)، وقواعد الإسقاط.

## 2. وسيط الـ backend

- `GET /api/sessions/{id}/expected-words` — كلمات نطاق الجلسة بترتيب المصحف من بيانات mushaf_data القائمة `{surah,ayah,word,text}` (تحقق من وجود نطاق للجلسة؛ 400 عربي إن لم يكن). للطاقم المالك للجلسة.
- WebSocket `/api/sessions/{id}/track` في FastAPI: مصادقة بكوكي الجلسة (نفس فحص `get_visible_session_or_404`، والجلسة recording)، يجلب expected words بنفسه، يرسل init لخدمة asr، ثم يمرر الإطارات الثنائية كما هي ورسائل الموضع عائدة. انقطاع أي طرف يغلق الآخر نظيفاً. اختبارات: رفض غير المالك، ورفض جلسة غير recording (mock لخدمة asr).

## 3. الواجهة (شاشة الجلسة الحية)

- `frontend/src/session/trackingClient.ts`: AudioWorklet يتفرع من MediaStream **القائم** في المحرك (أضف للمحرك؟ لا — المحرك ممنوع؛ خذ الـ stream عبر `navigator.mediaDevices` مرة ثانية؟ ممنوع أيضاً فتح ميكروفونين. الحل المعتمد: المحرك يصدّر getter عاماً `get mediaStream()` موجوداً؟ إن لم يكن موجوداً فهذه **الإضافة الوحيدة المصرح بها لملف المحرك**: getter قراءة فقط `get mediaStream(): MediaStream | null` بلا أي منطق آخر — سطران). الـ worklet: تخفيض إلى 16kHz Int16 إطارات 250ms → WS `/api/sessions/{id}/track`.
- التفعيل: زر «التتبع» بجانب زر «المصحف» (يعمل فقط والمصحف مفتوح ونطاق الجلسة محدد). عند كل رسالة position: `mushafControl.highlight({surah, ayah, word})` مع `goToPage` تلقائي عند انتقال الصفحة.
- مؤشرات الحالة: «جارٍ تجهيز التتبع…» (اتصال/تهيئة النموذج)، «التتبع نشط» بنقطة خضراء هادئة، «التتبع متوقف مؤقتاً — التسجيل مستمر» عند الانقطاع مع إعادة اتصال صامتة. زر إيقاف/تشغيل. **أي فشل في التتبع لا يظهر كخطأ جلسة** — التسجيل مقدس ومستقل.
- زر صغير «أرجِع المؤشر إلى هنا» عند النقر على كلمة في المصحف أثناء التتبع (يرسل reset بموضعها) — للمعلم حين يعيد الطالبَ.

## 4. اختبار النهاية-للنهاية الحقيقي (بوابة القبول الكبرى)

سكربت Playwright (scratchpad `wp9c/`) بميكروفون مزيف يبث **تلاوة حقيقية**: نزّل تلاوة الفاتحة لقارئ مرتل من everyayah.com (مثلاً Husary 128kbps — آيات 001001-001007، اجمعها wav) ومرّرها للكروم عبر `--use-file-for-fake-audio-capture=<wav>`. السيناريو: جلسة بنطاق الفاتحة 1-7 → فتح المصحف → تشغيل التتبع → التقط 4 لقطات زمنية متتابعة (`track-t1..t4.png`) تُظهر المؤشر يتقدم عبر الآيات، وسجّل رسائل position المستلمة. **معيار النجاح الكمي**: المؤشر وصل آخر آية (7) قبل نهاية الصوت بتفاوت ≤ آية واحدة، وبلا رجوع للخلف إطلاقاً في التسلسل، وكمون أول تقدم ≤ 5 ثوانٍ من بدء الصوت. أرفق لقطة `live-tracking-mobile.png` أيضاً.

## معايير القبول
1. اختبارات asr + backend كلها خضراء مع القائمة (127+). 2. `npm run build` نظيف. 3. اختبار التلاوة الحقيقية بمعاييره الكمية (اطبع سجل position كاملاً). 4. rtf < 0.8 على CPU مطبوع من status. 5. grep: لا hex/CDN. 6. لا git.

## التقرير (بالعربية)
ما بُني، قياسات الأداء الفعلية (rtf، الكمون)، سجل التتبع للفاتحة، الانحرافات، قائمة الملفات، ملاحظات — وأي شك في الخوارزمية للمدير.
