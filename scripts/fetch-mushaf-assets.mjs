#!/usr/bin/env node
/**
 * يجلب خطوط QPC V2 لصفحات مصحف المدينة الـ604 (خط منفصل لكل صفحة، بصيغة
 * woff2) إلى frontend/public/fonts/qpc-v2/p{NNN}.woff2، بالإضافة إلى خط
 * Uthmanic Hafs عام (نص طبيعي، لا رموز خاصة) يُستخدم لعرض أسطر البسملة/اسم
 * السورة في شاشة التحقق البصري المؤقتة.
 *
 * ## ملاحظة مهمة حول اختيار المصدر (انحراف موثَّق عن ترتيب أفضلية المواصفة)
 * جُرِّب أولاً مرآة GitHub المذكورة في المواصفة (nuqayah/qpc-fonts، وبالمثل
 * mustafa0x/qpc-fonts وquranwbw/qpc-fonts — نفس الملفات الأصلية بالضبط):
 * ملفات woff2 حقيقية (magic bytes صحيحة) وتُحمَّل بلا مشكلة، **لكن تبيّن عبر
 * فحص فعلي (fontTools + عرض حقيقي في Chromium) أنها خطوط AAT قديمة (جدول
 * morx من تقنية Apple Advanced Typography، بلا GSUB/GPOS إطلاقاً) — الحرف
 * المُتاح مباشرة عبر cmap فارغ (0 contours)، والشكل الحقيقي للحرف لا يظهر
 * إلا بعد معالجة AAT التي لا يطبّقها Chromium/Firefox بشكل موثوق على لينكس/
 * ويندوز؛ النتيجة: نص غير مرئي إطلاقاً عند العرض في المتصفح (تم توثيق ذلك
 * بلقطة شاشة فارغة تماماً أثناء بناء هذه الحزمة). لذلك تعذّر استخدامها.
 *
 * البديل المُتحقَّق منه فعلياً: نفس نطاق quran.com الذي تُجيزه المواصفة
 * أصلاً كمصدر بيانات احتياطي (البند 3) يستضيف أيضاً بناءً حديثاً من نفس خط
 * مجمع الملك فهد مُعاد ترجمته بجداول OpenType قياسية (GSUB/GPOS حقيقية —
 * تم التحقق ببرنامج fontTools: الحرف عند نفس نقطة الشيفرة له 6 معالم/
 * contours حقيقية)، ويُقدَّم بلا حاجة لتسجيل دخول:
 *   https://quran.com/fonts/quran/hafs/v2/woff2/p{N}.woff2  (N بلا أصفار بادئة)
 *   https://quran.com/fonts/quran/hafs/uthmanic_hafs/UthmanicHafs1Ver18.woff2
 * هذا هو نفس الخط الذي يستخدمه موقع quran.com الفعلي لعرض المصحف (تم
 * رصد هذه الروابط من طلبات الشبكة الحقيقية للموقع أثناء تصفّحه).
 *
 * يعمل داخل حاوية Node (لا يعتمد على أي حزمة خارج المكتبة القياسية).
 * Idempotent: يتخطى أي ملف موجود بحجم معقول وبصيغة woff2 صحيحة (magic bytes
 * "wOF2")، ويعيد المحاولة عند الفشل (backoff)، ويطبع ملخصاً نهائياً واضحاً.
 *
 * الاستخدام: node scripts/fetch-mushaf-assets.mjs
 *   (أو داخل حاوية: docker run --rm -v "$PWD:/repo" -w /repo node:22-alpine
 *    node scripts/fetch-mushaf-assets.mjs)
 */

import { mkdir, writeFile, readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.dirname(HERE);
const OUT_DIR = path.join(REPO_ROOT, "frontend", "public", "fonts", "qpc-v2");

const TOTAL_PAGES = 604;
const PAGE_FONT_BASE = "https://quran.com/fonts/quran/hafs/v2/woff2";
const UTHMANIC_HAFS_URL =
  "https://quran.com/fonts/quran/hafs/uthmanic_hafs/UthmanicHafs1Ver18.woff2";
const MAX_RETRIES = 5;
const CONCURRENCY = 8;
const WOFF2_MAGIC = Buffer.from("wOF2", "ascii");
const MIN_REASONABLE_SIZE = 2000; // بايت — أصغر خط صفحة حقيقي أكبر من هذا بكثير

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetries(url, retries = MAX_RETRIES) {
  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "OLS-WP9a-mushaf-fetch/1.0" },
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      }
      const buf = Buffer.from(await res.arrayBuffer());
      return buf;
    } catch (err) {
      lastErr = err;
      const backoffMs = Math.min(2 ** attempt * 500, 15000);
      await sleep(backoffMs);
    }
  }
  throw new Error(`فشل تحميل ${url} بعد ${retries} محاولات: ${lastErr}`);
}

function isValidWoff2(buf) {
  return buf.length >= MIN_REASONABLE_SIZE && buf.subarray(0, 4).equals(WOFF2_MAGIC);
}

async function isExistingFileValid(filePath) {
  if (!existsSync(filePath)) return false;
  try {
    const s = await stat(filePath);
    if (s.size < MIN_REASONABLE_SIZE) return false;
    const fh = await readFile(filePath);
    return isValidWoff2(fh);
  } catch {
    return false;
  }
}

async function fetchOne(name, url, destPath) {
  if (await isExistingFileValid(destPath)) {
    return { name, status: "skipped-cached" };
  }
  try {
    const buf = await fetchWithRetries(url);
    if (!isValidWoff2(buf)) {
      return {
        name,
        status: "bad-magic-bytes",
        detail: `أول 4 بايت: ${buf.subarray(0, 4).toString("hex")}, الحجم: ${buf.length}`,
      };
    }
    await writeFile(destPath, buf);
    return { name, status: "downloaded", size: buf.length };
  } catch (err) {
    return { name, status: "failed", detail: String(err) };
  }
}

async function runPool(items, worker, concurrency) {
  const results = new Array(items.length);
  let next = 0;
  async function runner() {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await worker(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, runner));
  return results;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const jobs = [];
  for (let p = 1; p <= TOTAL_PAGES; p++) {
    const nnn = String(p).padStart(3, "0");
    jobs.push({
      name: `p${nnn}`,
      // مصدر التحميل يستخدم أرقاماً بلا أصفار بادئة (p1.woff2 لا p001.woff2)
      url: `${PAGE_FONT_BASE}/p${p}.woff2`,
      destPath: path.join(OUT_DIR, `p${nnn}.woff2`),
    });
  }
  // خط Uthmanic Hafs عام (نص طبيعي) — ليس أحد الصفحات الـ604 المطلوبة في
  // المواصفة، لكنه يفيد شاشة التحقق البصري المؤقتة لعرض أسطر البسملة/اسم
  // السورة (التي لا تُرسَم بخط الصفحة المتقطّع-الكلمات) بشكل مقروء.
  jobs.push({
    name: "uthmanic-hafs",
    url: UTHMANIC_HAFS_URL,
    destPath: path.join(OUT_DIR, "uthmanic-hafs.woff2"),
  });

  console.log(`[fetch-mushaf-assets] جلب ${jobs.length} ملف خط إلى ${OUT_DIR}`);

  const results = await runPool(jobs, (job) => fetchOne(job.name, job.url, job.destPath), CONCURRENCY);

  const summary = { "downloaded": 0, "skipped-cached": 0, "failed": 0, "bad-magic-bytes": 0 };
  const failures = [];
  for (const r of results) {
    summary[r.status] = (summary[r.status] ?? 0) + 1;
    if (r.status === "failed" || r.status === "bad-magic-bytes") {
      failures.push(r);
    }
  }

  console.log("\n[fetch-mushaf-assets] الملخص:");
  console.log(`  تم تحميله الآن     : ${summary["downloaded"]}`);
  console.log(`  موجود سابقاً وسليم : ${summary["skipped-cached"]}`);
  console.log(`  فشل التحميل        : ${summary["failed"]}`);
  console.log(`  magic bytes خطأ    : ${summary["bad-magic-bytes"]}`);
  console.log(`  الإجمالي المطلوب   : ${jobs.length} (604 صفحة + خط Uthmanic Hafs عام)`);

  if (failures.length > 0) {
    console.error("\n[fetch-mushaf-assets] الملفات التي فشلت:");
    for (const f of failures) {
      console.error(`  - ${f.name}: ${f.detail}`);
    }
    process.exitCode = 1;
  } else {
    console.log("\n[fetch-mushaf-assets] اكتمل جلب كل الخطوط بنجاح.");
  }
}

main().catch((err) => {
  console.error("[fetch-mushaf-assets] خطأ غير متوقع:", err);
  process.exitCode = 1;
});
