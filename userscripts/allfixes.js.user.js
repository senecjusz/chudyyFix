// ==UserScript==
// @name         chudyyFix — all-in-one
// @namespace    chudyyFix
// @version      0.4.1
// @description  Panel/opcje, skróty, style itd. + Document Viewer merged zoom/overlay (hashed URL guard)
// @match        *://*/*
// @run-at       document-idle
// @grant        GM_addStyle
// @grant        GM_registerMenuCommand
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @updateURL    https://raw.githubusercontent.com/senecjusz/chudyyFix/main/userscripts/allfixes.js.user.js
// @downloadURL  https://raw.githubusercontent.com/senecjusz/chudyyFix/main/userscripts/allfixes.js.user.js
// ==/UserScript==

(function () {
  "use strict";

  // ===== SETTINGS (cookie with LS fallback) =====
  const DEFAULTS = {
    ver: 4,
    ui: { corner: "br", size: 36 },
    modules: {
      // existing
      searchOnEnter: true,
      markReviewed: true,
      // new
      dvMergedZoom: true,               // now enabled by default
      dvMergedZoomPercent: 40,          // 10..100
    },
    // allowed hex list seeded with your working hash
    allowedHashes: [
      "df9c64cf96e0a7d2389edee1b0df09992ed09d171d99431de4cb102b099a1510",
    ],
  };

  const CK = "chudyyFix_min_settings";
  const LS = "chudyyFix_min_settings_ls";
  const DAYS = 3650;

  function setCookie(n, v, d) {
    const exp = new Date(Date.now() + d * 864e5).toUTCString();
    const secure = location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${n}=${v}; Expires=${exp}; Path=/; SameSite=Lax${secure}`;
  }
  function getCookie(n) {
    return document.cookie.split("; ").find(c => c.startsWith(n + "="))?.split("=")[1];
  }
  function merge(base, patch) {
    const out = structuredClone(base);
    if (patch && typeof patch === "object") {
      if (patch.ui) out.ui = { ...out.ui, ...patch.ui };
      if (patch.modules) out.modules = { ...out.modules, ...patch.modules };
      if (Array.isArray(patch.allowedHashes)) {
        out.allowedHashes = Array.from(new Set([...(patch.allowedHashes || [])]));
      }
    }
    return out;
  }
  function saveSettings(s) {
    const js = JSON.stringify(s);
    const enc = encodeURIComponent(js);
    if (enc.length > 3800) {
      try { localStorage.setItem(LS, js); } catch {}
      setCookie(CK, "__LS__", DAYS);
    } else {
      setCookie(CK, enc, DAYS);
      try { localStorage.removeItem(LS); } catch {}
    }
  }
  function loadSettings() {
    const raw = getCookie(CK);
    if (!raw) return structuredClone(DEFAULTS);
    if (raw === "__LS__") {
      try {
        const js = localStorage.getItem(LS);
        if (js) return merge(DEFAULTS, JSON.parse(js));
      } catch {}
      return structuredClone(DEFAULTS);
    }
    try { return merge(DEFAULTS, JSON.parse(decodeURIComponent(raw))); }
    catch { return structuredClone(DEFAULTS); }
  }
  let SETTINGS = loadSettings();

  // ===== URL GUARD (hashed origin+path) =====
  function normalizePath(p) {
    const noTrailing = (p || "/").replace(/\/+$/, "") || "/";
    return noTrailing;
  }
  async function sha256Hex(s) {
    try {
      const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
      return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2,"0")).join("");
    } catch {
      // fallback (non-crypto)
      let h = 5381;
      for (let i = 0; i < s.length; i++) h = ((h<<5)+h) ^ s.charCodeAt(i);
      return "djb2_" + (h>>>0).toString(16);
    }
  }
  async function currentCanonicalHex() {
    const canonical = location.origin + normalizePath(location.pathname);
    return sha256Hex(canonical);
  }
  async function isAllowed() {
    const hex = await currentCanonicalHex();
    return (SETTINGS.allowedHashes || []).includes(hex);
  }
  async function trustCurrent() {
    const hex = await currentCanonicalHex();
    if (!(SETTINGS.allowedHashes || []).includes(hex)) {
      SETTINGS.allowedHashes = [...(SETTINGS.allowedHashes || []), hex];
      saveSettings(SETTINGS);
      alert("Trusted current URL.");
    } else alert("Already trusted.");
  }
  function clearTrusted() {
    SETTINGS.allowedHashes = [];
    saveSettings(SETTINGS);
    alert("Trusted list cleared.");
  }

  // ===== UI: gear + panel =====
  GM_addStyle(`
    .cf-gear{position:fixed;z-index:2147483000;width:${SETTINGS.ui.size}px;height:${SETTINGS.ui.size}px;border-radius:50%;
      background:#111;color:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 10px rgba(0,0,0,.3);
      cursor:pointer;opacity:.85}
    .cf-gear:hover{opacity:1}
    .cf-gear.tl{top:12px;left:12px}.cf-gear.tr{top:12px;right:12px}.cf-gear.bl{bottom:12px;left:12px}.cf-gear.br{bottom:12px;right:12px}
    .cf-ov{position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:2147482998;display:none}
    .cf-ov.open{display:block}
    .cf-panel{position:fixed;z-index:2147482999;right:12px;bottom:12px;width:min(560px,92vw);max-height:min(80vh,720px);
      background:#1f2937;color:#e5e7eb;border-radius:12px;box-shadow:0 12px 30px rgba(0,0,0,.35);
      display:none;flex-direction:column;font:14px/1.4 ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial}
    .cf-panel.open{display:flex}
    .cf-hd{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:#111827;border-top-left-radius:12px;border-top-right-radius:12px}
    .cf-title{font-weight:700}
    .cf-close{background:transparent;border:0;color:#e5e7eb;font-size:18px;cursor:pointer;line-height:1}
    .cf-bd{padding:12px;overflow:auto}
    .cf-row{display:grid;grid-template-columns:260px 1fr;gap:10px;align-items:center;margin:8px 0}
    .cf-row input[type="checkbox"]{transform:scale(1.15)}
    .cf-actions{display:flex;gap:8px;justify-content:flex-end;padding:12px;border-top:1px solid #374151}
    .cf-btn{padding:6px 10px;border-radius:8px;border:1px solid #4b5563;background:#374151;color:#fff;cursor:pointer}
    .cf-btn.primary{background:#2563eb;border-color:#1d4ed8}
    .cf-help{opacity:.8;font-size:12px}
    .cf-row .stack{display:flex;gap:8px;align-items:center}
  `);

  const gear = document.createElement("div");
  gear.className = `cf-gear ${SETTINGS.ui.corner}`;
  gear.title = "chudyyFix — settings";
  gear.textContent = "⚙️";
  document.body.appendChild(gear);

  const overlay = document.createElement("div");
  overlay.className = "cf-ov";
  document.body.appendChild(overlay);

  const panel = document.createElement("div");
  panel.className = "cf-panel";
  panel.innerHTML = `
    <div class="cf-hd">
      <div class="cf-title">chudyyFix — Settings</div>
      <button class="cf-close" aria-label="Close">✖</button>
    </div>
    <div class="cf-bd">
      <div class="cf-row">
        <label for="cf-soe">Search on Enter (when modal not active)</label>
        <input type="checkbox" id="cf-soe">
      </div>

      <div class="cf-row">
        <label for="cf-mr">Mark reviewed documents</label>
        <input type="checkbox" id="cf-mr">
      </div>

      <hr style="border:0;border-top:1px solid #374151;opacity:.6;margin:12px 0">

      <div class="cf-row">
        <label for="cf-dv-on">Reduce zoom in document viewer</label>
        <div class="stack">
          <input type="checkbox" id="cf-dv-on">
        </div>
      </div>
      <div class="cf-row">
        <label for="cf-dv-scale">Zoom scale (%)</label>
        <select id="cf-dv-scale">${
          Array.from({length:10},(_,i)=> (i+1)*10)
            .map(v=>`<option value="${v}">${v}%</option>`).join("")
        }</select>
      </div>
    </div>
    <div class="cf-actions">
      <button class="cf-btn" id="cf-cancel">Cancel</button>
      <button class="cf-btn primary" id="cf-save">Save</button>
    </div>
  `;
  document.body.appendChild(panel);

  function openPanel() {
    panel.querySelector("#cf-soe").checked = !!SETTINGS.modules.searchOnEnter;
    panel.querySelector("#cf-mr").checked  = !!SETTINGS.modules.markReviewed;
    panel.querySelector("#cf-dv-on").checked = !!SETTINGS.modules.dvMergedZoom;
    panel.querySelector("#cf-dv-scale").value = String(
      Math.min(100, Math.max(10, parseInt(SETTINGS.modules.dvMergedZoomPercent||40,10)))
    );
    panel.classList.add("open");
    overlay.classList.add("open");
  }
  function closePanel() {
    panel.classList.remove("open");
    overlay.classList.remove("open");
  }

  gear.addEventListener("click", () => panel.classList.contains("open") ? closePanel() : openPanel());
  panel.querySelector(".cf-close").addEventListener("click", closePanel);
  panel.querySelector("#cf-cancel").addEventListener("click", closePanel);
  overlay.addEventListener("click", closePanel);
  window.addEventListener("keydown", (e) => { if (e.key === "Escape") closePanel(); });

  panel.querySelector("#cf-save").addEventListener("click", () => {
    SETTINGS.modules.searchOnEnter = panel.querySelector("#cf-soe").checked;
    SETTINGS.modules.markReviewed  = panel.querySelector("#cf-mr").checked;
    SETTINGS.modules.dvMergedZoom  = panel.querySelector("#cf-dv-on").checked;
    SETTINGS.modules.dvMergedZoomPercent = parseInt(panel.querySelector("#cf-dv-scale").value,10) || 40;
    saveSettings(SETTINGS);
    closePanel();
    alert("Settings saved.");
  });

  gear.classList.remove("tl","tr","bl","br");
  gear.classList.add(SETTINGS.ui.corner);

  // ===== TM menu =====
  if (typeof GM_registerMenuCommand === "function") {
    GM_registerMenuCommand("Open settings (⚙️)", () => panel.classList.contains("open") ? closePanel() : openPanel());
    GM_registerMenuCommand("Export settings JSON", () => {
      navigator.clipboard?.writeText(JSON.stringify(SETTINGS, null, 2));
      alert("Settings copied.");
    });
    GM_registerMenuCommand("Reset to defaults", () => {
      SETTINGS = structuredClone(DEFAULTS);
      saveSettings(SETTINGS);
      alert("Defaults restored.");
    });
    GM_registerMenuCommand("Guard: trust current URL", trustCurrent);
    GM_registerMenuCommand("Guard: clear trusted", clearTrusted);
    GM_registerMenuCommand("Reset reviewed marks", () => {
      try { localStorage.removeItem("tm_viewed_docs_v1"); } catch {}
      alert("Reviewed marks cleared.");
    });
  }

  // ===== Feature: Document Viewer merged zoom (your module, gated) =====
  function cfInitDvMergedZoomOverlay() {
    if (window.__cfDvMergedZoomBooted) return;
    window.__cfDvMergedZoomBooted = true;

    // ---- your original module (wrapped) ----
    (function () {
      // NOTE: comments without diacritics by request
      const VIEWER_SEL    = ".document-viewer";
      const IMG_SEL       = "#documentImage";
      const OVERLAY_SELS  = [
        ".overlay", ".bbox", ".highlight", ".annotation",
        "canvas.overlay", "[data-overlay]", ".ocr-box", ".ocr-line"
      ];
      const STORAGE       = sessionStorage;
      const SESSION_KEY   = "docViewerScale";
      const DEFAULT_SCALE = 0.4;
      const TOP_NUDGES    = 8;

      function readScale() {
        const raw = STORAGE.getItem(SESSION_KEY);
        const v = parseFloat(raw);
        if (!isFinite(v) || v < 0.1 || v > 4.0) return DEFAULT_SCALE;
        return v;
      }
      let scale = readScale();

      let lastRaw = STORAGE.getItem(SESSION_KEY);
      setInterval(() => {
        const nowRaw = STORAGE.getItem(SESSION_KEY);
        if (nowRaw !== lastRaw) {
          lastRaw = nowRaw;
          scale = readScale();
          applyZoom();
        }
      }, 300);

      (function injectAlignmentCSS() {
        if (document.getElementById("chudyfix-dv-align-style")) return;
        const style = document.createElement("style");
        style.id = "chudyfix-dv-align-style";
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
            pointerEvents: "none"
          });
          sizer.appendChild(layer);
        }
        return { sizer, layer };
      }

      function collectIntoLayer(viewer, layer) {
        const img = viewer.querySelector(IMG_SEL);
        if (!img) return null;

        // normalize image
        img.style.setProperty("max-width", "none", "important");
        img.style.setProperty("max-height", "none", "important");
        img.style.setProperty("object-fit", "unset", "important");
        img.style.setProperty("display", "block", "important");
        img.style.setProperty("margin", "0", "important");
        img.style.setProperty("transform", "none", "important");
        img.style.setProperty("position", "relative", "important");
        img.style.setProperty("pointer-events", "auto", "important");

        if (img.parentElement !== layer) layer.appendChild(img);

        const cand = [];
        OVERLAY_SELS.forEach(sel => viewer.querySelectorAll(sel).forEach(el => cand.push(el)));
        const uniq = Array.from(new Set(cand)).filter(el => el instanceof Element);

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

      function nudgeTop(viewer) {
        let tries = TOP_NUDGES;
        const tick = () => {
          viewer.scrollTop = 0;
          viewer.scrollLeft = 0;
          if (--tries > 0) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }

      function applyZoom() {
        const viewer = document.querySelector(VIEWER_SEL);
        if (!viewer) return;

        const nodes = ensureLayer(viewer);
        if (!nodes) return;
        const { sizer, layer } = nodes;

        const img = layer.querySelector(IMG_SEL);
        if (!img || !img.naturalWidth || !img.naturalHeight) return;

        const w = img.naturalWidth, h = img.naturalHeight;

        layer.style.width  = w + "px";
        layer.style.height = h + "px";

        sizer.style.width  = Math.max(1, Math.round(w * scale)) + "px";
        sizer.style.height = Math.max(1, Math.round(h * scale)) + "px";

        layer.style.transform = `scale(${scale})`;
        nudgeTop(viewer);
      }

      function init() {
        if (STORAGE.getItem(SESSION_KEY) == null) {
          STORAGE.setItem(SESSION_KEY, String(DEFAULT_SCALE));
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

        const mo = new MutationObserver(() => {
          const v = document.querySelector(VIEWER_SEL);
          if (!v) return;
          const nodes = ensureLayer(v);
          if (!nodes) return;
          collectIntoLayer(v, nodes.layer);
          applyZoom();
        });
        mo.observe(document.querySelector(VIEWER_SEL) || document.body, { childList: true, subtree: true, attributes: true });

        boot();

        window.addEventListener("resize", () => { applyZoom(); });
      }

      init();
    })();
    // ---- end of your module ----
  }

  // ===== Run only on allowed pages =====
  (async () => {
    if (!(await isAllowed())) {
      console.info("[chudyyFix] URL not allowed. Use TM menu: Guard: trust current URL.");
      return;
    }

    // === Search on Enter (unchanged) ===
    if (SETTINGS.modules.searchOnEnter) {
      document.addEventListener("keydown", function (e) {
        if (e.key !== "Enter") return;
        const modal = document.querySelector("#documentModal");
        const modalActive = !!(modal && modal.classList.contains("active"));
        if (!modalActive) {
          e.preventDefault();
          if (typeof window.search === "function") { window.search(); return; }
          const btn = document.querySelector('button[onclick="search()"]');
          if (btn) btn.click();
        }
      }, true);
    }

    // === Mark reviewed documents (unchanged) ===
    if (SETTINGS.modules.markReviewed) {
      const COLOR_RGB = [128,128,128], BADGE_ALPHA = 0.85, OUTLINE_PX = 2, IMG_OPACITY = 0.95, IMG_SATURATE = 0.9, BADGE_TEXT = "✓ viewed";
      const css = `
        .document-card { position: relative; }
        .document-card.tm-reviewed { outline: ${OUTLINE_PX}px solid rgb(${COLOR_RGB.join(",")}); border-radius: 8px; }
        .document-card.tm-reviewed .document-preview img { opacity: ${IMG_OPACITY}; filter: saturate(${IMG_SATURATE}); }
        .document-card .tm-reviewed-badge { position: absolute; top: 6px; left: 6px; font: 700 12px/1 ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;
          background: rgba(${COLOR_RGB.join(",")}, ${BADGE_ALPHA}); color: #fff; padding: 2px 6px; border-radius: 9999px; box-shadow: 0 1px 2px rgba(0,0,0,.15); z-index: 100; pointer-events: none; }
      `;
      GM_addStyle(css);

      const STORAGE_KEY = "tm_viewed_docs_v1";
      const loadSet = () => { try { return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY)||"[]")); } catch { return new Set(); } };
      const saveSet = (s) => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify([...s])); } catch {} };
      let viewed = loadSet();

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
              badge.textContent = BADGE_TEXT;
            }
          }
        } else {
          card.classList.remove("tm-reviewed");
          card.querySelector(".tm-reviewed-badge")?.remove();
        }
      }
      function syncAll(root=document) {
        root.querySelectorAll(".document-card").forEach(card => {
          const id = getDocIdFromCard(card);
          applyMark(card, id && viewed.has(id));
        });
      }
      function markCard(card) {
        const id = getDocIdFromCard(card);
        if (!id) return;
        if (!viewed.has(id)) {
          viewed.add(id);
          saveSet(viewed);
        }
        applyMark(card, true);
      }
      document.addEventListener("click", (ev) => {
        const preview = ev.target.closest(".document-card .document-preview");
        if (!preview) return;
        const card = preview.closest(".document-card");
        if (!card) return;
        markCard(card);
      }, { capture: true });
      const mo = new MutationObserver(muts => {
        for (const m of muts) for (const n of m.addedNodes) {
          if (!(n instanceof HTMLElement)) continue;
          if (n.matches?.(".document-card")) syncAll(n);
          else n.querySelectorAll?.(".document-card").forEach(c => syncAll(c));
        }
      });
      mo.observe(document.body, { childList: true, subtree: true });
      syncAll();
    }

    // === Document Viewer merged zoom (new, gated by hashed allowlist) ===
    if (SETTINGS.modules.dvMergedZoom) {
      const pct = Math.min(100, Math.max(10, parseInt(SETTINGS.modules.dvMergedZoomPercent||40,10)));
      try { sessionStorage.setItem("docViewerScale", String(pct/100)); } catch {}
      if (!window.__cfDvMergedZoomBooted) {
        cfInitDvMergedZoomOverlay();
      }
    }
  })();
})();
