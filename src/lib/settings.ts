import "server-only";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { audit, type AuditActor } from "@/lib/audit";

/*
 * Admin-editable store settings, one StoreSetting row per key (value = JSON object).
 *
 * Every read is validated: a missing row, a missing field or a malformed value falls back to the
 * default for that field, so callers always get a complete, valid object. Writes go through
 * updateSettings(), which validates the merged result and records an audit entry.
 */

const referralSchema = z
  .object({
    enabled: z.boolean(),
    /** PERCENT: rewardValue is a percentage of the referee's first order total. FIXED: rewardValue is cents. */
    rewardType: z.enum(["PERCENT", "FIXED"]),
    rewardValue: z.number().int("أدخل رقماً صحيحاً").min(0, "القيمة لا تكون سالبة").max(100_000, "القيمة كبيرة جداً"),
    /** Cap on a single reward, in cents; null = no cap (only meaningful for PERCENT). */
    maxRewardCents: z.number().int().min(0, "الحد الأقصى لا يكون سالباً").max(1_000_000, "الحد الأقصى كبير جداً").nullable(),
    /** The referee's first order must total at least this much (cents) to earn a reward. */
    minOrderCents: z.number().int().min(0, "الحد الأدنى لا يكون سالباً").max(10_000_000, "الحد الأدنى كبير جداً"),
  })
  .superRefine((v, ctx) => {
    if (v.rewardType === "PERCENT" && v.rewardValue > 100) {
      ctx.addIssue({ code: "custom", path: ["rewardValue"], message: "النسبة من 0 إلى 100" });
    }
  });

const storeSchema = z.object({
  /** Variants with fewer available units than this are flagged as low stock. */
  lowStockThreshold: z.number().int("أدخل رقماً صحيحاً").min(0, "لا يكون سالباً").max(10_000, "الرقم كبير جداً"),
});

export type ReferralSettings = z.infer<typeof referralSchema>;
export type StoreSettings = z.infer<typeof storeSchema>;

export type Settings = {
  referral: ReferralSettings;
  store: StoreSettings;
};
export type SettingKey = keyof Settings;

export const SETTING_DEFAULTS: Settings = {
  referral: { enabled: true, rewardType: "PERCENT", rewardValue: 5, maxRewardCents: 1000, minOrderCents: 1000 },
  store: { lowStockThreshold: 5 },
};

const schemas: { [K in SettingKey]: z.ZodType<Settings[K]> } = {
  referral: referralSchema,
  store: storeSchema,
};

const KEYS = Object.keys(SETTING_DEFAULTS) as SettingKey[];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Stored JSON -> complete valid object. Invalid fields are replaced by their defaults one by one. */
function resolve<K extends SettingKey>(key: K, stored: unknown): Settings[K] {
  const defaults = SETTING_DEFAULTS[key];
  if (!isRecord(stored)) return { ...defaults };
  const schema = schemas[key];
  const merged: Record<string, unknown> = { ...defaults, ...stored };
  const whole = schema.safeParse(merged);
  if (whole.success) return whole.data;
  // Drop the offending fields and retry; if it still fails, fall back to the defaults entirely.
  for (const issue of whole.error.issues) {
    const field = issue.path[0];
    if (typeof field === "string" && field in defaults) merged[field] = (defaults as Record<string, unknown>)[field];
  }
  const retry = schema.safeParse(merged);
  return retry.success ? retry.data : { ...defaults };
}

/** One settings group, with defaults for anything unset. */
export async function getSetting<K extends SettingKey>(key: K): Promise<Settings[K]> {
  const row = await prisma.storeSetting.findUnique({ where: { key }, select: { value: true } });
  return resolve(key, row?.value);
}

/** Every settings group. */
export async function getSettings(): Promise<Settings> {
  const rows = await prisma.storeSetting.findMany({ where: { key: { in: KEYS } }, select: { key: true, value: true } });
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  return {
    referral: resolve("referral", byKey.get("referral")),
    store: resolve("store", byKey.get("store")),
  };
}

export type SettingsPatch = { [K in SettingKey]?: Partial<Settings[K]> };

export type UpdateSettingsResult =
  | { ok: true; settings: Settings; changed: SettingKey[] }
  /** `error.issues[].path` starts with the settings key, e.g. ["referral", "rewardValue"]. */
  | { ok: false; error: z.ZodError };

/**
 * Merges `patch` into the current values, validates the result and saves the changed groups
 * (audited as "settings.update" with before/after per group). Unknown keys are ignored.
 */
export async function updateSettings(patch: SettingsPatch, actor: AuditActor): Promise<UpdateSettingsResult> {
  const keys = KEYS.filter((k) => patch[k] !== undefined);
  const current = await getSettings();
  const next: Settings = { ...current };
  const issues: z.core.$ZodIssue[] = [];

  for (const key of keys) {
    const parsed = schemas[key].safeParse({ ...current[key], ...patch[key] });
    if (!parsed.success) {
      for (const issue of parsed.error.issues) issues.push({ ...issue, path: [key, ...issue.path] });
      continue;
    }
    (next as Record<SettingKey, unknown>)[key] = parsed.data;
  }
  if (issues.length) return { ok: false, error: new z.ZodError(issues) };

  const changed = keys.filter((k) => JSON.stringify(current[k]) !== JSON.stringify(next[k]));
  if (changed.length === 0) return { ok: true, settings: current, changed };

  await prisma.$transaction(
    changed.map((key) => {
      const value = next[key] as unknown as Prisma.InputJsonValue;
      return prisma.storeSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
    }),
  );
  const details: Record<string, { from: Prisma.InputJsonValue; to: Prisma.InputJsonValue }> = {};
  for (const key of changed) {
    details[key] = { from: current[key] as unknown as Prisma.InputJsonValue, to: next[key] as unknown as Prisma.InputJsonValue };
  }
  await audit(actor, "settings.update", { type: "settings", id: changed.join(",") }, details);
  return { ok: true, settings: next, changed };
}
