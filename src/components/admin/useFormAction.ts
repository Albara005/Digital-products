"use client";

import { startTransition, useActionState, useCallback, type FormEvent } from "react";
import type { FormAction, FormState } from "@/app/admin/_lib/form-state";

/**
 * useActionState for admin forms. Spread `form` onto <form {...form}>.
 *
 * - After hydration, `onSubmit` dispatches manually, so React does not auto-reset the fields:
 *   on a validation error the admin keeps what they typed.
 * - `action` is still set so that before hydration React renders an inert placeholder and
 *   replays the submission once hydrated (never a native GET that would put fields — e.g. a
 *   password — in the URL).
 * - Forms that should clear after success remount their fields with key={state?.ts ?? "…"};
 *   error states carry the previous success stamp forward so an error never triggers that remount.
 */
export function useFormAction(action: FormAction) {
  const run = useCallback(
    async (prev: FormState, formData: FormData): Promise<FormState> => {
      const next = await action(prev, formData);
      return next && !next.ok ? { ...next, ts: prev?.ts } : next;
    },
    [action],
  );
  const [state, dispatch, pending] = useActionState<FormState, FormData>(run, null);
  const onSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      startTransition(() => dispatch(formData));
    },
    [dispatch],
  );
  return [state, { action: dispatch, onSubmit }, pending] as const;
}
