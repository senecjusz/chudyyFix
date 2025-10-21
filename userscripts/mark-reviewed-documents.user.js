// ==UserScript==
// @name         Mark reviewed documents (configurable color & label)
// @namespace    chudyfix
// @version      1.2.0
// @description  Marks document cards as reviewed after you click them. Color and label are configurable.
// @match        *://*/*
// @run-at       document-idle
// @grant        GM_addStyle
// @grant        GM_registerMenuCommand
// @updateURL    https://git.ts.archax.eu/veloadmingitea/chudyyFix/raw/branch/main/userscripts/mark-reviewed-documents.user.js
// @downloadURL  https://git.ts.archax.eu/veloadmingitea/chudyyFix/raw/branch/main/userscripts/mark-reviewed-documents.user.js
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

    // --- Original script starts here ---
    (function () {
      "use strict";

      // ===== CONFIG =====
      // RGB color for the mark (use subtle gray by default)
      const COLOR_RGB = [128, 128, 128];     // e.g. [128,128,128] = gray
      const BADGE_ALPHA = 0.85;              // 0..1 background opacity of the badge
      const OUTLINE_PX = 2;                  // outline thickness in px
      const IMG_OPACITY = 0.95;              // 1 = no change
      const IMG_SATURATE = 0.9;              // 1 = no change, <1 = less saturated
      const BADGE_TEXT = "✓ viewed";         // badge label text
      // ===== /CONFIG =====

      const STORAGE_KEY = "tm_viewed_docs_v1";

      function loadViewedSet() {
        try {
          const arr = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
          return new Set(arr);
        } catch {
          return new Set();
        }
      }
      function saveViewedSet(set) {
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
        } catch {}
      }
      let viewed = loadViewedSet();

      // Build CSS using config
      const COLOR_RGB_STR = COLOR_RGB.join(",");
      const COLOR_SOLID = `rgb(${COLOR_RGB_STR})`;
      const BADGE_BG = `rgba(${COLOR_RGB_STR}, ${BADGE_ALPHA})`;

      const css = `
      .document-card { position: relative; }
      .document-card.tm-reviewed { outline: ${OUTLINE_PX}px solid ${COLOR_SOLID}; border-radius: 8px; }
      .document-card.tm-reviewed .document-preview img { opacity: ${IMG_OPACITY}; filter: saturate(${IMG_SATURATE}); }
      .document-card .tm-reviewed-badge {
        position: absolute; top: 6px; left: 6px;
        font: 700 12px/1 ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;
        background: ${BADGE_BG}; color: #fff;
        padding: 2px 6px; border-radius: 9999px;
        box-shadow: 0 1px 2px rgba(0,0,0,.15); z-index: 100; pointer-events: none;
      }`;

      if (typeof GM_addStyle === "function") GM_addStyle(css);
      else {
        const s = document.createElement("style");
        s.textContent = css;
        document.head.appendChild(s);
      }

      function getDocIdFromCard(card) {
        const preview = card.querySelector(".document-preview");
        const hash = preview?.dataset?.hash || preview?.getAttribute("data-hash");
        if (hash) return `hash:${hash}`;
        const pathEl = card.querySelector(".document-info .document-path");
        const path = pathEl?.getAttribute("title") || pathEl?.textContent?.trim();
        if (path) return `path:${path}`;
        const pid = preview?.id;
        if (pid) return `id:${pid}`;
        return null;
      }

      function applyMark(card, on) {
        if (!card) return;
        if (on) {
          if (!card.classList.contains("tm-reviewed")) {
            card.classList.add("tm-reviewed");
            let badge = card.querySelector(".tm-reviewed-badge");
            if (!badge) {
              badge = document.createElement("div");
              badge.className = "tm-reviewed-badge";
              badge.textContent = BADGE_TEXT;
              card.appendChild(badge);
            } else {
              badge.textContent = BADGE_TEXT; // keep text in sync with config
            }
          }
        } else {
          card.classList.remove("tm-reviewed");
          card.querySelector(".tm-reviewed-badge")?.remove();
        }
      }

      function syncAllMarks(root = document) {
        root.querySelectorAll(".document-card").forEach((card) => {
          const id = getDocIdFromCard(card);
          applyMark(card, id && viewed.has(id));
        });
      }

      function markCardAsViewed(card) {
        const id = getDocIdFromCard(card);
        if (!id) return;
        if (!viewed.has(id)) {
          viewed.add(id);
          saveViewedSet(viewed);
        }
        applyMark(card, true);
      }

      // Mark on click (opening modal)
      document.addEventListener(
        "click",
        (ev) => {
          const preview = ev.target.closest(".document-card .document-preview");
          if (!preview) return;
          const card = preview.closest(".document-card");
          if (!card) return;
          markCardAsViewed(card);
        },
        { capture: true }
      );

      // Handle dynamically added cards
      const mo = new MutationObserver((muts) => {
        for (const m of muts) {
          for (const n of m.addedNodes) {
            if (!(n instanceof HTMLElement)) continue;
            if (n.matches?.(".document-card")) {
              syncAllMarks(n);
            } else {
              n.querySelectorAll?.(".document-card").forEach((c) => syncAllMarks(c));
            }
          }
        }
      });
      mo.observe(document.body, { childList: true, subtree: true });

      // Initial pass
      syncAllMarks();

      // Menu: reset
      if (typeof GM_registerMenuCommand === "function") {
        GM_registerMenuCommand("Reset reviewed marks", () => {
          viewed.clear();
          saveViewedSet(viewed);
          syncAllMarks();
          alert("Reviewed marks cleared.");
        });
      }
    })();
    // --- Original script ends here ---

  } catch (err) {
    // If crypto.subtle is unavailable (non-secure context), consider using TM "User includes" instead.
    // console.error('Guard init error:', err);
  }
})();
