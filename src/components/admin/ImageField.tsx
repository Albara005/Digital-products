"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { FormState } from "@/app/admin/_lib/form-state";
import { FieldError } from "./ui";

const LINK = /^(https?:\/\/|\/(?!\/))/;

/**
 * Image picker for admin forms. Submits `<name>` (the kept/typed link) and `<name>File`
 * (a newly chosen file, which the server stores and prefers). Pass `resetKey` to clear it
 * when the parent form resets.
 */
export function ImageField({
  name,
  label,
  hint,
  defaultUrl,
  aspect = "square",
  state,
}: {
  name: string;
  label: string;
  hint?: string;
  defaultUrl?: string | null;
  aspect?: "square" | "wide";
  state: FormState;
}) {
  const id = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState(defaultUrl ?? "");
  const [preview, setPreview] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  const shown = preview ?? (LINK.test(url.trim()) ? url.trim() : null);

  function clear() {
    if (fileRef.current) fileRef.current.value = "";
    setPreview(null);
    setFileName("");
    setUrl("");
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="label mb-0">{label}</span>
      <div
        className={`relative grid place-items-center overflow-hidden rounded-lg border border-dashed border-border bg-surface-2 ${
          aspect === "square" ? "aspect-square max-w-56" : "aspect-[4/3]"
        }`}
      >
        {shown ? (
          // eslint-disable-next-line @next/next/no-img-element -- local blob / admin-supplied preview
          <img src={shown} alt="" className="size-full object-contain" />
        ) : (
          <span className="px-3 text-center text-xs text-muted">لا توجد صورة</span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={`${id}-file`} className="btn-ghost h-9 cursor-pointer px-3 text-xs">
          {shown ? "تغيير الصورة" : "رفع صورة"}
        </label>
        <input
          ref={fileRef}
          id={`${id}-file`}
          name={`${name}File`}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/avif"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            setPreview(file ? URL.createObjectURL(file) : null);
            setFileName(file?.name ?? "");
          }}
        />
        {shown ? (
          <button type="button" onClick={clear} className="btn-danger h-9 px-3 text-xs">
            إزالة
          </button>
        ) : null}
        {fileName ? (
          <span dir="ltr" className="max-w-48 truncate text-xs text-muted">
            {fileName}
          </span>
        ) : null}
      </div>

      <details className="text-xs text-muted">
        <summary className="cursor-pointer select-none">أو ضع رابط صورة</summary>
        <input
          name={name}
          dir="ltr"
          className="input mt-2 text-start"
          placeholder="https://…"
          value={url}
          maxLength={2000}
          onChange={(e) => {
            setUrl(e.target.value);
            if (fileRef.current) fileRef.current.value = "";
            setPreview(null);
            setFileName("");
          }}
        />
      </details>
      {hint ? <p className="text-xs text-muted">{hint}</p> : null}
      <FieldError state={state} name={name} />
    </div>
  );
}
