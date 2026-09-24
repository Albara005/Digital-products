"use client";

import { useEffect } from "react";
import { IconAlert, IconRefresh } from "@/components/store/icons";
import Link from "@/components/store/link";
import { useT } from "@/i18n/client";

export default function StoreError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const t = useT();
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-lg flex-col items-center px-4 py-24 text-center">
      <span className="grid size-14 place-items-center rounded-2xl bg-danger/10 text-danger ring-1 ring-danger/30">
        <IconAlert className="size-7" />
      </span>
      <h1 className="mt-6 text-2xl font-bold">{t.error.title}</h1>
      <p className="mt-3 text-sm leading-7 text-muted">{t.error.text}</p>
      {error.digest ? (
        <p className="mt-2 text-xs text-muted">
          {t.error.code} <span dir="ltr" className="font-mono">{error.digest}</span>
        </p>
      ) : null}
      <div className="mt-8 flex flex-wrap justify-center gap-2">
        <button type="button" onClick={() => retry()} className="btn-primary">
          <IconRefresh className="size-4" />
          {t.error.retry}
        </button>
        <Link href="/" className="btn-ghost">
          {t.error.home}
        </Link>
      </div>
    </div>
  );
}
