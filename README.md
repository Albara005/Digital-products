<div dir="rtl">

# Nitro Store - متجر نيترو للمنتجات الرقمية

متجر إلكتروني عربي لبيع المنتجات الرقمية: بطاقات الألعاب، الاشتراكات، حسابات الألعاب الجاهزة، والخدمات الرقمية.
يدفع العميل عبر **Tap** (مدى، KNET، Apple Pay والبطاقات الخليجية) أو **Stripe** (البطاقات الدولية) أو من **رصيد محفظته**، ويستلم **فوراً** الأكواد أو بيانات الحسابات من المخزون تلقائياً، مع كوبونات خصم ولوحة تحكم لإدارة المنتجات والمخزون والطلبات.

## المزايا

- **تسليم تلقائي فوري**: بعد تأكيد الدفع يُسحب الكود من المخزون ويظهر في صفحة الطلب الخاصة بالعميل، ويصله بريد برابط الطلب.
- **لا يدفع العميل إلا لمخزون موجود**: عند إتمام الطلب تُحجز الأكواد المطلوبة (`RESERVED`) داخل نفس المعاملة التي تنشئ الطلب، وإن لم تكفِ الكمية يُرفض الطلب كاملاً قبل الانتقال إلى الدفع.
- **لا يُباع الكود مرتين أبداً**: كل وحدة مخزون تُحجز بقفل على مستوى قاعدة البيانات (`FOR UPDATE SKIP LOCKED`) داخل معاملة واحدة، والتسليم آمن عند تكرار إشعارات Stripe أو ضغط زر "إعادة المحاولة" في لوحة التحكم في نفس الوقت.
- **تشفير المخزون**: الأكواد وبيانات الحسابات مشفّرة في قاعدة البيانات بـ AES-256-GCM.
- **الأسعار من الخادم فقط**: الأسعار والمخزون تُقرأ من قاعدة البيانات عند الدفع، ولا يُوثق بأي سعر قادم من المتصفح.
- **الخدمات والنقص في المخزون**: منتجات "الخدمة" وأي طلب لم يكفِه المخزون تبقى بحالة "مدفوع - بانتظار التسليم" ليسلّمها المدير يدوياً من لوحة التحكم.
- **محفظة العميل**: رصيد بالدولار يُشحن عبر بوابة الدفع ويُستخدم كلياً أو جزئياً في الشراء، بسجل حركات لا يُعدَّل وقفل على مستوى قاعدة البيانات يمنع صرف الرصيد مرتين.
- **كوبونات الخصم**: نسبة أو مبلغ ثابت، بحد أقصى للخصم وحد أدنى للطلب وعدد استخدامات كلي ولكل عميل وفترة صلاحية، ويمكن حصرها في فئة أو منتج.
- **الاسترجاع**: إلى وسيلة الدفع الأصلية عبر Tap/Stripe، أو كرصيد في المحفظة، مرة واحدة فقط ومع تسجيل في سجل النشاط.
- **وضع التطوير**: بدون أي مفتاح دفع (وخارج بيئة الإنتاج فقط) تُعتبر الطلبات وعمليات شحن المحفظة مدفوعة فوراً لتجربة المتجر محلياً.

## التقنيات

Next.js 16 (App Router) - React 19 - TypeScript - Prisma 6 - PostgreSQL - Tap Payments - Stripe Checkout - Resend (البريد) - Railway (النشر).

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
   - اترك `TAP_SECRET_KEY` و `STRIPE_SECRET_KEY` فارغين لتعمل في وضع التطوير (دفع وهمي فوري).
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

## بوابات الدفع

تُفعَّل كل بوابة بمجرد وضع مفتاحها السري، ويختار العميل بينها في السلة (الافتراضية Tap). بدون أي مفتاح وخارج الإنتاج يعمل المتجر في وضع التطوير؛ وفي الإنتاج بدون بوابة لا تُقبل إلا الطلبات المدفوعة بالكامل من المحفظة.

### Tap Payments (مدى، KNET، Apple Pay، البطاقات)

1. من [لوحة Tap](https://businesses.tap.company) انسخ المفتاح السري (`sk_test_...` للتجربة، `sk_live_...` للإنتاج) إلى `TAP_SECRET_KEY`.
2. لا يلزم إعداد Webhook يدوياً: كل عملية دفع تُنشأ ومعها رابط الإشعار `https://<نطاقك>/api/tap/webhook` ورابط العودة `https://<نطاقك>/api/tap/return`. إن طلبت Tap تسجيل الرابط في حسابك فاستخدم `https://<نطاقك>/api/tap/webhook`.
3. تأكد أن `NEXT_PUBLIC_SITE_URL` يطابق نطاقك العام (https)، فمنه تُبنى هذه الروابط.

آلية العمل: ينشئ المتجر عملية دفع (`POST /v2/charges` بمصدر `src_all`) ويحوّل العميل إلى صفحة Tap. **لا يُوثق بمحتوى الإشعار ولا بمعاملات رابط العودة**: في الحالتين يُعاد جلب العملية من Tap بالمفتاح السري، ولا يُعتبر الطلب مدفوعاً إلا إذا كانت حالتها `CAPTURED` وتطابق المبلغ والعملة والطلب المسجّل في بياناتها. الحالات النهائية الأخرى (`DECLINED`، `CANCELLED`، `FAILED`...) تُفشل الطلب وتعيد المخزون والرصيد والكوبون. المبالغ تُحوَّل بدقة حسب عملتها (خانتان للدولار، وثلاث للدينار الكويتي والبحريني والريال العماني وغيرها).

### Stripe (البطاقات الدولية)

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

### مسار الطلب

`POST /api/checkout` يحسب الأسعار من قاعدة البيانات، ثم في معاملة واحدة: يحجز المخزون، ويستهلك الكوبون (مع التحقق من حدوده تحت قفل)، ويخصم الجزء المستخدم من المحفظة، وينشئ الطلب بحالة "بانتظار الدفع". إن غطّت المحفظة المبلغ كاملاً يُسلَّم الطلب فوراً دون بوابة، وإلا تُنشأ عملية الدفع بالمبلغ المتبقي فقط ويُعاد رابطها.
إن فشل إنشاء عملية الدفع، أو انتهت صلاحيتها، أو رُفض الدفع، أو مرّت 35 دقيقة دون تأكيد (يُفحص ذلك مع كل طلب شراء جديد)، يتحول الطلب إلى "فشل" ويُعاد **مرة واحدة فقط** كل ما حجزه: المخزون، ورصيد المحفظة، واستخدام الكوبون. وإن وصل تأكيد دفع متأخر لطلب كهذا يُعاد حجز الرصيد والكوبون ويُسلَّم الطلب؛ وإن لم يعد رصيد المحفظة كافياً يبقى "مدفوعاً" دون تسليم تلقائي لمراجعته يدوياً.
جميع المعالجات قابلة للتكرار بأمان، وعند أي خطأ مؤقت تعيد الـ webhooks رمز 500 لتعيد البوابة المحاولة.

## المحفظة

- رصيد العميل بالدولار، ويظهر مع سجل حركاته في صفحة حسابه. كل حركة (شحن، شراء، استرجاع، تعديل من الإدارة) تُسجَّل مع الرصيد بعدها، والرصيد لا يصبح سالباً أبداً حتى مع طلبات متزامنة.
- الشحن من صفحة الحساب عبر `POST /api/wallet/topup` (من 5 إلى 500 دولار بمبالغ صحيحة، ويتطلب تسجيل الدخول). يُضاف الرصيد مرة واحدة فقط عند تأكيد الدفع من Tap أو Stripe.
- عند الشراء يختار العميل المسجّل "استخدام رصيد المحفظة" فيُخصم منه حتى قيمة الطلب ويُدفع الباقي عبر البوابة.

## الكوبونات

من **لوحة التحكم → الكوبونات**: أنشئ كوداً (يُحفظ بأحرف كبيرة ويُقبل بأي حالة)، بنسبة مئوية مع حد أقصى اختياري للخصم أو بمبلغ ثابت، مع حد أدنى للمشتريات، وعدد استخدامات كلي ولكل عميل (حسب البريد)، وتاريخ بداية ونهاية، ونطاق اختياري بفئة أو منتج (يُخصم عندها من المنتجات المطابقة فقط). الاستخدامات تُحتسب للطلبات غير الفاشلة فقط، ولا يمكن تجاوز الحد حتى مع طلبات متزامنة. يمكن إيقاف أي كوبون، أما الحذف فمسموح فقط لكوبون لم يُستخدم قط. البذرة تنشئ كوبوناً تجريبياً `WELCOME10` (خصم 10% بحد أقصى 5 دولار) أوقفه أو احذفه قبل الإطلاق إن لم ترده.

## الاسترجاع

من صفحة الطلب في لوحة التحكم، للطلبات المدفوعة أو المسلّمة فقط:

| الطريقة | ما يحدث |
| --- | --- |
| إلى وسيلة الدفع الأصلية `ORIGINAL` | يُسترجع المبلغ المدفوع عبر البوابة من خلال Tap أو Stripe، ويُعاد الجزء المدفوع من المحفظة إلى المحفظة |
| إلى المحفظة `WALLET` | تُضاف قيمة الطلب كاملة إلى محفظة العميل كرصيد، دون أي عملية على البوابة |

في الحالتين يصبح الطلب "مسترجع" مرة واحدة فقط (الضغط المزدوج لا يكرر الاسترجاع)، وتُعاد الوحدات المحجوزة غير المسلّمة إلى المخزون، وتُسجَّل العملية في سجل النشاط. إن رفضت البوابة الاسترجاع لا يتغير شيء ويمكن المحاولة مجدداً أو الاسترجاع إلى المحفظة.

## البريد الإلكتروني (Resend)

- ضع `RESEND_API_KEY` من [Resend](https://resend.com) و `EMAIL_FROM` بعنوان من نطاق موثّق لديهم، مثل `Nitro Store <orders@yourdomain.com>`.
- البريد يحتوي **رابط صفحة الطلب فقط** وليس الأكواد، فالأكواد تظهر في صفحة الطلب المحمية برمز سري.
- بدون `RESEND_API_KEY` يُطبع رابط الطلب في سجل الخادم بدلاً من الإرسال.

## النشر على Railway

ملف `railway.json` جاهز: البناء بـ `npm run build`، وعند كل تشغيل يطبّق `npm run start` الـ migrations والبيانات الأولية تلقائياً قبل تشغيل المتجر، والتشغيل بـ `npm run start`، وفحص الصحة على `/api/health`، وإعادة التشغيل تلقائياً عند التعطل.

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
   | `TAP_SECRET_KEY` | `sk_live_...` من Tap (مدى، KNET، Apple Pay) |
   | `STRIPE_SECRET_KEY` | `sk_live_...` (اختياري، للبطاقات الدولية) |
   | `STRIPE_WEBHOOK_SECRET` | `whsec_...` (مع Stripe فقط) |
   | `RESEND_API_KEY` | مفتاح Resend |
   | `EMAIL_FROM` | `Nitro Store <orders@yourdomain.com>` |
   | `ADMIN_EMAIL` / `ADMIN_PASSWORD` | بيانات أول مدير |
   | `NEXT_PUBLIC_SUPPORT_EMAIL` | إيميل الدعم الظاهر في صفحة التواصل والفوتر |
   | `NEXT_PUBLIC_WHATSAPP_NUMBER` | رقم واتساب الدعم بصيغة دولية بدون `+`، مثل `9665XXXXXXXX` |
   | `TZ` | المنطقة الزمنية لإحصائيات "اليوم" في لوحة التحكم، مثل `Asia/Riyadh` |
   | `DEMO_MODE` | `true` للنسخة التجريبية فقط: الدفع وهمي وفوري بدون بوابة دفع. **لا تفعّله في المتجر الحقيقي** |
   | `REQUIRE_ADMIN_2FA` | `true` لإجبار كل مدير على تفعيل الدخول بخطوتين قبل استخدام لوحة التحكم (موصى به) |

   > **تحذير مهم:** لا تغيّر `INVENTORY_ENCRYPTION_KEY` أبداً بعد رفع أي مخزون، وإلا تصبح جميع الأكواد وبيانات الحسابات المخزنة غير قابلة للقراءة نهائياً. احفظ نسخة منه في مكان آمن.

5. من **Settings → Networking** اضغط **Generate Domain** (أو اربط نطاقك)، وتأكد أن `NEXT_PUBLIC_SITE_URL` يطابقه. هذا المتغير يُضمَّن وقت البناء، لذا أعد النشر (Redeploy) بعد تغييره.
6. إن استخدمت Stripe فأنشئ الـ Webhook على `https://<نطاقك>/api/stripe/webhook` بالأحداث المذكورة أعلاه. إشعارات Tap تصل تلقائياً إلى `https://<نطاقك>/api/tap/webhook`.
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
| فشل `FAILED` | انتهت جلسة الدفع أو فشل الدفع، ويُعاد المخزون المحجوز ورصيد المحفظة واستخدام الكوبون |
| مسترجع `REFUNDED` | استُرجع المبلغ إلى وسيلة الدفع أو المحفظة (انظر "الاسترجاع") |

حالات المخزون: متاح `AVAILABLE` ← محجوز لطلب بانتظار الدفع `RESERVED` ← مباع `SOLD`. إذا حاول عميلان شراء آخر كود في نفس اللحظة، يحجزه أحدهما ويُرفض طلب الآخر برسالة "نفد من المخزون" قبل أن يدفع. لا يمكن أبداً أن يُسلَّم نفس الكود لعميلين.

## فحص سريع (للتطوير فقط)

مع خادم تطوير يعمل بدون Stripe على المنفذ 3100:

```bash
npx next dev -p 3100
node --conditions=react-server --import tsx scripts/verify-payments.mts
```

يختبر السكربت: إنشاء طلب وتسليمه، رفض الكميات غير المتوفرة، 10 طلبات متزامنة على 5 أكواد فقط (5 تنجح و5 تُرفض، ولا يُباع أي كود مرتين)، تكرار التسليم المتزامن، معالجة الـ webhook الموقّع، تحرير الحجز عند انتهاء الجلسة أو فشل الدفع أو مرور 35 دقيقة أو فشل إنشاء جلسة Stripe، وحد الطلبات. ويحذف بيانات الاختبار بعد الانتهاء.

فحص المحفظة والكوبونات وTap والاسترجاع (على قاعدة بيانات تجريبية منفصلة فقط، التفاصيل في رأس الملف):

```bash
R="node --conditions=react-server --import tsx scripts/verify-money.mts"
$R --phase=unit                                   # بدون خادم
npx next dev -p 3100 & $R --phase=dev             # وضع التطوير
TAP_SECRET_KEY=sk_test_mock TAP_API_BASE=http://127.0.0.1:3199/v2 npx next dev -p 3100 & $R --phase=tap   # Tap وهمي يشغّله السكربت
```

</div>

---

## English

**Nitro Store** is an Arabic (RTL) storefront for digital goods: game gift cards, subscriptions, pre-made game accounts and digital services. Customers pay with Tap (mada, KNET, Apple Pay, Gulf cards), Stripe Checkout or their store wallet, can apply coupons, and instantly receive codes / account credentials from encrypted stock (AES-256-GCM).

**Stack:** Next.js 16 App Router, React 19, TypeScript, Prisma 6 + PostgreSQL, Tap Payments, Stripe, Resend (HTTP API), Railway.

**Local setup**

```bash
cp .env.example .env          # fill DATABASE_URL, AUTH_SECRET, INVENTORY_ENCRYPTION_KEY, ADMIN_*
npm install
npx prisma migrate deploy     # or: npm run db:push
npm run db:seed               # idempotent: super admin, categories, sample products with DEMO stock
npm run dev                   # http://localhost:3000, admin at /admin
```

With no payment key (`TAP_SECRET_KEY`, `STRIPE_SECRET_KEY`) and `NODE_ENV` not `production`, checkout and wallet top-ups run in **dev mode**: paid immediately, no real charge. In production without a gateway, only fully wallet-paid orders go through; other checkouts return 503.

**Payments & delivery**

- `POST /api/checkout` `{ email?, items: [{ variantId, quantity }], couponCode?, useWallet?, provider?: "TAP" | "STRIPE" }` → `{ url }` or `{ error }`. Signed-in customers buy under their account email (body email ignored; `useWallet` requires a session). Prices come from the database (`quoteCart()` in `src/lib/pricing.ts`); duplicate lines are merged; 1–20 lines, quantity 1–10; 10 requests/min per IP. One transaction reserves every stock unit (`AVAILABLE → RESERVED`), redeems the coupon under a row lock (maxUses / perCustomerLimit hold under concurrency), debits the wallet under a row lock and creates the order (`subtotal - discount = total`, `total - walletApplied` is charged). Fully wallet-paid orders are delivered at once (`paymentProvider = WALLET`); otherwise a Tap charge or Stripe session is created for the remainder. If that fails, the order is failed and stock, wallet debit and coupon use are released.
- Every `PENDING → FAILED` path (`failPendingOrder()`: Stripe expiry / async failure, Tap final failure, provider error, the 35-minute sweep run by each checkout) releases stock, returns the wallet debit (ledger `REFUND`) and releases the coupon use exactly once, in the transaction that changes the status. A payment confirmed late moves the order `FAILED → PAID`, takes wallet and coupon again and delivers; if the wallet no longer covers its part the order stays `PAID` without automatic delivery.
- Tap: `POST /api/tap/webhook` (set automatically as the charge's `post.url`; register `https://<domain>/api/tap/webhook` if Tap asks) and `GET /api/tap/return?tap_id=chg_…` (buyer return, 303 to the order page or `/account?topup=…`). Neither body nor query is trusted: the charge is re-fetched with `TAP_SECRET_KEY` and applied only if `CAPTURED` with matching amount, currency and metadata. Amounts convert per currency decimals (3 for KWD/BHD/OMR/JOD/TND/LYD/IQD).
- Wallet (`src/lib/wallet.ts`): append-only ledger, customer row locked for every movement, never negative. `POST /api/wallet/topup` `{ amountCents: 500–50000 step 100, provider? }` (session required) credits once on confirmed payment.
- Refunds (`refundOrderPayment()` in `src/lib/payments`): `ORIGINAL` refunds the gateway part via Tap/Stripe and returns the wallet part to the wallet; `WALLET` credits the whole order to the wallet. Runs once under the order row lock, sets `REFUNDED` + `refundedAt`, releases leftover reservations, audited.
- Coupons: `/admin/coupons` (percent with optional cap, or fixed; min subtotal, max uses, per-customer limit, dates, category/product scope). `usedCount` counts redemptions on non-FAILED orders.
- `POST /api/stripe/webhook` verifies the signature and handles `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`. Local testing: `stripe listen --forward-to localhost:3000/api/stripe/webhook`.
- `GET /api/health` → `{ ok: true }` after `SELECT 1`.
- `src/lib/fulfillment.ts`: `markOrderPaid`, `fulfillOrder`, `refreshOrderStatus`, `reserveStock`, `failPendingOrder`, `releaseOrderReservations`, `releaseStaleReservations`. `fulfillOrder` promotes the order's reserved units to `SOLD` and only falls back to AVAILABLE stock (claimed with `SELECT ... FOR UPDATE SKIP LOCKED`) when the reservation was released. It runs one transaction per order item and locks the order item row first, so webhook retries and the admin "retry" button can run concurrently without double delivery. Shortfalls leave the order in `PAID` for manual delivery. Only the caller that moves an order to `FULFILLED` sends the delivery email, which contains the private order link, never the codes.

**Deploying on Railway**

1. New Project → Deploy from GitHub repo; add a PostgreSQL database.
2. Set variables: `DATABASE_URL=${{Postgres.DATABASE_URL}}`, `AUTH_SECRET`, `INVENTORY_ENCRYPTION_KEY` (**never change it once stock exists**: existing stock would become unreadable), `NEXT_PUBLIC_SITE_URL` (inlined at build time, so redeploy after changing it), `TAP_SECRET_KEY` and/or `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `NEXT_PUBLIC_SUPPORT_EMAIL`, `NEXT_PUBLIC_WHATSAPP_NUMBER`, `TZ` (e.g. `Asia/Riyadh`), `REQUIRE_ADMIN_2FA=true` (recommended).
3. `railway.json` builds with `npm run build`, runs `npx prisma migrate deploy` before each deploy, starts with `npm run start`, health-checks `/api/health` and restarts on failure.
4. Generate a domain, then (Stripe only) add the webhook endpoint `https://<domain>/api/stripe/webhook`. Tap notifications go to `https://<domain>/api/tap/webhook` automatically.
5. Seed once: `railway run npm run db:seed`. If your machine can't reach `postgres.railway.internal`, use the public URL (`railway run sh -c 'DATABASE_URL="$DATABASE_PUBLIC_URL" npm run db:seed'` after adding `DATABASE_PUBLIC_URL=${{Postgres.DATABASE_PUBLIC_URL}}`) or `railway ssh`. Use `SEED_SAMPLE_PRODUCTS=false` to skip the sample catalogue, and remove `DEMO-` stock before going live.
6. Sign in at `/admin`.
