"use client";

import { useState, useTransition } from "react";
import { CopyButton } from "./CopyButton";
import { EyeIcon, EyeOffIcon } from "./icons";
import { btnSm } from "./ui";

export type RevealAction = (id: string) => Promise<{ ok: true; value: string } | { ok: false; message: string }>;

/**
 * Masked stock payload. The decrypted value is fetched from the server only when the
 * admin clicks "إظهار", so it never sits in the page HTML/RSC payload by default.
 */
export function RevealPayload({ id, reveal }: { id: string; reveal: RevealAction }) {
  const [value, setValue] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (value !== null) {
    return (
      <div className="flex min-w-0 flex-1 items-start gap-2">
        <pre dir="ltr" className="min-w-0 flex-1 whitespace-pre-wrap break-all rounded-md bg-surface-2 px-2.5 py-1.5 text-start font-mono text-xs text-text">
          {value}
        </pre>
        <CopyButton text={value} />
        <button type="button" className={btnSm.subtle} onClick={() => setValue(null)} aria-label="إخفاء">
          <EyeOffIcon className="size-3.5" />
          إخفاء
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <span dir="ltr" className="select-none font-mono text-xs tracking-widest text-muted" aria-label="مخفي">
        ••••••••••••
      </span>
      <button
        type="button"
        className={btnSm.subtle}
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const res = await reveal(id);
            if (res.ok) setValue(res.value);
            else setError(res.message);
          })
        }
      >
        <EyeIcon className="size-3.5" />
        {pending ? "…" : "إظهار"}
      </button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
}
