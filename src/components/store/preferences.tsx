"use client";

import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { useLocale, useT } from "@/i18n/client";
import { LOCALES, type Locale, localizePath, splitLocale } from "@/i18n/config";
import { BASE_CURRENCY, isDisplayCurrency } from "@/lib/display-currency";
import { useDisplayCurrency } from "./currency";
import { IconCheck, IconGlobe } from "./icons";

// Language + display-currency switchers (header menu and footer row).
// Switching language is a full page load of the same page in the other locale ("/cart" <->
// "/en/cart", query string and hash kept): the <html lang dir> and every server-rendered string
// change, so a client-side transition would leave the shell in the old language.

const LANGUAGE_NAMES: Record<Locale, string> = { ar: "العربية", en: "English" };

function useAlternate() {
  const pathname = usePathname() ?? "/";
  const { path } = splitLocale(pathname);
  return (locale: Locale) => localizePath(path, locale);
}

/** Keeps the query string and hash of the current page on the (full page) language switch. */
function keepQuery(event: React.MouseEvent<HTMLAnchorElement>, href: string) {
  event.currentTarget.href = `${href}${window.location.search}${window.location.hash}`;
}

function LanguageLinks({ className, itemClass }: { className: string; itemClass: (active: boolean) => string }) {
  const locale = useLocale();
  const alternate = useAlternate();
  return (
    <div className={className}>
      {LOCALES.map((l) => {
        const href = alternate(l);
        const active = l === locale;
        return (
          <a
            key={l}
            href={href}
            hrefLang={l}
            lang={l}
            aria-current={active ? "true" : undefined}
            onClick={(e) => (active ? e.preventDefault() : keepQuery(e, href))}
            className={itemClass(active)}
          >
            {LANGUAGE_NAMES[l]}
          </a>
        );
      })}
    </div>
  );
}

/** Header button with a small panel: language and display currency. `compact` fits the category bar on phones. */
export function PreferencesMenu({ compact = false, className = "" }: { compact?: boolean; className?: string }) {
  const t = useT();
  const id = useId();
  const locale = useLocale();
  const { selected, options, select, auto, selectAuto } = useDisplayCurrency();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const current = selected?.code ?? BASE_CURRENCY;
  const codes = [BASE_CURRENCY, ...options.map((o) => o.code)];

  return (
    <div ref={root} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={`${id}-panel`}
        aria-label={t.prefs.button}
        title={t.prefs.button}
        className={`grid grid-flow-col place-items-center rounded-lg border border-border bg-surface text-text transition hover:border-volt hover:text-volt aria-expanded:border-volt aria-expanded:text-volt ${
          compact ? "h-8 gap-1 px-2" : "h-10 min-w-10 gap-1.5 px-2.5"
        }`}
      >
        <IconGlobe className={compact ? "size-4" : "size-5"} />
        <span aria-hidden="true" className={`font-display text-xs font-bold ${compact ? "" : "hidden sm:inline"}`}>
          {compact ? locale.toUpperCase() : current}
        </span>
      </button>

      {open ? (
        <div
          id={`${id}-panel`}
          className="card absolute end-0 top-full z-50 mt-2 w-72 max-w-[calc(100vw-2rem)] p-4 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.8)]"
        >
          <p className="text-xs font-bold text-muted">{t.prefs.language}</p>
          <LanguageLinks
            className="mt-2 grid grid-cols-2 gap-2"
            itemClass={(active) =>
              `flex h-10 items-center justify-center rounded-lg border text-sm font-semibold transition ${
                active ? "border-volt bg-volt/[0.07] text-volt" : "border-border bg-surface-2 hover:border-muted/50"
              }`
            }
          />

          {options.length > 0 ? (
            <fieldset className="mt-4">
              <legend className="text-xs font-bold text-muted">{t.prefs.currency}</legend>
              <button
                type="button"
                aria-pressed={auto}
                onClick={() => {
                  selectAuto();
                  setOpen(false);
                }}
                className={`mt-2 flex h-10 w-full items-center justify-between gap-2 rounded-lg border px-3 text-sm transition ${
                  auto ? "border-volt bg-volt/[0.07] text-volt" : "border-border bg-surface-2 hover:border-muted/50"
                }`}
              >
                <span className="font-semibold">
                  {t.prefs.auto} <span className="text-xs font-normal text-muted">· {t.prefs.autoHint}</span>
                </span>
                {auto ? <span className="font-display text-xs font-bold">{current}</span> : null}
              </button>
              <div className="mt-2 grid max-h-64 grid-cols-2 gap-2 overflow-y-auto">
                {codes.map((code) => {
                  const active = !auto && code === current;
                  return (
                    <button
                      key={code}
                      type="button"
                      aria-pressed={active}
                      onClick={() => {
                        select(isDisplayCurrency(code) ? code : BASE_CURRENCY);
                        setOpen(false);
                      }}
                      title={t.prefs.currencies[code]}
                      className={`flex h-10 items-center justify-between gap-2 rounded-lg border px-3 text-sm transition ${
                        active ? "border-volt bg-volt/[0.07] text-volt" : "border-border bg-surface-2 hover:border-muted/50"
                      }`}
                    >
                      <span className="font-display font-bold">{code}</span>
                      {active ? <IconCheck className="size-4" /> : null}
                    </button>
                  );
                })}
              </div>
              <p className="mt-3 text-[11px] leading-5 text-muted">{t.prefs.currencyNote}</p>
            </fieldset>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

const AUTO_VALUE = "auto";

/** Compact language + currency row for the footer. */
export function FooterPreferences({ label }: { label: string }) {
  const t = useT();
  const id = useId();
  const { selected, options, select, auto, selectAuto } = useDisplayCurrency();
  const current = selected?.code ?? BASE_CURRENCY;
  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-3">
      <IconGlobe className="size-4 text-volt" />
      <LanguageLinks
        className="flex items-center gap-1 rounded-full border border-border p-1"
        itemClass={(active) =>
          `rounded-full px-3 py-1 text-xs font-semibold transition ${active ? "bg-volt text-bg" : "text-muted hover:text-text"}`
        }
      />
      {options.length > 0 ? (
        <>
          <label htmlFor={`${id}-currency`} className="sr-only">
            {t.prefs.currency}
          </label>
          <select
            id={`${id}-currency`}
            value={auto ? AUTO_VALUE : current}
            onChange={(e) => {
              const v = e.target.value;
              if (v === AUTO_VALUE) selectAuto();
              else select(isDisplayCurrency(v) ? v : BASE_CURRENCY);
            }}
            className="h-8 rounded-full border border-border bg-surface-2 px-3 font-display text-xs font-bold text-text focus:border-volt focus:outline-none"
          >
            <option value={AUTO_VALUE}>
              {t.prefs.auto} ({current})
            </option>
            {[BASE_CURRENCY, ...options.map((o) => o.code)].map((code) => (
              <option key={code} value={code}>
                {code} — {t.prefs.currencies[code]}
              </option>
            ))}
          </select>
        </>
      ) : null}
    </div>
  );
}
