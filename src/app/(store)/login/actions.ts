"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requestSignInCode, signOutCustomer, verifySignInCode } from "@/lib/customer-auth";
import { latinDigits, safeNextPath } from "@/components/store/site";
import { consume, minutesLabel, requestIp } from "../_lib/rate-limit";

export type SignInState = {
  step: "email" | "code";
  email: string;
  error: string | null;
  /** Server time the latest code was sent (drives the resend cooldown). */
  sentAt: number | null;
  /** Bumped on every response so the code field can reset itself. */
  attempt: number;
};

const WINDOW_MS = 15 * 60_000;
// Per-IP guards on top of customer-auth's own limits (3 codes per email per 10 min, 5 tries per code).
const MAX_SENDS_PER_IP = 10;
const MAX_VERIFY_PER_IP = 30;

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "أدخل بريدك الإلكتروني.")
  .max(254, "البريد الإلكتروني طويل جداً.")
  .pipe(z.email("صيغة البريد الإلكتروني غير صحيحة."));

/** The previous state arrives from the browser: never trust its shape. */
function normalize(prev: unknown): SignInState {
  const p = (prev && typeof prev === "object" ? prev : {}) as Partial<Record<keyof SignInState, unknown>>;
  return {
    step: p.step === "code" ? "code" : "email",
    email: typeof p.email === "string" ? p.email.slice(0, 254) : "",
    error: null,
    sentAt: typeof p.sentAt === "number" && Number.isFinite(p.sentAt) ? p.sentAt : null,
    attempt: typeof p.attempt === "number" && Number.isSafeInteger(p.attempt) ? p.attempt : 0,
  };
}

function field(formData: FormData, key: string) {
  const v = formData.get(key);
  return typeof v === "string" ? v : "";
}

/**
 * One action drives both steps; the submit button's `intent` picks the step:
 * "send" / "resend" email a code, "verify" checks it and signs the customer in.
 */
export async function signInAction(previous: SignInState, formData: FormData): Promise<SignInState> {
  const prev = normalize(previous);
  const intent = field(formData, "intent");
  const attempt = prev.attempt + 1;

  if (intent === "send" || intent === "resend") {
    const parsed = emailSchema.safeParse(intent === "resend" ? prev.email : field(formData, "email"));
    if (!parsed.success) {
      return { ...prev, step: "email", error: parsed.error.issues[0]?.message ?? "البريد غير صالح.", attempt };
    }
    const email = parsed.data;
    const wait = consume(`otp-send:${await requestIp()}`, MAX_SENDS_PER_IP, WINDOW_MS);
    if (wait) {
      return { ...prev, email, error: `طلبات كثيرة من جهازك. حاول مجدداً بعد ${minutesLabel(wait)}.`, attempt };
    }
    const result = await requestSignInCode(email);
    if (!result.ok) return { ...prev, email, error: result.error, attempt };
    return { step: "code", email, error: null, sentAt: Date.now(), attempt };
  }

  if (intent === "verify") {
    const email = emailSchema.safeParse(prev.email);
    if (prev.step !== "code" || !email.success) {
      return { step: "email", email: prev.email, error: "أدخل بريدك الإلكتروني أولاً.", sentAt: null, attempt };
    }
    const code = latinDigits(field(formData, "code"));
    if (code.length !== 6) return { ...prev, error: "أدخل الرمز المكوّن من 6 أرقام.", attempt };

    const wait = consume(`otp-verify:${await requestIp()}`, MAX_VERIFY_PER_IP, WINDOW_MS);
    if (wait) return { ...prev, error: `محاولات كثيرة. حاول مجدداً بعد ${minutesLabel(wait)}.`, attempt };

    const result = await verifySignInCode(email.data, code);
    if (!result.ok) return { ...prev, error: result.error, attempt };

    // New session cookie: re-render the layout (header account button) on the next page.
    revalidatePath("/", "layout");
    redirect(safeNextPath(field(formData, "next")));
  }

  return { ...prev, error: "طلب غير صالح.", attempt };
}

export async function signOutAction(): Promise<void> {
  await signOutCustomer();
  revalidatePath("/", "layout");
  redirect("/");
}
