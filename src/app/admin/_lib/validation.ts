import "server-only";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import type { FormState } from "./form-state";

export const idSchema = z
  .string()
  .trim()
  .min(1, "معرّف مفقود")
  .max(64, "معرّف غير صالح")
  .regex(/^[A-Za-z0-9_-]+$/, "معرّف غير صالح");

/** Thrown inside transactions to abort with a user-facing message. */
export class ActionError extends Error {
  constructor(
    message: string,
    public field?: string,
  ) {
    super(message);
  }
}

export function fail(message: string, errors?: Record<string, string>): FormState {
  return { ok: false, message, errors };
}

export function ok(message: string): FormState {
  return { ok: true, message, ts: Date.now() };
}

export function fromZod(error: z.ZodError): FormState {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.map(String).join(".") || "_form";
    errors[key] ??= issue.message;
  }
  const first = error.issues[0]?.message;
  return fail(error.issues.length === 1 && first ? first : "تحقّق من الحقول المظلّلة.", errors);
}

export function fromActionError(e: unknown): FormState | null {
  if (e instanceof ActionError) return fail(e.message, e.field ? { [e.field]: e.message } : undefined);
  return null;
}

export function isUniqueViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

export function isNotFound(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025";
}

/** Serializable transaction lost a race with a concurrent one (e.g. two super admins demoting each other). */
export function isSerializationFailure(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2034";
}

export function isForeignKeyViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003";
}

/** FormData value as string ("" when missing). Files become "" and fail string validators upstream. */
export function str(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === "string" ? v : "";
}
