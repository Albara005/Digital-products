"use client";

import { startTransition, useActionState, useCallback, type FormEvent } from "react";
import type { FormAction, FormState } from "@/app/admin/_lib/form-state";

/**
 * useActionState wired through onSubmit instead of <form action>, so React does not
 * auto-reset the fields after the action: on a validation error the admin keeps what they typed.
 * Forms that should clear after success remount their fields with key={state?.ts}.
 */
export function useFormAction(action: FormAction) {
  const [state, dispatch, pending] = useActionState<FormState, FormData>(action, null);
  const onSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      startTransition(() => dispatch(formData));
    },
    [dispatch],
  );
  return [state, onSubmit, pending] as const;
}
