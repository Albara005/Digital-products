"use client";

import { useEffect, useRef } from "react";
import { useT } from "@/i18n/client";

const KEY = "nitro-intro";
const BASE = "/intro/nitro-intro-";
/** Give up on a video that hasn't started by then (slow network): the store is more important. */
const START_TIMEOUT_MS = 2500;
const MAX_MS = 6500;
const FADE_MS = 350;

/**
 * Runs before the page paints (inline, right after the overlay): shows the intro whenever the store
 * is opened (not on refresh or back/forward) and starts downloading the right video (portrait/landscape, MP4 or WebM) immediately. Skipped for data-saver / 2G.
 */
const BOOT = `(function(){try{var o=document.getElementById("${KEY}");if(!o)return;var n=performance.getEntriesByType("navigation")[0];if(n&&n.type!=="navigate")return;var c=navigator.connection;if(c&&(c.saveData||/2g/.test(c.effectiveType||"")))return;var v=o.querySelector("video");v.src="${BASE}"+(matchMedia("(orientation: portrait)").matches?"tall":"wide")+(v.canPlayType('video/mp4; codecs="avc1.640028"')?".mp4":".webm");o.hidden=false;var p=v.play();p&&p.catch(function(){})}catch(e){}})();`;

/** Opening intro video, shown whenever the store is opened (not on refresh or in-site navigation). */
export function Intro() {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const o = ref.current;
    const v = o?.querySelector("video");
    if (!o || !v || o.hidden) return;

    let done = false;
    const timers: number[] = [];
    const finish = () => {
      if (done) return;
      done = true;
      for (const id of timers) window.clearTimeout(id);
      o.dataset.leaving = "";
      timers.push(
        window.setTimeout(() => {
          o.hidden = true;
          // Release the decoder and buffered media
          v.pause();
          v.removeAttribute("src");
          v.load();
        }, FADE_MS),
      );
    };

    v.addEventListener("ended", finish);
    v.addEventListener("error", finish);
    o.querySelector("button")?.addEventListener("click", finish);
    // Autoplay can be refused (e.g. battery saver): don't leave visitors on a still frame
    v.play().catch(finish);
    timers.push(
      window.setTimeout(() => {
        if (v.currentTime === 0) finish();
      }, START_TIMEOUT_MS),
      window.setTimeout(finish, MAX_MS),
    );
    return () => {
      v.removeEventListener("ended", finish);
      v.removeEventListener("error", finish);
      for (const id of timers) window.clearTimeout(id);
    };
  }, []);

  return (
    <>
      <div
        ref={ref}
        id={KEY}
        hidden
        suppressHydrationWarning
        className="fixed inset-0 z-[110] bg-black transition-opacity duration-300 data-[leaving]:opacity-0"
      >
        <video
          suppressHydrationWarning
          muted
          playsInline
          autoPlay
          preload="auto"
          disablePictureInPicture
          aria-hidden="true"
          className="absolute inset-0 size-full object-cover portrait:object-contain portrait:[mask-image:linear-gradient(transparent,black_19%,black_81%,transparent)]"
        />
        <button
          type="button"
          className="absolute end-4 bottom-4 rounded-full border border-white/20 bg-black/50 px-4 py-1.5 text-xs font-semibold text-white/80 backdrop-blur transition hover:border-volt hover:text-volt"
        >
          {t.intro.skip}
        </button>
      </div>
      <script dangerouslySetInnerHTML={{ __html: BOOT }} />
    </>
  );
}
