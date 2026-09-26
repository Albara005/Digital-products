"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useT } from "@/i18n/client";
import styles from "./page-transition.module.css";

const LOGO = "/brand/transition-mark.webp";
/** Shortest time the overlay stays up, so a prefetched (instant) page still gets the full effect. */
const MIN_VISIBLE_MS = 360;
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
      aria-label={t.transition.label}
      className={`${styles.overlay} ${phase === "leave" ? styles.leaving : ""}`}
    >
      <div aria-hidden="true" className={styles.haze} />

      {/* Warp streaks rushing out of the centre on both sides */}
      <div aria-hidden="true" className={styles.warp}>
        {STREAKS.map(([side, y, len, thick, delay, blur, tone], i) => (
          <span
            key={i}
            className={`${styles.streak} ${side === "l" ? styles.left : styles.right} ${tone === "w" ? styles.white : ""}`}
            style={
              {
                "--y": y,
                "--len": len,
                "--thick": thick,
                "--delay": `${delay}ms`,
                "--blur": blur,
              } as React.CSSProperties
            }
          />
        ))}
      </div>

      <div aria-hidden="true" className={styles.flare} />

      {/* Logo wrapped in a tilted orbit ring (back half behind the logo, front half over it) */}
      <div aria-hidden="true" className={styles.emblem}>
        <div className={`${styles.ring} ${styles.ringBack}`}>
          <span className={styles.ringGlow} />
          <span className={styles.ringArc} />
          <span className={styles.ringDust} />
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element -- local asset shown for ~0.5s */}
        <img src={LOGO} alt="" width={280} height={280} decoding="async" className={styles.logo} />
        <div className={`${styles.ring} ${styles.ringFront}`}>
          <span className={styles.ringGlow} />
          <span className={styles.ringArc} />
        </div>
      </div>

      <div aria-hidden="true">
        {TILES.map(({ id, icon, brand }) => (
          <span key={id} className={`${styles.tile} ${styles[id]} ${brand ? styles.brandTile : ""}`}>
            <span className={styles.tileFace}>{icon}</span>
          </span>
        ))}
      </div>

      <p className={styles.caption}>
        {t.transition.lead}
        <span>{t.transition.accent}…</span>
      </p>
      <div aria-hidden="true" dir="ltr" className={styles.bar}>
        <span className={styles.barFill} />
        <i style={{ left: "0%" }} />
        <i style={{ left: "18%" }} />
        <i className={styles.barHead} />
        <i style={{ left: "100%" }} />
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

// [side, y %, length cqw, thickness u, delay ms, blur u, tone]
const STREAKS: [side: "l" | "r", y: number, len: number, thick: number, delay: number, blur: number, tone?: "w"][] = [
  ["l", 24, 30, 0.9, 0, 0.5],
  ["l", 32, 42, 0.5, 60, 0.25],
  ["l", 38, 26, 1.6, 120, 0.9],
  ["l", 44, 46, 0.35, 30, 0.15],
  ["l", 50, 36, 1.1, 90, 0.6, "w"],
  ["l", 55, 44, 0.4, 150, 0.2],
  ["l", 62, 30, 1.4, 20, 0.8],
  ["l", 70, 38, 0.6, 110, 0.35],
  ["l", 78, 24, 0.9, 180, 0.6],
  ["r", 22, 32, 1.2, 40, 0.7],
  ["r", 30, 44, 0.4, 0, 0.2],
  ["r", 36, 28, 0.9, 140, 0.5],
  ["r", 43, 40, 1.7, 70, 1],
  ["r", 49, 46, 0.35, 10, 0.15],
  ["r", 56, 34, 0.8, 120, 0.4],
  ["r", 63, 40, 1.3, 50, 0.8, "w"],
  ["r", 71, 30, 0.5, 160, 0.25],
  ["r", 80, 26, 1, 90, 0.6],
];

const TILES: { id: string; brand?: boolean; icon: React.ReactNode }[] = [
  {
    id: "playstation",
    brand: true,
    icon: (
      <Glyph fill>
        <path d="M8.984 2.596v17.547l3.915 1.261V6.688c0-.69.304-1.151.794-.991.636.18.76.814.76 1.505v5.875c2.441 1.193 4.362-.002 4.362-3.152 0-3.237-1.126-4.675-4.438-5.827-1.307-.448-3.728-1.186-5.39-1.502zm4.656 16.241l6.296-2.275c.715-.258.826-.625.246-.818-.586-.192-1.637-.139-2.357.123l-4.205 1.5V14.98l.24-.085s1.201-.42 2.913-.615c1.696-.18 3.785.03 5.437.661 1.848.601 2.04 1.472 1.576 2.072-.465.6-1.622 1.036-1.622 1.036l-8.544 3.107V18.86zM1.807 18.6c-1.9-.545-2.214-1.668-1.352-2.32.801-.586 2.16-1.052 2.16-1.052l5.615-2.013v2.313L4.205 17c-.705.271-.825.632-.239.826.586.195 1.637.15 2.343-.12L8.247 17v2.074c-.12.03-.256.044-.39.073-1.939.331-3.996.196-6.038-.479z" />
      </Glyph>
    ),
  },
  {
    id: "crown",
    icon: (
      <Glyph fill>
        <path d="M2.5 7.5 7 11l5-7 5 7 4.5-3.5L19.5 18h-15L2.5 7.5ZM4.5 19.5h15V21h-15z" />
      </Glyph>
    ),
  },
  {
    id: "ghost",
    icon: (
      <Glyph fill>
        <path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h15A1.5 1.5 0 0 1 21 6.5V8H3V6.5ZM3 10h18v7.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5V10Z" />
      </Glyph>
    ),
  },
  {
    id: "card",
    icon: (
      <Glyph fill>
        <path d="M2.5 6.5A1.5 1.5 0 0 1 4 5h16a1.5 1.5 0 0 1 1.5 1.5v1.5h-19V6.5Zm0 4h19v7A1.5 1.5 0 0 1 20 19H4a1.5 1.5 0 0 1-1.5-1.5v-7Zm2.5 3v2h6v-2H5Zm11.5 1a1.5 1.5 0 1 0 3 0 1.5 1.5 0 0 0-3 0Z" />
      </Glyph>
    ),
  },
  {
    id: "steam",
    brand: true,
    icon: (
      <Glyph fill>
        <path d="M11.979 0C5.678 0 .511 4.86.022 11.037l6.432 2.658c.545-.371 1.203-.59 1.912-.59.063 0 .125.004.188.006l2.861-4.142V8.91c0-2.495 2.028-4.524 4.524-4.524 2.494 0 4.524 2.031 4.524 4.527s-2.03 4.525-4.524 4.525h-.105l-4.076 2.911c0 .052.004.105.004.159 0 1.875-1.515 3.396-3.39 3.396-1.635 0-3.016-1.173-3.331-2.727L.436 15.27C1.862 20.307 6.486 24 11.979 24c6.627 0 11.999-5.373 11.999-12S18.605 0 11.979 0zM7.54 18.21l-1.473-.61c.262.543.714.999 1.314 1.25 1.297.539 2.793-.076 3.332-1.375.263-.63.264-1.319.005-1.949s-.75-1.121-1.377-1.383c-.624-.26-1.29-.249-1.878-.03l1.523.63c.956.4 1.409 1.5 1.009 2.455-.397.957-1.497 1.41-2.454 1.012H7.54zm11.415-9.303c0-1.662-1.353-3.015-3.015-3.015-1.665 0-3.015 1.353-3.015 3.015 0 1.665 1.35 3.015 3.015 3.015 1.663 0 3.015-1.35 3.015-3.015zm-5.273-.005c0-1.252 1.013-2.266 2.265-2.266 1.249 0 2.266 1.014 2.266 2.266 0 1.251-1.017 2.265-2.266 2.265-1.253 0-2.265-1.014-2.265-2.265z" />
      </Glyph>
    ),
  },
  {
    id: "xbox",
    brand: true,
    icon: (
      <Glyph fill>
        <path d="M4.102 21.033C6.211 22.881 8.977 24 12 24c3.026 0 5.789-1.119 7.902-2.967 1.877-1.912-4.316-8.709-7.902-11.417-3.582 2.708-9.779 9.505-7.898 11.417zm11.16-14.406c2.5 2.961 7.484 10.313 6.076 12.912C23.002 17.48 24 14.861 24 12.004c0-3.34-1.365-6.362-3.57-8.536 0 0-.027-.022-.082-.042-.063-.022-.152-.045-.281-.045-.592 0-1.985.434-4.805 3.246zM3.654 3.426c-.057.02-.082.041-.086.042C1.365 5.642 0 8.664 0 12.004c0 2.854.998 5.473 2.661 7.533-1.401-2.605 3.579-9.951 6.08-12.91-2.82-2.813-4.216-3.245-4.806-3.245-.131 0-.223.021-.281.046v-.002zM12 3.551S9.055 1.828 6.755 1.746c-.903-.033-1.454.295-1.521.339C7.379.646 9.659 0 11.984 0H12c2.334 0 4.605.646 6.766 2.085-.068-.046-.615-.372-1.52-.339C14.946 1.828 12 3.545 12 3.545v.006z" />
      </Glyph>
    ),
  },
  {
    id: "gift",
    icon: (
      <Glyph fill>
        <path d="M3 8.5A1.5 1.5 0 0 1 4.5 7h15A1.5 1.5 0 0 1 21 8.5V11H3V8.5ZM4 12.5h7V21H5.5A1.5 1.5 0 0 1 4 19.5v-7Zm9 0h7v7a1.5 1.5 0 0 1-1.5 1.5H13v-8.5ZM11 7h2v4h-2zM12 7S10.6 2.5 7.8 3.2C5.9 3.7 6.4 7 9 7h3Zm0 0s1.4-4.5 4.2-3.8C18.1 3.7 17.6 7 15 7h-3Z" />
      </Glyph>
    ),
  },
];

function Glyph({ children, fill }: { children: React.ReactNode; fill?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill={fill ? "currentColor" : "none"} stroke={fill ? "none" : "currentColor"}>
      {children}
    </svg>
  );
}
