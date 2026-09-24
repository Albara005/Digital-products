"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { updateSettings, type SettingsPatch } from "@/lib/settings";
import type { FormState } from "../../_lib/form-state";
import { requireAdminAccess } from "../../_lib/guard";
import { fail, fromZod, ok, str } from "../../_lib/validation";

const DOLLARS = /^\d{1,7}(\.\d{1,2})?$/;

function dollarsToCents(v: string): number {
  const [whole, frac = ""] = v.split(".");
  return Number(whole) * 100 + Number((frac + "00").slice(0, 2));
}

const money = (message: string) =>
  z
    .string()
    .trim()
    .refine((v) => DOLLARS.test(v), message)
    .transform(dollarsToCents);

const optionalMoney = (message: string) =>
  z
    .string()
    .trim()
    .refine((v) => v === "" || DOLLARS.test(v), message)
    .transform((v) => (v === "" ? null : dollarsToCents(v)));

const referralForm = z
  .object({
    enabled: z.boolean(),
    rewardType: z.enum(["PERCENT", "FIXED"], "اختر نوع المكافأة"),
    rewardValue: z.string().trim(),
    maxReward: optionalMoney("مبلغ غير صالح (مثال: 10 أو 9.99)"),
    minOrder: money("مبلغ غير صالح (مثال: 10 أو 9.99)"),
  })
  .transform((v, ctx) => {
    let rewardValue = NaN;
    if (v.rewardType === "PERCENT") {
      if (/^\d{1,3}$/.test(v.rewardValue)) rewardValue = Number(v.rewardValue);
      if (!(rewardValue >= 0 && rewardValue <= 100)) {
        ctx.addIssue({ code: "custom", path: ["rewardValue"], message: "النسبة رقم صحيح من 0 إلى 100" });
        return z.NEVER;
      }
    } else {
      if (DOLLARS.test(v.rewardValue)) rewardValue = dollarsToCents(v.rewardValue);
      if (!(rewardValue >= 0)) {
        ctx.addIssue({ code: "custom", path: ["rewardValue"], message: "مبلغ غير صالح (مثال: 2 أو 1.50)" });
        return z.NEVER;
      }
    }
    return {
      enabled: v.enabled,
      rewardType: v.rewardType,
      rewardValue,
      maxRewardCents: v.maxReward,
      minOrderCents: v.minOrder,
    };
  });

const storeForm = z.object({
  lowStockThreshold: z
    .string()
    .trim()
    .regex(/^\d{1,5}$/, "أدخل رقماً صحيحاً")
    .transform(Number),
});

// Library errors are keyed "referral.rewardValue"; the form fields are named without the prefix.
function saveError(error: z.ZodError): FormState {
  const state = fromZod(error);
  if (!state?.errors) return state;
  const errors: Record<string, string> = {};
  for (const [k, v] of Object.entries(state.errors)) {
    const field = k.split(".").slice(1).join(".") || k;
    const mapped = { rewardValue: "rewardValue", maxRewardCents: "maxReward", minOrderCents: "minOrder" }[field] ?? field;
    errors[mapped] = v;
  }
  return { ...state, errors };
}

async function save(patch: SettingsPatch): Promise<FormState> {
  // SUPER_ADMIN only: enforced here as well as on the page, so a forged POST from a staff session is refused.
  const session = await requireAdminAccess("SUPER_ADMIN");
  const result = await updateSettings(patch, { adminId: session.adminId, email: session.email });
  if (!result.ok) return saveError(result.error);
  revalidatePath("/admin/settings");
  return ok(result.changed.length ? "تم حفظ الإعدادات." : "لا تغييرات.");
}

export async function saveReferralSettings(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdminAccess("SUPER_ADMIN");
  const parsed = referralForm.safeParse({
    enabled: formData.get("enabled") === "on",
    rewardType: str(formData, "rewardType"),
    rewardValue: str(formData, "rewardValue"),
    maxReward: str(formData, "maxReward"),
    minOrder: str(formData, "minOrder"),
  });
  if (!parsed.success) return fromZod(parsed.error);
  return save({ referral: parsed.data });
}

export async function saveStoreSettings(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdminAccess("SUPER_ADMIN");
  const parsed = storeForm.safeParse({ lowStockThreshold: str(formData, "lowStockThreshold") });
  if (!parsed.success) return fromZod(parsed.error);
  if (parsed.data.lowStockThreshold > 10_000) return fail("الرقم كبير جداً.", { lowStockThreshold: "الرقم كبير جداً" });
  return save({ store: parsed.data });
}
