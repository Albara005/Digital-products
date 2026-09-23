"use client";

import { useEffect } from "react";
import { AlertIcon } from "@/components/admin/icons";

export default function AdminError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="card mx-auto mt-10 flex max-w-lg flex-col items-center gap-3 p-8 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-danger/10 text-danger">
        <AlertIcon className="size-6" />
      </span>
      <h2 className="text-lg font-bold">حدث خطأ غير متوقع</h2>
      <p className="text-sm text-muted">تعذّر تحميل هذه الصفحة. حاول مجدداً، وإن تكرر الخطأ راجع سجلات الخادم.</p>
      {error.digest && (
        <p className="font-mono text-xs text-muted" dir="ltr">
          ref: {error.digest}
        </p>
      )}
      <button type="button" className="btn-primary mt-2" onClick={() => retry()}>
        إعادة المحاولة
      </button>
    </div>
  );
}
