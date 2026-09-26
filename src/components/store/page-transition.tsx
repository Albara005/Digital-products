"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useT } from "@/i18n/client";
import styles from "./page-transition.module.css";

const LOGO = "/brand/transition-mark.webp";
/** Shortest time the overlay stays up, so a prefetched (instant) page still gets the full effect. */
const MIN_VISIBLE_MS = 300;
/** Fade-out length; keep in sync with `.leaving` in the stylesheet. */
const EXIT_MS = 180;
/** Give up if the URL never changes (e.g. a redirect back to the same page). */
const SAFETY_MS = 4000;

type Phase = "idle" | "enter" | "leave";

/** Paths served by route handlers or files, which never render a storefront page. */
const NON_PAGE = /^\/(?:api|media|_next)\/|\.[a-z0-9]{2,5}$/i;

/**
 * The internal page an <a> click will open, or null when the click must be left alone:
 * modified/middle clicks, new tabs, downloads, other origins, same-page hashes, file routes.
 */
function internalTarget(e: MouseEvent): URL | null {
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return null;
  const a = e.target instanceof Element ? e.target.closest("a[href]") : null;
  if (!(a instanceof HTMLAnchorElement)) return null;
  if ((a.target && a.target !== "_self") || a.hasAttribute("download") || a.dataset.noTransition !== undefined) {
    return null;
  }
  const url = new URL(a.href, location.href);
  if (url.origin !== location.origin || NON_PAGE.test(url.pathname)) return null;
  // Same page (only the hash differs, or nothing at all): no navigation to cover
  if (url.pathname === location.pathname && url.search === location.search) return null;
  return url;
}

function Overlay() {
  const t = useT();
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const [phase, setPhase] = useState<Phase>("idle");
  const startedAt = useRef(0);
  const timers = useRef<number[]>([]);

  const clearTimers = useCallback(() => {
    for (const id of timers.current) window.clearTimeout(id);
    timers.current = [];
  }, []);

  const finish = useCallback(() => {
    clearTimers();
    const wait = Math.max(0, MIN_VISIBLE_MS - (performance.now() - startedAt.current));
    timers.current.push(
      window.setTimeout(() => setPhase("leave"), wait),
      window.setTimeout(() => setPhase("idle"), wait + EXIT_MS),
    );
  }, [clearTimers]);

  // Start on internal link clicks. Listening (not intercepting) lets next/link navigate at once,
  // so the overlay adds no delay: it simply covers the swap.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!internalTarget(e)) return;
      clearTimers();
      startedAt.current = performance.now();
      setPhase("enter");
      timers.current.push(window.setTimeout(finish, SAFETY_MS));
    };
    // Back/forward cache restores the page as it was left, overlay included
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) {
        clearTimers();
        setPhase("idle");
      }
    };
    document.addEventListener("click", onClick);
    window.addEventListener("pageshow", onPageShow);
    // Warm the logo once the page is idle so the first transition has it ready
    const warm = window.setTimeout(() => {
      new Image().src = LOGO;
    }, 1500);
    return () => {
      document.removeEventListener("click", onClick);
      window.removeEventListener("pageshow", onPageShow);
      window.clearTimeout(warm);
      clearTimers();
    };
  }, [clearTimers, finish]);

  // The new page has rendered: let the overlay play out, then fade away
  const route = `${pathname}?${search}`;
  useEffect(() => {
    if (phase === "enter") finish();
    // Only a route change ends the transition
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route]);

  if (phase === "idle") return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`${styles.overlay} ${phase === "leave" ? styles.leaving : ""}`}
    >
      <div aria-hidden="true" className={styles.grid} />
      <div aria-hidden="true" className={styles.streaks}>
        {Array.from({ length: 7 }, (_, i) => (
          <span key={i} />
        ))}
      </div>

      <div aria-hidden="true" className={styles.stage}>
        <div className={styles.core} />
        <div className={styles.orbit} />
        <div className={styles.orbitInner} />
        {TILES.map((Icon, i) => (
          <span key={i} className={styles.tile}>
            <Icon />
          </span>
        ))}
        {/* eslint-disable-next-line @next/next/no-img-element -- tiny local asset shown for <0.5s */}
        <img src={LOGO} alt="" width={160} height={160} decoding="async" className={styles.logo} />
      </div>

      <div className={styles.caption}>
        <p dir="ltr" className={styles.brand}>
          Nitro <span>Store</span>
        </p>
        <p className={styles.label}>{t.transition.label}</p>
        <div aria-hidden="true" className={styles.bar}>
          <span />
        </div>
      </div>
    </div>
  );
}

/** Branded overlay played while the storefront moves between pages (never on the first load). */
export function PageTransition() {
  return (
    <Suspense fallback={null}>
      <Overlay />
    </Suspense>
  );
}

function Glyph({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

// Generic gaming / store glyphs orbiting the logo
const TILES = [
  () => (
    <Glyph>
      <path d="M7.5 8h9a4.5 4.5 0 0 1 4.3 5.8l-.9 3a2.3 2.3 0 0 1-4 .7L14.5 16h-5l-1.4 1.5a2.3 2.3 0 0 1-4-.7l-.9-3A4.5 4.5 0 0 1 7.5 8Z" />
      <path d="M8 11v3M6.5 12.5h3M15.5 12h.01M17.5 13.5h.01" />
    </Glyph>
  ),
  () => (
    <Glyph>
      <rect x="3" y="8" width="18" height="4" rx="1" />
      <path d="M5 12v8h14v-8M12 8v12M12 8S10.5 4 8.5 4a2 2 0 0 0 0 4M12 8s1.5-4 3.5-4a2 2 0 0 1 0 4" />
    </Glyph>
  ),
  () => (
    <Glyph>
      <path d="m3 8 4.5 4L12 5l4.5 7L21 8l-2 11H5L3 8Z" />
    </Glyph>
  ),
  () => (
    <Glyph>
      <rect x="2.5" y="5.5" width="19" height="13" rx="2" />
      <path d="M2.5 10h19M6.5 14.5h4" />
    </Glyph>
  ),
  () => (
    <Glyph>
      <path d="M4 14v-2a8 8 0 0 1 16 0v2" />
      <rect x="3" y="14" width="4" height="6" rx="1.5" />
      <rect x="17" y="14" width="4" height="6" rx="1.5" />
    </Glyph>
  ),
  () => (
    <Glyph>
      <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />
    </Glyph>
  ),
];
