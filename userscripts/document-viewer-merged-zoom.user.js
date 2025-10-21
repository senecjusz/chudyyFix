// ==UserScript==
// @name         Document Viewer: merged zoom + overlays + top-left align (no UI)
// @namespace    chudyfix
// @version      4.1.0
// @description  Scale image+overlays together inside .document-viewer; force top-left alignment; zoom value read from sessionStorage ('docViewerScale'); no UI rendered here
// @match        *://*/*
// @run-at       document-idle
// @grant        none
// @updateURL    https://git.ts.archax.eu/veloadmingitea/chudyyFix/raw/branch/main/userscripts/document-viewer-merged-zoom.user.js
// @downloadURL  https://git.ts.archax.eu/veloadmingitea/chudyyFix/raw/branch/main/userscripts/document-viewer-merged-zoom.user.js
// ==/UserScript==

(async () => {
  // Guard: allow only specific pages without exposing the URL
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
    if (!allowed.has(hex)) return; // not our target page

    // --- Original script starts here ---
    (function () {
      "use strict";

      // -------------------- Config --------------------
      const VIEWER_SEL    = ".document-viewer";
      const IMG_SEL       = "#documentImage";
      const OVERLAY_SELS  = [
        ".overlay", ".bbox", ".highlight", ".annotation",
        "canvas.overlay", "[data-overlay]", ".ocr-box", ".ocr-line"
      ];
      // Storage for zoom variable (external manager can change it)
      const STORAGE       = sessionStorage; // switch to localStorage if you prefer persistence across tabs
      const SESSION_KEY   = "docViewerScale"; // expected numeric string, e.g. "0.5"
      const DEFAULT_SCALE = 0.4;

      // How many animation frames we enforce scrollTop=0 after changes
      const TOP_NUDGES = 8;

      // -------------------- State --------------------
      function readScale() {
        const raw = STORAGE.getItem(SESSION_KEY);
        const v = parseFloat(raw);
        if (!isFinite(v) || v < 0.1 || v > 4.0) return DEFAULT_SCALE; // allow up to 400%
        return v;
      }
      let scale = readScale();

      // Watcher to spot external changes to the zoom value
      let lastRaw = STORAGE.getItem(SESSION_KEY);
      setInterval(() => {
        const nowRaw = STORAGE.getItem(SESSION_KEY);
        if (nowRaw !== lastRaw) {
          lastRaw = nowRaw;
          scale = readScale();
          applyZoom(); // re-apply immediately on change
        }
      }, 300);

      // -------------------- Hard align: kill flex-centering --------------------
      (function injectAlignmentCSS() {
        const style = document.createElement("style");
        style.textContent = `
          ${VIEWER_SEL} {
            display: block !important;
            align-items: flex-start !important;
            justify-content: flex-start !important;
            align-content: flex-start !important;
            place-items: start !important;
            place-content: flex-start !important;
            overflow: auto !important;
            overscroll-behavior: contain !important;
            scroll-snap-type: none !important;
          }
          ${VIEWER_SEL} > * { margin: 0 !important; }
        `;
        document.documentElement.appendChild(style);
      })();

      // -------------------- Structure (sizer + layer) --------------------
      function ensureLayer(viewer) {
        if (!viewer) return null;

        let sizer = viewer.querySelector("#dvSizer");
        if (!sizer) {
          sizer = document.createElement("div");
          sizer.id = "dvSizer";
          sizer.style.position = "relative";
          viewer.appendChild(sizer);
        }
        let layer = sizer.querySelector("#dvLayer");
        if (!layer) {
          layer = document.createElement("div");
          layer.id = "dvLayer";
          Object.assign(layer.style, {
            position: "absolute",
            left: "0", top: "0",
            transformOrigin: "top left",
            pointerEvents: "none" // overlays can re-enable pointer-events if needed
          });
          sizer.appendChild(layer);
        }
        return { sizer, layer };
      }

      // -------------------- Collect image + overlays into the layer --------------------
      function collectIntoLayer(viewer, layer) {
        const img = viewer.querySelector(IMG_SEL);
        if (!img) return null;

        // normalize image sizing
        img.style.setProperty("max-width", "none", "important");
        img.style.setProperty("max-height", "none", "important");
        img.style.setProperty("object-fit", "unset", "important");
        img.style.setProperty("display", "block", "important");
        img.style.setProperty("margin", "0", "important");
        img.style.setProperty("transform", "none", "important");
        img.style.setProperty("position", "relative", "important");
        img.style.setProperty("pointer-events", "auto", "important");

        if (img.parentElement !== layer) layer.appendChild(img);

        // overlay candidates strictly from inside viewer
        const cand = [];
        OVERLAY_SELS.forEach(sel => viewer.querySelectorAll(sel).forEach(el => cand.push(el)));
        const uniq = Array.from(new Set(cand)).filter(el => el instanceof Element);

        // measure once before moving (for absolute coordinates)
        const lRect0 = layer.getBoundingClientRect();

        uniq.forEach(ov => {
          const oRect = ov.getBoundingClientRect();
          if (ov.parentElement !== layer) layer.appendChild(ov);

          const lRect = lRect0.width ? lRect0 : layer.getBoundingClientRect();
          const leftPx = oRect.left - lRect.left;
          const topPx  = oRect.top  - lRect.top;

          ov.style.setProperty("position", "absolute", "important");
          ov.style.setProperty("left", leftPx + "px", "important");
          ov.style.setProperty("top",  topPx  + "px", "important");
          ov.style.setProperty("transform", "none", "important");
          ov.style.setProperty("z-index", "2", "important");
          ov.style.setProperty("pointer-events", "auto", "important");
        });

        return img;
      }

      // -------------------- Top snap helper --------------------
      function nudgeTop(viewer) {
        let tries = TOP_NUDGES;
        const tick = () => {
          viewer.scrollTop = 0;
          viewer.scrollLeft = 0;
          if (--tries > 0) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }

      // -------------------- Core: apply scale and keep top-left visible --------------------
      function applyZoom() {
        const viewer = document.querySelector(VIEWER_SEL);
        if (!viewer) return;

        const nodes = ensureLayer(viewer);
        if (!nodes) return;
        const { sizer, layer } = nodes;

        const img = layer.querySelector(IMG_SEL);
        if (!img || !img.naturalWidth || !img.naturalHeight) return;

        const w = img.naturalWidth, h = img.naturalHeight;

        // layer has natural dimensions (px) so overlays line up
        layer.style.width  = w + "px";
        layer.style.height = h + "px";

        // scroll area equals scaled size
        sizer.style.width  = Math.max(1, Math.round(w * scale)) + "px";
        sizer.style.height = Math.max(1, Math.round(h * scale)) + "px";

        // scale the whole layer
        layer.style.transform = `scale(${scale})`;

        // enforce absolute top-left visibility
        nudgeTop(viewer);
      }

      // -------------------- Init --------------------
      function init() {
        // Ensure default value exists (but no UI here)
        if (STORAGE.getItem(SESSION_KEY) == null) {
          STORAGE.setItem(SESSION_KEY, String(DEFAULT_SCALE));
          scale = DEFAULT_SCALE;
        } else {
          scale = readScale();
        }

        const viewer = document.querySelector(VIEWER_SEL);
        if (!viewer) return;

        const boot = () => {
          const nodes = ensureLayer(viewer);
          if (!nodes) return;
          const { layer } = nodes;

          const img = viewer.querySelector(IMG_SEL);
          if (!img) return;

          collectIntoLayer(viewer, layer);

          img.addEventListener("load", () => {
            collectIntoLayer(viewer, layer);
            applyZoom();
          }, { passive: true });

          if (img.complete) applyZoom();
        };

        // Keep top alignment if app tweaks DOM (and catch late overlays)
        const mo = new MutationObserver(() => {
          const v = document.querySelector(VIEWER_SEL);
          if (!v) return;
          const nodes = ensureLayer(v);
          if (!nodes) return;
          collectIntoLayer(v, nodes.layer);
          applyZoom();
        });
        mo.observe(document.querySelector(VIEWER_SEL) || document.body, { childList: true, subtree: true, attributes: true });

        // First kick
        boot();

        // Also try on resize
        window.addEventListener("resize", () => {
          applyZoom();
        });
      }

      init();
    })();
    // --- Original script ends here ---

  } catch (err) {
    // If crypto.subtle is unavailable (non-secure context), consider local TM "User includes" instead.
    // console.error('Guard init error:', err);
  }
})();
