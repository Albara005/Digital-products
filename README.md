<div dir="rtl">

# Nitro Store - متجر نيترو للمنتجات الرقمية

متجر إلكتروني عربي لبيع المنتجات الرقمية: بطاقات الألعاب، الاشتراكات، حسابات الألعاب الجاهزة، والخدمات الرقمية.
يدفع العميل عبر Stripe ويستلم **فوراً** الأكواد أو بيانات الحسابات من المخزون تلقائياً، مع لوحة تحكم لإدارة المنتجات والمخزون والطلبات.

## المزايا

- **تسليم تلقائي فوري**: بعد تأكيد الدفع يُسحب الكود من المخزون ويظهر في صفحة الطلب الخاصة بالعميل، ويصله بريد برابط الطلب.
- **لا يُباع الكود مرتين أبداً**: كل وحدة مخزون تُحجز بقفل على مستوى قاعدة البيانات (`FOR UPDATE SKIP LOCKED`) داخل معاملة واحدة، والتسليم آمن عند تكرار إشعارات Stripe أو ضغط زر "إعادة المحاولة" في لوحة التحكم في نفس الوقت.
- **تشفير المخزون**: الأكواد وبيانات الحسابات مشفّرة في قاعدة البيانات بـ AES-256-GCM.
- **الأسعار من الخادم فقط**: الأسعار والمخزون تُقرأ من قاعدة البيانات عند الدفع، ولا يُوثق بأي سعر قادم من المتصفح.
- **الخدمات والنقص في المخزون**: منتجات "الخدمة" وأي طلب لم يكفِه المخزون تبقى بحالة "مدفوع - بانتظار التسليم" ليسلّمها المدير يدوياً من لوحة التحكم.
- **وضع التطوير**: بدون مفاتيح Stripe (وخارج بيئة الإنتاج فقط) تُعتبر الطلبات مدفوعة فوراً لتجربة المتجر محلياً.

## التقنيات

Next.js 16 (App Router) - React 19 - TypeScript - Prisma 6 - PostgreSQL - Stripe Checkout - Resend (البريد) - Railway (النشر).

## التشغيل محلياً

المتطلبات: Node.js 20.12 أو أحدث، و PostgreSQL 14 أو أحدث.

1. أنشئ قاعدة بيانات PostgreSQL فارغة، مثلاً:
   ```bash
   createdb nitro
   ```
2. انسخ ملف المتغيرات واملأه:
   ```bash
   cp .env.example .env
   ```
   - `DATABASE_URL`: رابط قاعدة البيانات.
   - `AUTH_SECRET` و `INVENTORY_ENCRYPTION_KEY`: أنشئ كل واحد بالأمر `openssl rand -base64 32`.
   - `ADMIN_EMAIL` و `ADMIN_PASSWORD`: بيانات أول مدير (8 أحرف على الأقل لكلمة المرور).
   - اترك `STRIPE_SECRET_KEY` فارغاً لتعمل في وضع التطوير (دفع وهمي فوري).
3. ثبّت الحزم:
   ```bash
   npm install
   ```
4. أنشئ الجداول:
   ```bash
   npx prisma migrate deploy
   ```
   (أو `npm run db:push` للتجربة السريعة. إذا كانت قاعدة البيانات أُنشئت سابقاً بـ `db push` وتريد الانتقال إلى الـ migrations، نفّذ مرة واحدة:
   `npx prisma migrate resolve --applied 20260923170000_init`)
5. أضف البيانات الأولية (المدير، الأقسام، منتجات تجريبية مع أكواد `DEMO-` وهمية):
   ```bash
   npm run db:seed
   ```
   الأمر آمن للتكرار: لا يكرر البيانات ولا يغيّر كلمة مرور مدير موجود.
6. شغّل المتجر:
   ```bash
   npm run dev
   ```
   افتح http://localhost:3000 ، ولوحة التحكم على http://localhost:3000/admin

## إعداد Stripe

1. من [لوحة Stripe](https://dashboard.stripe.com/apikeys) انسخ المفتاح السري (`sk_test_...` للتجربة، `sk_live_...` للإنتاج) إلى `STRIPE_SECRET_KEY`.
2. أنشئ Webhook من **Developers → Webhooks → Add endpoint**:
   - الرابط: `https://<نطاقك>/api/stripe/webhook`
   - الأحداث:
     - `checkout.session.completed`
     - `checkout.session.async_payment_succeeded`
     - `checkout.session.async_payment_failed`
     - `checkout.session.expired`
   - انسخ **Signing secret** (`whsec_...`) إلى `STRIPE_WEBHOOK_SECRET`.
3. للتجربة محلياً استخدم [Stripe CLI](https://docs.stripe.com/stripe-cli):
   ```bash
   stripe listen --forward-to localhost:3000/api/stripe/webhook
   ```
   وضع قيمة `whsec_...` التي يطبعها الأمر في `STRIPE_WEBHOOK_SECRET` ثم أعد تشغيل `npm run dev`.
   بطاقة الاختبار: `4242 4242 4242 4242` بأي تاريخ مستقبلي وأي CVC.

آلية العمل: `POST /api/checkout` ينشئ الطلب بحالة "بانتظار الدفع" وجلسة Stripe Checkout صالحة 30 دقيقة، ثم يعيد رابط الدفع.
عند نجاح الدفع يستقبل `/api/stripe/webhook` الإشعار (بعد التحقق من التوقيع)، فيحوّل الطلب إلى "مدفوع" ويسلّم المخزون ويرسل البريد.
انتهاء صلاحية الجلسة أو فشل الدفع يحوّل الطلب إلى "فشل". جميع المعالجات قابلة للتكرار بأمان، وعند أي خطأ مؤقت يعيد الـ webhook رمز 500 ليعيد Stripe المحاولة.

## البريد الإلكتروني (Resend)

- ضع `RESEND_API_KEY` من [Resend](https://resend.com) و `EMAIL_FROM` بعنوان من نطاق موثّق لديهم، مثل `Nitro Store <orders@yourdomain.com>`.
- البريد يحتوي **رابط صفحة الطلب فقط** وليس الأكواد، فالأكواد تظهر في صفحة الطلب المحمية برمز سري.
- بدون `RESEND_API_KEY` يُطبع رابط الطلب في سجل الخادم بدلاً من الإرسال.

## النشر على Railway

ملف `railway.json` جاهز: البناء بـ `npm run build`، وتشغيل `npx prisma migrate deploy` قبل كل نشر، والتشغيل بـ `npm run start`، وفحص الصحة على `/api/health`، وإعادة التشغيل تلقائياً عند التعطل.

1. ارفع المشروع إلى GitHub.
2. في [Railway](https://railway.com): **New Project → Deploy from GitHub repo** واختر المستودع.
3. داخل المشروع: **New → Database → Add PostgreSQL**.
4. افتح خدمة التطبيق → **Variables** وأضف:

   | المتغير | القيمة |
   | --- | --- |
   | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
   | `AUTH_SECRET` | ناتج `openssl rand -base64 32` |
   | `INVENTORY_ENCRYPTION_KEY` | ناتج `openssl rand -base64 32` (انظر التحذير أدناه) |
   | `NEXT_PUBLIC_SITE_URL` | رابط المتجر، مثل `https://nitro-store.up.railway.app` أو نطاقك الخاص |
   | `STRIPE_SECRET_KEY` | `sk_live_...` |
   | `STRIPE_WEBHOOK_SECRET` | `whsec_...` |
   | `RESEND_API_KEY` | مفتاح Resend |
   | `EMAIL_FROM` | `Nitro Store <orders@yourdomain.com>` |
   | `ADMIN_EMAIL` / `ADMIN_PASSWORD` | بيانات أول مدير |

   > **تحذير مهم:** لا تغيّر `INVENTORY_ENCRYPTION_KEY` أبداً بعد رفع أي مخزون، وإلا تصبح جميع الأكواد وبيانات الحسابات المخزنة غير قابلة للقراءة نهائياً. احفظ نسخة منه في مكان آمن.

5. من **Settings → Networking** اضغط **Generate Domain** (أو اربط نطاقك)، وتأكد أن `NEXT_PUBLIC_SITE_URL` يطابقه. هذا المتغير يُضمَّن وقت البناء، لذا أعد النشر (Redeploy) بعد تغييره.
6. في لوحة Stripe أنشئ الـ Webhook على `https://<نطاقك>/api/stripe/webhook` بالأحداث المذكورة أعلاه.
7. انتظر اكتمال النشر (الـ migrations تُطبَّق تلقائياً قبل التشغيل)، ثم شغّل البيانات الأولية **مرة واحدة** من جهازك بعد `npm install` و `railway link`:
   ```bash
   railway run npm run db:seed
   ```
   `railway run` يشغّل الأمر على جهازك بمتغيرات Railway. إذا فشل الاتصال بـ `postgres.railway.internal` (عنوان داخلي لا يصل إليه جهازك)، أضف للتطبيق متغير `DATABASE_PUBLIC_URL=${{Postgres.DATABASE_PUBLIC_URL}}` ثم نفّذ:
   ```bash
   railway run sh -c 'DATABASE_URL="$DATABASE_PUBLIC_URL" npm run db:seed'
   ```
   أو ادخل إلى الخدمة نفسها بـ `railway ssh` ونفّذ `npm run db:seed`.
8. سجّل الدخول إلى لوحة التحكم على `https://<نطاقك>/admin` ببيانات `ADMIN_EMAIL` و `ADMIN_PASSWORD`.

> **قبل الإطلاق الفعلي:** المنتجات التجريبية تحتوي أكواداً وهمية تبدأ بـ `DEMO-`. احذفها أو احذف مخزونها التجريبي من لوحة التحكم قبل استقبال طلبات حقيقية، أو شغّل البذرة بـ `SEED_SAMPLE_PRODUCTS=false` لإنشاء المدير والأقسام فقط.

## إدارة الطلبات

| الحالة | المعنى |
| --- | --- |
| بانتظار الدفع `PENDING` | أُنشئ الطلب ولم يكتمل الدفع |
| مدفوع - بانتظار التسليم `PAID` | تم الدفع، وفيه خدمة أو منتج نفد مخزونه، ويحتاج تسليماً يدوياً أو "إعادة محاولة" بعد إضافة مخزون |
| تم التسليم `FULFILLED` | سُلّمت كل المنتجات وأُرسل البريد للعميل |
| فشل `FAILED` | انتهت جلسة الدفع أو فشل الدفع |

ملاحظة: التحقق من المخزون عند إنشاء الطلب لا يحجز الكود. إذا دفع عميلان في نفس اللحظة ثمن آخر كود، يستلمه أحدهما تلقائياً ويبقى طلب الآخر "مدفوعاً - بانتظار التسليم" حتى تضيف مخزوناً وتعيد المحاولة أو تسترد المبلغ. لا يمكن أبداً أن يُسلَّم نفس الكود لعميلين.

## فحص سريع (للتطوير فقط)

مع خادم تطوير يعمل بدون Stripe على المنفذ 3100:

```bash
npx next dev -p 3100
node --conditions=react-server --import tsx scripts/verify-payments.mts
```

يختبر السكربت: إنشاء طلب وتسليمه، رفض الكميات غير المتوفرة، 10 طلبات متزامنة على 5 أكواد فقط (لا يُباع أي كود مرتين)، تكرار التسليم المتزامن، معالجة الـ webhook الموقّع، وحد الطلبات. ويحذف بيانات الاختبار بعد الانتهاء.

</div>

---

## English

**Nitro Store** is an Arabic (RTL) storefront for digital goods: game gift cards, subscriptions, pre-made game accounts and digital services. Customers pay with Stripe Checkout and instantly receive codes / account credentials from encrypted stock (AES-256-GCM).

**Stack:** Next.js 16 App Router, React 19, TypeScript, Prisma 6 + PostgreSQL, Stripe, Resend (HTTP API), Railway.

**Local setup**

```bash
cp .env.example .env          # fill DATABASE_URL, AUTH_SECRET, INVENTORY_ENCRYPTION_KEY, ADMIN_*
npm install
npx prisma migrate deploy     # or: npm run db:push
npm run db:seed               # idempotent: super admin, categories, sample products with DEMO stock
npm run dev                   # http://localhost:3000, admin at /admin
```

With `STRIPE_SECRET_KEY` empty and `NODE_ENV` not `production`, checkout runs in **dev mode**: orders are marked paid and delivered immediately. In production without Stripe, checkout returns 503.

**Payments & delivery**

- `POST /api/checkout` `{ email, items: [{ variantId, quantity }] }` → `{ url }` or `{ error }`. Prices, stock and active flags come from the database; duplicate lines are merged; 1–20 lines, quantity 1–10; 10 requests/min per IP.
- `POST /api/stripe/webhook` verifies the signature and handles `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`. Local testing: `stripe listen --forward-to localhost:3000/api/stripe/webhook`.
- `GET /api/health` → `{ ok: true }` after `SELECT 1`.
- `src/lib/fulfillment.ts`: `markOrderPaid`, `fulfillOrder`, `refreshOrderStatus`. Stock units are claimed with `SELECT ... FOR UPDATE SKIP LOCKED` inside one transaction per order item, and the order item row is locked first, so webhook retries and the admin "retry" button can run concurrently without double delivery. Shortfalls leave the order in `PAID` for manual delivery. Only the caller that moves an order to `FULFILLED` sends the delivery email, which contains the private order link, never the codes.

**Deploying on Railway**

1. New Project → Deploy from GitHub repo; add a PostgreSQL database.
2. Set variables: `DATABASE_URL=${{Postgres.DATABASE_URL}}`, `AUTH_SECRET`, `INVENTORY_ENCRYPTION_KEY` (**never change it once stock exists**: existing stock would become unreadable), `NEXT_PUBLIC_SITE_URL` (inlined at build time, so redeploy after changing it), `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`.
3. `railway.json` builds with `npm run build`, runs `npx prisma migrate deploy` before each deploy, starts with `npm run start`, health-checks `/api/health` and restarts on failure.
4. Generate a domain, then add the Stripe webhook endpoint `https://<domain>/api/stripe/webhook`.
5. Seed once: `railway run npm run db:seed`. If your machine can't reach `postgres.railway.internal`, use the public URL (`railway run sh -c 'DATABASE_URL="$DATABASE_PUBLIC_URL" npm run db:seed'` after adding `DATABASE_PUBLIC_URL=${{Postgres.DATABASE_PUBLIC_URL}}`) or `railway ssh`. Use `SEED_SAMPLE_PRODUCTS=false` to skip the sample catalogue, and remove `DEMO-` stock before going live.
6. Sign in at `/admin`.
