/*
 * Idempotent seed: `npm run db:seed` (locally) or `railway run npm run db:seed` (production).
 * - Creates the first SUPER_ADMIN from ADMIN_EMAIL / ADMIN_PASSWORD (never changes an existing admin).
 * - Creates the four categories and sample products if they are missing (existing rows are left as-is,
 *   so admin edits survive re-runs). Set SEED_SAMPLE_PRODUCTS=false to skip the sample catalogue.
 * - Adds obviously fake DEMO stock only to stock variants that have never had any stock.
 * - Creates the sample coupon WELCOME10 (10%, max $5 off) if no coupon with that code exists.
 *
 * Runs outside Next.js, so it cannot import src/lib/crypto.ts or src/lib/auth.ts (both are
 * "server-only"). The encryption below mirrors the v1 format of src/lib/crypto.ts exactly and
 * the bcrypt cost matches hashPassword().
 */
import { existsSync } from "node:fs";
import { createCipheriv, randomBytes } from "node:crypto";
import { PrismaClient, type ProductType } from "@prisma/client";
import bcrypt from "bcryptjs";

if (existsSync(".env") && typeof process.loadEnvFile === "function") {
  process.loadEnvFile(".env"); // does not override variables that are already set
}

const prisma = new PrismaClient();

function encryptionKey(): Buffer | null {
  const raw = process.env.INVENTORY_ENCRYPTION_KEY;
  if (!raw) return null;
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== 32) throw new Error("INVENTORY_ENCRYPTION_KEY must be 32 bytes (base64)");
  return buf;
}

// Same format as src/lib/crypto.ts encrypt(): v1:<iv>:<tag>:<ciphertext>, all base64
function encrypt(plain: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64"), tag.toString("base64"), data.toString("base64")].join(":");
}

const hex = (bytes: number) => randomBytes(bytes).toString("hex").toUpperCase();
const demoCode = () => `DEMO-${hex(2)}-${hex(2)}`;

function demoAccount(game: string, n: number): string {
  return [
    `البريد الإلكتروني: demo.${game}.${n}.${hex(2).toLowerCase()}@example.com`,
    `كلمة المرور: DEMO-Pass-${hex(3)}`,
    "ملاحظة: حساب تجريبي للعرض فقط - غير حقيقي",
  ].join("\n");
}

type SeedProduct = {
  slug: string;
  name: string;
  category: string;
  type: ProductType;
  featured?: boolean;
  warrantyHours?: number;
  description: string;
  variants: { label: string; priceCents: number }[];
};

const categories = [
  { slug: "game-cards", name: "بطاقات ألعاب", description: "بطاقات شحن وهدايا لأشهر متاجر الألعاب، يصلك الكود فوراً بعد الدفع.", sortOrder: 1 },
  { slug: "subscriptions", name: "اشتراكات", description: "اشتراكات الألعاب والتطبيقات بأفضل الأسعار وتفعيل فوري.", sortOrder: 2 },
  { slug: "game-accounts", name: "حسابات ألعاب", description: "حسابات ألعاب جاهزة مع ضمان، تستلم بياناتها فور الدفع.", sortOrder: 3 },
  { slug: "digital-services", name: "خدمات رقمية", description: "خدمات تصميم وتطوير وتحسين حسابات ينفذها فريقنا يدوياً.", sortOrder: 4 },
];

const products: SeedProduct[] = [
  {
    slug: "playstation-store-card",
    name: "بطاقة PlayStation Store",
    category: "game-cards",
    type: "CARD",
    featured: true,
    description:
      "بطاقة رصيد PlayStation Store (المتجر الأمريكي). اشحن محفظة حسابك واشترِ الألعاب والإضافات واشتراكات PlayStation Plus. يصلك الكود فوراً بعد إتمام الدفع.",
    variants: [
      { label: "10 دولار", priceCents: 1099 },
      { label: "25 دولار", priceCents: 2649 },
      { label: "50 دولار", priceCents: 5249 },
    ],
  },
  {
    slug: "steam-wallet-card",
    name: "بطاقة Steam Wallet",
    category: "game-cards",
    type: "CARD",
    featured: true,
    description:
      "رصيد محفظة Steam لشراء الألعاب والمحتوى الإضافي من أكبر متجر ألعاب على الكمبيوتر. الكود صالح للحسابات بالدولار الأمريكي ويُسلَّم فوراً.",
    variants: [
      { label: "5 دولار", priceCents: 549 },
      { label: "20 دولار", priceCents: 2149 },
      { label: "50 دولار", priceCents: 5299 },
    ],
  },
  {
    slug: "xbox-game-pass-ultimate",
    name: "اشتراك Xbox Game Pass Ultimate",
    category: "subscriptions",
    type: "SUBSCRIPTION",
    featured: true,
    description:
      "العب مئات الألعاب على Xbox والكمبيوتر والسحابة، مع Xbox Live Gold وEA Play. كود تفعيل رسمي يُضاف مباشرة إلى حسابك.",
    variants: [
      { label: "شهر واحد", priceCents: 1799 },
      { label: "3 أشهر", priceCents: 4999 },
    ],
  },
  {
    slug: "discord-nitro",
    name: "اشتراك Discord Nitro",
    category: "subscriptions",
    type: "SUBSCRIPTION",
    description:
      "استمتع بمزايا Discord Nitro: رفع ملفات أكبر، بث بجودة عالية، ملصقات وإيموجي مخصصة، وتعزيزان لسيرفرك المفضل. رابط تفعيل فوري.",
    variants: [{ label: "شهر واحد", priceCents: 999 }],
  },
  {
    slug: "fortnite-account",
    name: "حساب Fortnite",
    category: "game-accounts",
    type: "ACCOUNT",
    featured: true,
    warrantyHours: 48,
    description:
      "حساب Fortnite جاهز مع مجموعة سكنات مميزة، مع إمكانية تغيير البريد وكلمة المرور. ضمان لمدة 48 ساعة ضد أي مشكلة في تسجيل الدخول.",
    variants: [
      { label: "حساب مع 50+ سكن", priceCents: 3999 },
      { label: "حساب نادر (سكنات OG)", priceCents: 9999 },
    ],
  },
  {
    slug: "valorant-account",
    name: "حساب Valorant",
    category: "game-accounts",
    type: "ACCOUNT",
    warrantyHours: 24,
    description:
      "حساب Valorant بمستوى مرتفع وجاهز للعب التنافسي على سيرفرات أوروبا، مع إمكانية تغيير بيانات الدخول. ضمان لمدة 24 ساعة.",
    variants: [{ label: "رانك بلاتينيوم - سيرفر أوروبا", priceCents: 2999 }],
  },
  {
    slug: "pro-logo-design",
    name: "تصميم شعار احترافي",
    category: "digital-services",
    type: "SERVICE",
    description:
      "تصميم شعار احترافي لقناتك أو فريقك أو متجرك على يد مصممين محترفين، مع تعديلات مجانية وتسليم خلال 3 أيام عمل. نتواصل معك بعد الطلب لاستلام التفاصيل.",
    variants: [
      { label: "الباقة الأساسية - تصميمان", priceCents: 1999 },
      { label: "الباقة الاحترافية - 4 تصاميم + ملفات المصدر", priceCents: 4999 },
    ],
  },
  {
    slug: "account-boosting",
    name: "تسريع وتحسين حساب الألعاب",
    category: "digital-services",
    type: "SERVICE",
    description:
      "خدمة رفع الرتبة وتحسين حسابك في الألعاب التنافسية بأيدي لاعبين محترفين وبسرية تامة. يتواصل معك فريقنا بعد الطلب لترتيب التنفيذ.",
    variants: [
      { label: "رفع رتبة واحدة", priceCents: 1500 },
      { label: "رفع 3 رتب", priceCents: 3999 },
    ],
  },
];

async function seedAdmin() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? "";
  if (!email) {
    console.warn("! ADMIN_EMAIL is not set; skipping admin creation");
    return;
  }
  const existing = await prisma.admin.findUnique({ where: { email } });
  if (existing) {
    console.log(`= Admin ${email} already exists (password left unchanged)`);
    return;
  }
  if (!password) {
    console.warn("! ADMIN_PASSWORD is not set; skipping admin creation");
    return;
  }
  if (password.length < 8) {
    console.warn("! ADMIN_PASSWORD must be at least 8 characters; skipping admin creation");
    return;
  }
  await prisma.admin.create({
    data: { name: "المدير العام", email, passwordHash: await bcrypt.hash(password, 12), role: "SUPER_ADMIN" },
  });
  console.log(`+ Created SUPER_ADMIN ${email}`);
}

async function seedCatalogue() {
  const categoryIds = new Map<string, string>();
  for (const category of categories) {
    const row = await prisma.category.upsert({
      where: { slug: category.slug },
      create: category,
      update: {},
      select: { id: true },
    });
    categoryIds.set(category.slug, row.id);
  }
  console.log(`= ${categories.length} categories ready`);

  if (process.env.SEED_SAMPLE_PRODUCTS === "false") {
    console.log("= SEED_SAMPLE_PRODUCTS=false; skipping sample products");
    return;
  }

  const key = encryptionKey();
  if (!key) console.warn("! INVENTORY_ENCRYPTION_KEY is not set; sample products get no demo stock");

  let stockAdded = 0;
  for (const p of products) {
    const product = await prisma.product.upsert({
      where: { slug: p.slug },
      create: {
        slug: p.slug,
        name: p.name,
        description: p.description,
        type: p.type,
        featured: p.featured ?? false,
        warrantyHours: p.warrantyHours ?? null,
        categoryId: categoryIds.get(p.category)!,
      },
      update: {},
      select: { id: true, type: true },
    });

    for (const [index, v] of p.variants.entries()) {
      const variant =
        (await prisma.productVariant.findFirst({ where: { productId: product.id, label: v.label }, select: { id: true } })) ??
        (await prisma.productVariant.create({
          data: { productId: product.id, label: v.label, priceCents: v.priceCents, currency: "USD", sortOrder: index },
          select: { id: true },
        }));

      // Stock only for delivered-from-stock types, and only if the variant never had any
      if (!key || product.type === "SERVICE") continue;
      if ((await prisma.inventoryItem.count({ where: { variantId: variant.id } })) > 0) continue;

      const payloads =
        product.type === "ACCOUNT"
          ? [1, 2].map((n) => demoAccount(p.slug.replace(/-account$/, ""), n))
          : Array.from({ length: 5 }, demoCode);
      await prisma.inventoryItem.createMany({
        data: payloads.map((plain) => ({ variantId: variant.id, payload: encrypt(plain, key) })),
      });
      stockAdded += payloads.length;
    }
  }
  console.log(`= ${products.length} sample products ready; ${stockAdded} demo stock units added`);
}

async function seedCoupons() {
  // create-only: an admin's later edits (or deactivation) survive re-runs
  const existing = await prisma.coupon.findUnique({ where: { code: "WELCOME10" }, select: { id: true } });
  if (existing) {
    console.log("= Coupon WELCOME10 already exists (left unchanged)");
    return;
  }
  await prisma.coupon.upsert({
    where: { code: "WELCOME10" },
    create: { code: "WELCOME10", type: "PERCENT", value: 10, maxDiscountCents: 500, active: true },
    update: {},
  });
  console.log("+ Created coupon WELCOME10 (10%, max $5.00 off)");
}

async function main() {
  await seedAdmin();
  await seedCatalogue();
  await seedCoupons();
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
