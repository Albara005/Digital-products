"use client";

import Link from "next/link";
import { useEffect } from "react";
import { IconAlert, IconRefresh } from "@/components/store/icons";

export default function StoreError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-lg flex-col items-center px-4 py-24 text-center">
      <span className="grid size-14 place-items-center rounded-2xl bg-danger/10 text-danger ring-1 ring-danger/30">
        <IconAlert className="size-7" />
      </span>
      <h1 className="mt-6 text-2xl font-bold">حدث خطأ غير متوقع</h1>
      <p className="mt-3 text-sm leading-7 text-muted">
        لم نتمكن من تحميل هذه الصفحة الآن. حاول مرة أخرى بعد لحظات، وإن تكررت المشكلة تواصل معنا.
      </p>
      {error.digest ? (
        <p className="mt-2 text-xs text-muted">
          رمز الخطأ: <span dir="ltr" className="font-mono">{error.digest}</span>
        </p>
      ) : null}
      <div className="mt-8 flex flex-wrap justify-center gap-2">
        <button type="button" onClick={() => retry()} className="btn-primary">
          <IconRefresh className="size-4" />
          إعادة المحاولة
        </button>
        <Link href="/" className="btn-ghost">
          الرئيسية
        </Link>
      </div>
    </div>
  );
}
