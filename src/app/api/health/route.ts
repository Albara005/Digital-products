import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

function errorName(err: unknown) {
  if (err && typeof err === "object" && "code" in err) return String((err as { code: unknown }).code);
  return err instanceof Error ? err.name : "unknown";
}

/**
 * Railway health check. `/api/health?details=1` also reports which setup steps are missing
 * (variable names and table counts only — never values) to diagnose a broken deploy.
 */
export async function GET(req: Request) {
  const details = new URL(req.url).searchParams.has("details");
  let db: "ok" | string = "ok";
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    console.error("[health] Database check failed", err);
    db = errorName(err);
  }
  if (!details) {
    return Response.json({ ok: db === "ok" }, { status: db === "ok" ? 200 : 503, headers: noStore });
  }

  const env = Object.fromEntries(
    ["DATABASE_URL", "AUTH_SECRET", "INVENTORY_ENCRYPTION_KEY", "ADMIN_EMAIL", "ADMIN_PASSWORD", "DEMO_MODE", "TAP_SECRET_KEY", "STRIPE_SECRET_KEY"].map(
      (k) => [k, Boolean(process.env[k]?.trim())],
    ),
  );
  const key = process.env.INVENTORY_ENCRYPTION_KEY?.trim();
  const keyValid = !!key && Buffer.from(key, "base64").length === 32;

  let migrations: number | string = "n/a";
  let counts: Record<string, number> | string = "n/a";
  if (db === "ok") {
    try {
      const rows = await prisma.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM "_prisma_migrations" WHERE finished_at IS NOT NULL`;
      migrations = Number(rows[0]?.n ?? 0);
    } catch (err) {
      migrations = `missing (${errorName(err)})`;
    }
    try {
      const [categories, products, admins] = await Promise.all([prisma.category.count(), prisma.product.count(), prisma.admin.count()]);
      counts = { categories, products, admins };
    } catch (err) {
      counts = `tables missing (${errorName(err)})`;
    }
  }

  const ok = db === "ok" && typeof counts === "object";
  return Response.json(
    { ok, database: db, migrationsApplied: migrations, counts, env, inventoryKeyValid: keyValid },
    { status: ok ? 200 : 503, headers: noStore },
  );
}
