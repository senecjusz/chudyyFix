// ==UserScript==
// @name         Document Viewer: top-left alignment fix (add-on)
// @namespace    chudyfix
// @version      1.1.0
// @description  Force .document-viewer to align content at the very top-left and snap scrollTop=0 so you can see the absolute top of the image
// @match        *://*/*
// @run-at       document-idle
// @grant        none
// @updateURL    https://git.ts.archax.eu/veloadmingitea/chudyyFix/raw/branch/main/userscripts/document-viewer-top-left-align-addon.user.js
// @downloadURL  https://git.ts.archax.eu/veloadmingitea/chudyyFix/raw/branch/main/userscripts/document-viewer-top-left-align-addon.user.js
// ==/UserScript==

(async () => {
  // Guard: run only on specific pages without exposing the URL
  const allowed = new Set([
    'df9c64cf96e0a7d2389edee1b0df09992ed09d171d99431de4cb102b099a1510',
  ]);

  function normalizePath(p) {
    const noTrailing = p.replace(/\/+$/, '') || '/';
    return noTrailing;
  }

  async function sha256Hex(s) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2,'0')).join('');
  }

  try {
    const canonical = location.origin + normalizePath(location.pathname);
    const hex = await sha256Hex(canonical);
    if (!allowed.has(hex)) return; // not the intended page

    // --- Original script (with English-only comments) ---
    (function () {
      "use strict";

      // Inject CSS to disable centering in .document-viewer
      const style = document.createElement("style");
      style.textContent = `
        .document-viewer {
          display: block !important;                 /* disable flex centering */
          align-items: flex-start !important;
          justify-content: flex-start !important;
          align-content: flex-start !important;
          place-items: start !important;
          place-content: flex-start !important;
          scroll-snap-type: none !important;
        }
        .document-viewer > * {
          margin: 0 !important;
        }
      `;
      document.documentElement.appendChild(style);

      const VIEWER_SEL = ".document-viewer";
      const IMG_SEL = "#documentImage";

      function forceTop() {
        const viewer = document.querySelector(VIEWER_SEL);
        if (!viewer) return;
        viewer.scrollTop = 0;
        viewer.scrollLeft = 0;
      }

      // After image load, pin to absolute top for a few frames (to beat app re-centering)
      function bindImage() {
        const img = document.querySelector(`${VIEWER_SEL} ${IMG_SEL}`);
        if (!img) return;

        const nudgeTop = () => {
          let tries = 8;
          const tick = () => {
            forceTop();
            if (--tries > 0) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        };

        img.addEventListener("load", nudgeTop, { passive: true });
        if (img.complete) nudgeTop();
      }

      // If the app swaps DOM or toggles classes, keep enforcing top alignment
      function ensureObserver() {
        const viewer = document.querySelector(VIEWER_SEL);
        const target = viewer || document.body;
        const mo = new MutationObserver(() => {
          forceTop();
          bindImage();
        });
        mo.observe(target, { childList: true, subtree: true, attributes: true });
      }

      // initial kick
      bindImage();
      forceTop();
      ensureObserver();
    })();
    // --- End original script ---

  } catch (err) {
    // If crypto.subtle is unavailable (non-secure context), consider using TM "User includes" instead.
    // console.error('Guard init error:', err);
  }
})();
