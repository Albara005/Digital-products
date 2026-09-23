// Shape returned by every admin Server Action that drives a form.
// Safe to import from Client Components (types + plain data only).
export type FormState = {
  ok: boolean;
  message: string;
  // Field-level errors keyed by input name ("slug", "variants.0.price", ...)
  errors?: Record<string, string>;
  // Changes on every success so forms can remount/reset their fields
  ts?: number;
} | null;

export type FormAction = (prev: FormState, formData: FormData) => Promise<FormState>;
