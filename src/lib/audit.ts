import "server-only";
import { headers } from "next/headers";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type AuditActor = { adminId: string; email: string };

/**
 * Records an admin action. Never throws: a logging failure must not block the action itself.
 * `action` is a dotted verb like "product.update", "inventory.reveal", "order.refund".
 * Never put secrets (codes, credentials, passwords, TOTP secrets) in `details`.
 */
export async function audit(
  actor: AuditActor | null,
  action: string,
  target?: { type: string; id: string } | null,
  details?: Prisma.InputJsonValue,
): Promise<void> {
  try {
    let ip: string | null = null;
    try {
      const h = await headers();
      ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
    } catch {
      // Outside a request scope (scripts, webhooks run via tests)
    }
    await prisma.auditLog.create({
      data: {
        adminId: actor?.adminId ?? null,
        adminEmail: actor?.email ?? "system",
        action,
        targetType: target?.type ?? null,
        targetId: target?.id ?? null,
        details: details ?? undefined,
        ip,
      },
    });
  } catch (err) {
    console.error(`[audit] failed to record ${action}`, err);
  }
}
