// ==UserScript==
// @name         chudyyFix — all-in-one
// @namespace    chudyFix
// @version      0.5.3
// @description  Panel/options, shortcuts, styles. Includes: Search-on-Enter, Mark reviewed, Document Viewer merged-zoom, NEW modal layout (side cols + topbar + scroll lock). Also adds: inverted 'old layout' checkbox semantics, Thumb max height (px), Hide labels under thumbnails, links
// @match        *://*/*
// @run-at       document-idle
// @grant        GM_addStyle
// @grant        GM_registerMenuCommand
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @grant        GM_setClipboard
// @updateURL    https://raw.githubusercontent.com/senecjusz/chudyyFix/main/userscripts/allfixes.js.user.js
// @downloadURL  https://raw.githubusercontent.com/senecjusz/chudyyFix/main/userscripts/allfixes.js.user.js
// ==/UserScript==

(function () {
  "use strict";
  // NOTE: do not use Polish characters in comments

  // ===== SETTINGS (cookie with LS fallback) =====
  const DEFAULTS = {
    ver: 6,
    ui: { corner: "br", size: 36 },
    modules: {
      searchOnEnter: true,
      markReviewed: true,

      // merged zoom overlay
      dvMergedZoom: true,
      dvMergedZoomPercent: 40, // 10..100

      // legacy flag used for gating (storage keeps "old layout" flag)
      // UI checkbox is inverted: checked => NEW layout ON (we store dvOldLayout = false)
      dvOldLayout: false,

      // new options from patch
      dvThumbMaxHeightPx: 150,  // px
      dvHideThumbLabels:  true  // hide labels under thumbnails
    },
    // allowlist hashes (URL guard)
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
      // fallback djb2
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

  // ===== GLOBAL CSS for patch options =====
  function applyThumbMaxHeight(px) {
    const v = Math.max(40, Math.min(400, parseInt(px, 10) || 150)) + "px";
    document.documentElement.style.setProperty("--mt-thumb-maxh", v);
  }
  function applyHideThumbLabels(on) {
    document.documentElement.classList.toggle("cf-hide-thumb-labels", !!on);
  }

  GM_addStyle(`
    /* limit thumbnail height via CSS var */
    #documentModal .mt-thumb img{
      max-height: var(--mt-thumb-maxh, 150px) !important;
      max-width: 100% !important;
      width: auto !important;
      height: auto !important;
      object-fit: contain !important;
      display: block !important;
    }
    /* optional: hide text labels under thumbnails */
    .cf-hide-thumb-labels #documentModal .mt-thumb { gap: 0 !important; }
    .cf-hide-thumb-labels #documentModal .mt-thumb .lbl { display: none !important; }
  `);

  // initial apply
  applyThumbMaxHeight(SETTINGS.modules.dvThumbMaxHeightPx);
  applyHideThumbLabels(SETTINGS.modules.dvHideThumbLabels);

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
    .cf-btn.subtle{background:#334155;border-color:#475569}
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

      <div class="cf-row">
        <label for="cf-dv-old">Document viewer old layout</label>
        <input type="checkbox" id="cf-dv-old">
      </div>

      <div class="cf-row">
        <label for="cf-thumbmaxh">Thumb max height (px)</label>
        <div class="stack">
          <input type="number" id="cf-thumbmaxh" min="40" max="400" step="10" style="width:120px">
        </div>
      </div>

      <div class="cf-row">
        <label for="cf-dv-hide-labels">Hide file names under thumbnails</label>
        <input type="checkbox" id="cf-dv-hide-labels">
      </div>
    </div>
    <div class="cf-actions">
      <button class="cf-btn subtle" id="cf-export">Export JSON</button>
      <button class="cf-btn subtle" id="cf-import">Import JSON</button>
      <span style="flex:1"></span>
      <button class="cf-btn" id="cf-cancel">Cancel</button>
      <button class="cf-btn primary" id="cf-save">Save</button>
    </div>
  `;
  document.body.appendChild(panel);

  function refreshPanelFromSettings() {
    panel.querySelector("#cf-soe").checked     = !!SETTINGS.modules.searchOnEnter;
    panel.querySelector("#cf-mr").checked      = !!SETTINGS.modules.markReviewed;
    panel.querySelector("#cf-dv-on").checked   = !!SETTINGS.modules.dvMergedZoom;
    panel.querySelector("#cf-dv-scale").value  = String(
      Math.min(100, Math.max(10, parseInt(SETTINGS.modules.dvMergedZoomPercent||40,10)))
    );

    // inverted UI semantics: checked => NEW layout ON
    panel.querySelector("#cf-dv-old").checked = !SETTINGS.modules.dvOldLayout;

    panel.querySelector("#cf-thumbmaxh").value = String(SETTINGS.modules.dvThumbMaxHeightPx ?? 150);
    panel.querySelector("#cf-dv-hide-labels").checked = !!SETTINGS.modules.dvHideThumbLabels;
  }

  function openPanel() {
    refreshPanelFromSettings();
    panel.classList.add("open");
    overlay.classList.add("open");
    gear.style.display = "none";
  }
  function closePanel() {
    panel.classList.remove("open");
    overlay.classList.remove("open");
    gear.style.display = "";
  }

  gear.addEventListener("click", () => panel.classList.contains("open") ? closePanel() : openPanel());
  panel.querySelector(".cf-close").addEventListener("click", closePanel);
  panel.querySelector("#cf-cancel").addEventListener("click", closePanel);
  overlay.addEventListener("click", closePanel);
  window.addEventListener("keydown", (e) => { if (e.key === "Escape") closePanel(); });

  // Export / Import
  panel.querySelector("#cf-export").addEventListener("click", async () => {
    const pretty = JSON.stringify(SETTINGS, null, 2);
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(pretty);
      else { prompt("Copy settings JSON:", pretty); }
      refreshPanelFromSettings();
      alert("Settings JSON copied to clipboard.");
    } catch {
      prompt("Copy settings JSON:", pretty);
      refreshPanelFromSettings();
    }
  });

  panel.querySelector("#cf-import").addEventListener("click", () => {
    const txt = prompt("Paste settings JSON:");
    if (!txt) return;
    try {
      const parsed = JSON.parse(txt);
      SETTINGS = merge(DEFAULTS, parsed);
      saveSettings(SETTINGS);
      applyThumbMaxHeight(SETTINGS.modules.dvThumbMaxHeightPx);
      applyHideThumbLabels(SETTINGS.modules.dvHideThumbLabels);
      refreshPanelFromSettings();
      alert("Settings imported. Some features may require page reload.");
    } catch {
      alert("Invalid JSON. Import aborted.");
    }
  });

  panel.querySelector("#cf-save").addEventListener("click", () => {
    SETTINGS.modules.searchOnEnter       = panel.querySelector("#cf-soe").checked;
    SETTINGS.modules.markReviewed        = panel.querySelector("#cf-mr").checked;
    SETTINGS.modules.dvMergedZoom        = panel.querySelector("#cf-dv-on").checked;
    SETTINGS.modules.dvMergedZoomPercent = parseInt(panel.querySelector("#cf-dv-scale").value,10) || 40;

    // inverted semantics for storage:
    const uiNewOn = panel.querySelector("#cf-dv-old").checked; // CHECKED = new layout ON
    SETTINGS.modules.dvOldLayout = !uiNewOn; // store old layout flag

    const thumbH = Math.max(40, Math.min(400, parseInt(panel.querySelector("#cf-thumbmaxh").value || "150", 10) || 150));
    SETTINGS.modules.dvThumbMaxHeightPx = thumbH;

    const hideLbl = panel.querySelector("#cf-dv-hide-labels").checked;
    SETTINGS.modules.dvHideThumbLabels = hideLbl;

    saveSettings(SETTINGS);

    // live apply
    applyThumbMaxHeight(thumbH);
    applyHideThumbLabels(hideLbl);

    closePanel();
    alert("Settings saved. Some changes may require page reload.");
  });

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
      applyThumbMaxHeight(SETTINGS.modules.dvThumbMaxHeightPx);
      applyHideThumbLabels(SETTINGS.modules.dvHideThumbLabels);
      alert("Defaults restored.");
    });
    GM_registerMenuCommand("Guard: trust current URL", trustCurrent);
    GM_registerMenuCommand("Guard: clear trusted", clearTrusted);
    GM_registerMenuCommand("Reset reviewed marks", () => {
      try { localStorage.removeItem("tm_viewed_docs_v1"); } catch {}
      alert("Reviewed marks cleared.");
    });
  }

  // ===== Feature: Search on Enter =====
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

  // ===== Feature: Mark reviewed documents =====
  if (SETTINGS.modules.markReviewed) {
    const COLOR_RGB = [128,128,128], BADGE_ALPHA = 0.85, OUTLINE_PX = 2, IMG_OPACITY = 0.95, IMG_SATURATE = 0.9, BADGE_TEXT = "✓ viewed";
    GM_addStyle(`
      .document-card { position: relative; }
      .document-card.tm-reviewed { outline: ${OUTLINE_PX}px solid rgb(${COLOR_RGB.join(",")}); border-radius: 8px; }
      .document-card.tm-reviewed .document-preview img { opacity: ${IMG_OPACITY}; filter: saturate(${IMG_SATURATE}); }
      .document-card .tm-reviewed-badge { position: absolute; top: 6px; left: 6px; font: 700 12px/1 ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;
        background: rgba(${COLOR_RGB.join(",")}, ${BADGE_ALPHA}); color: #fff; padding: 2px 6px; border-radius: 9999px; box-shadow: 0 1px 2px rgba(0,0,0,.15); z-index: 100; pointer-events: none; }
    `);

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

  // ===== Feature: Document Viewer merged zoom overlay =====
  function cfInitDvMergedZoomOverlay() {
    if (window.__cfDvMergedZoomBooted) return;
    window.__cfDvMergedZoomBooted = true;

    // NOTE: comments without diacritics
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
    let scale = (function(){ const r=STORAGE.getItem(SESSION_KEY); const v=parseFloat(r); return isFinite(v)?v:DEFAULT_SCALE; })();

    let lastRaw = STORAGE.getItem(SESSION_KEY);
    setInterval(() => {
      const nowRaw = STORAGE.getItem(SESSION_KEY);
      if (nowRaw !== lastRaw) {
        lastRaw = nowRaw;
        const v = parseFloat(nowRaw);
        if (isFinite(v)) { scale = v; applyZoom(); }
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

      const s = readScale();
      sizer.style.width  = Math.max(1, Math.round(w * s)) + "px";
      sizer.style.height = Math.max(1, Math.round(h * s)) + "px";

      layer.style.transform = `scale(${s})`;
      nudgeTop(viewer);
    }

    function init() {
      if (sessionStorage.getItem("docViewerScale") == null) {
        sessionStorage.setItem("docViewerScale", String(DEFAULT_SCALE));
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
  }

  // ===== Feature: NEW Document Modal Layout (side columns + topbar + scroll lock) =====
  function cfInitDocumentModalLayout() {
    if (window.__cfDocModalLayoutBooted) return;
    window.__cfDocModalLayoutBooted = true;

    const SEL = {
      modal:   "#documentModal",
      content: "#documentModal .modal-content",
      header:  "#documentModal .modal-header",
      body:    "#documentModal .modal-body",
      viewer:  "#documentModal .modal-body .document-viewer",
      arrows:  "#documentModal .modal-body .nav-arrow",
      left:    "#documentModal .modal-body .nav-arrow.nav-arrow-left",
      right:   "#documentModal .modal-body .nav-arrow.nav-arrow-right",
      navWrap: "#documentModal .navigation-thumbnails",
      navLinks:"#documentModal #navLinks",
      pathSpan:"#documentModal #documentPath",
      navCache:"#documentModal .mt-nav-cache"
    };

    GM_addStyle(`
      :root { --mt-col-w: 180px; }

      #documentModal, #documentModal .modal-content, #documentModal .modal-body, #documentModal .document-viewer{
        overscroll-behavior: contain !important;
      }

      html.mt-scroll-locked, body.mt-scroll-locked{
        overflow: hidden !important;
      }

      #documentModal .modal-content{
        display:flex !important;
        flex-direction:column !important;
        height:96vh !important; max-height:96vh !important;
      }
      #documentModal .modal-header{ display:none !important; }

      #documentModal .modal-body{
        position:relative !important;
        display:grid !important;
        grid-template-columns: var(--mt-col-w) 1fr var(--mt-col-w) !important;
        grid-template-rows: 1fr !important;
        gap: 8px !important;
        min-height:0 !important;
        overflow:hidden !important;
      }
      #documentModal .modal-body .document-viewer{
        grid-column: 2 / 3 !important;
        grid-row: 1 / 2 !important;
        height:100% !important; width:100% !important;
        overflow:auto !important; text-align:left !important;
        position:relative !important;
      }

      #documentModal .modal-body .nav-arrow{
        position:absolute !important; top:50% !important; transform:translateY(-50%) !important; z-index:1000 !important;
      }
      #documentModal .modal-body .nav-arrow.nav-arrow-left{ left: calc(var(--mt-col-w) + 10px) !important; }
      #documentModal .modal-body .nav-arrow.nav-arrow-right{ right: calc(var(--mt-col-w) + 10px) !important; }

      #documentModal .mt-col{
        grid-row: 1 / 2 !important;
        overflow:auto !important;
        padding: 6px 4px !important;
        display:flex !important;
        flex-direction:column !important;
        gap:6px !important;
        min-width: 0 !important;
      }
      #documentModal .mt-col-left{ grid-column: 1 / 2 !important; }
      #documentModal .mt-col-right{ grid-column: 3 / 4 !important; }

      #documentModal .mt-thumb{
        display:flex; flex-direction:column; align-items:center; gap:4px;
        border:0; background:transparent; cursor:pointer;
        padding:4px; border-radius:6px;
      }
      #documentModal .mt-thumb:hover{ background: rgba(255,255,255,.08); }
      #documentModal .mt-thumb img{
        width: auto; height: auto; display:block; border-radius:4px;
        object-fit:contain; max-width:100%;
      }
      #documentModal .mt-thumb .lbl{
        font: 11px/1.1 ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;
        color:#e5e7eb; opacity:.95; text-align:center; max-width:100%;
        white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
      }

      #documentModal .document-viewer .mt-topbar{
        position:absolute !important;
        top:10px !important; left:10px !important; right:10px !important;
        display:flex !important; align-items:center !important; gap:8px !important;
        justify-content:space-between !important;
        z-index:1050 !important;
        pointer-events:none !important;
      }
      #documentModal .document-viewer .mt-chip{
        background:rgba(0,0,0,.5);
        color:#fff;
        border-radius:8px;
        padding:4px 8px;
        font:500 12px/1.1 ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;
        white-space:nowrap;
      }
      #documentModal .document-viewer .mt-path{
        flex:1 1 auto !important; min-width:0 !important; overflow:hidden !important;
      }
      #documentModal .document-viewer .mt-close{
        pointer-events:auto !important;
        flex:0 0 auto !important;
        margin-left:8px !important;
        border:0; cursor:pointer;
        display:flex; align-items:center; gap:6px;
        background:linear-gradient(135deg, #ef4444, #f97316);
        box-shadow:0 2px 8px rgba(0,0,0,.25);
      }
      #documentModal .document-viewer .mt-close:hover{ filter:brightness(1.05); }
      #documentModal .document-viewer .mt-close .x{ font-weight:700; }

      #documentModal .navigation-thumbnails{
        display:none !important;
        height:0 !important;
        padding:0 !important;
        margin:0 !important;
        border:0 !important;
      }

      #documentModal .mt-nav-cache{ display:none !important; }
    `);

    const qs  = (sel, root=document) => root.querySelector(sel);
    const isActive = (modal) => modal && modal.classList.contains("active");

    const PageScroll = {
      locked: false,
      lock(){
        if (this.locked) return;
        document.documentElement.classList.add("mt-scroll-locked");
        document.body.classList.add("mt-scroll-locked");
        this.locked = true;
      },
      unlock(){
        if (!this.locked) return;
        document.documentElement.classList.remove("mt-scroll-locked");
        document.body.classList.remove("mt-scroll-locked");
        this.locked = false;
      }
    };

    function installGlobalGuards(modal){
      const guardWheel = (ev) => {
        if (!isActive(modal)) return;
        if (!modal.contains(ev.target)) {
          ev.preventDefault(); ev.stopPropagation();
        }
      };
      const guardTouch = guardWheel;
      const guardKeys = (ev) => {
        if (!isActive(modal)) return;
        const keys = ["PageUp","PageDown","Home","End","ArrowUp","ArrowDown","ArrowLeft","ArrowRight"," "];
        if (keys.includes(ev.key) && !modal.contains(ev.target)) {
          ev.preventDefault(); ev.stopPropagation();
        }
      };
      document.addEventListener("wheel", guardWheel, { passive:false, capture:true });
      document.addEventListener("touchmove", guardTouch, { passive:false, capture:true });
      document.addEventListener("keydown", guardKeys, { passive:false, capture:true });
      modal.__mtGuards = { guardWheel, guardTouch, guardKeys };
    }

    function getNavLinks(modal){
      return qs(SEL.navLinks, modal) || qs("#navLinks", qs(SEL.navCache, modal) || document);
    }
    function ensureColumns(modal){
      const body   = qs(SEL.body, modal);
      const viewer = qs(SEL.viewer, modal);
      if (!body || !viewer) return;

      let colL = qs(".mt-col.mt-col-left", body);
      let colR = qs(".mt-col.mt-col-right", body);
      if (!colL){ colL = document.createElement("div"); colL.className = "mt-col mt-col-left"; body.appendChild(colL); }
      if (!colR){ colR = document.createElement("div"); colR.className = "mt-col mt-col-right"; body.appendChild(colR); }

      const navLinks = getNavLinks(modal);
      if (!navLinks) return;

      function collect(){
        const all = Array.from(navLinks.querySelectorAll(".nav-thumbnail"));
        const cur = navLinks.querySelector(".nav-thumbnail.current");
        const idx = cur ? all.indexOf(cur) : -1;
        return { all, cur, idx };
      }
      function mkThumb(origEl){
        const imgSrc = origEl.querySelector("img")?.getAttribute("src") || "";
        const lblTxt = origEl.querySelector(".nav-thumbnail-label")?.textContent?.trim() || "";
        const btn = document.createElement("button");
        btn.className = "mt-thumb";
        btn.title = lblTxt || "thumbnail";
        btn.innerHTML = `
          <img loading="lazy" decoding="async" referrerpolicy="no-referrer" src="${imgSrc}">
          <div class="lbl">${lblTxt}</div>
        `;
        btn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          origEl.click();
        }, { passive:false });
        return btn;
      }
      function render(){
        const { all, idx } = collect();
        if (!all.length) return;

        const leftArr  = idx > 0 ? all.slice(0, idx).reverse() : [];
        const rightArr = idx >= 0 ? all.slice(idx + 1) : all;

        colL.textContent = "";
        colR.textContent = "";

        const fl = document.createDocumentFragment();
        const fr = document.createDocumentFragment();

        for (const el of leftArr)  fl.appendChild(mkThumb(el));
        for (const el of rightArr) fr.appendChild(mkThumb(el));

        colL.appendChild(fl);
        colR.appendChild(fr);
      }
      render();

      if (!navLinks.__mtObserver){
        const obs = new MutationObserver(() => {
          if (navLinks.__mtSched) return;
          navLinks.__mtSched = true;
          Promise.resolve().then(() => { navLinks.__mtSched = false; render(); });
        });
        obs.observe(navLinks, { subtree:true, attributes:true, attributeFilter:["class"], childList:true });
        navLinks.__mtObserver = obs;
      }
    }

    function measFactory(){
      const cvs = document.createElement("canvas");
      const ctx = cvs.getContext?.("2d");
      let lastFont = "";
      return {
        width(text, font) {
          if (!ctx) return text.length * 8;
          if (font && font !== lastFont) { ctx.font = font; lastFont = font; }
          return ctx.measureText(text).width;
        }
      };
    }
    const meas = measFactory();
    function trimPathStart(full, chipEl) {
      if (!full) return "";
      const cs = getComputedStyle(chipEl);
      const font = cs.font || `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      const padL = parseFloat(cs.paddingLeft) || 0;
      const padR = parseFloat(cs.paddingRight) || 0;
      const total = chipEl.clientWidth || chipEl.offsetWidth || 0;
      const avail = Math.max(0, total - padL - padR);
      if (avail <= 0) return full;
      const prefix = "(...)";
      const wFull = meas.width(full, font);
      if (wFull <= avail) return full;
      const wPref = meas.width(prefix, font);
      if (wPref >= avail) return prefix;
      let lo = 0, hi = full.length;
      while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        const candidate = prefix + full.slice(-mid);
        if (meas.width(candidate, font) <= avail) lo = mid; else hi = mid - 1;
      }
      return prefix + full.slice(-lo);
    }
    function ensureTopbar(modal){
      const viewer = document.querySelector("#documentModal .modal-body .document-viewer");
      if (!viewer) return;
      if (getComputedStyle(viewer).position === "static"){
        viewer.style.position = "relative";
      }
      let top = viewer.querySelector(".mt-topbar");
      if (!top){
        top = document.createElement("div");
        top.className = "mt-topbar";
        viewer.appendChild(top);
      }
      let pathChip = top.querySelector(".mt-path");
      if (!pathChip){
        pathChip = document.createElement("div");
        pathChip.className = "mt-chip mt-path";
        top.appendChild(pathChip);
      }
      let closeBtn = top.querySelector(".mt-close");
      if (!closeBtn){
        closeBtn = document.createElement("button");
        closeBtn.className = "mt-chip mt-close";
        closeBtn.innerHTML = `<span class="x">×</span><span>Close</span>`;
        closeBtn.addEventListener("click", () => {
          const modalEl = document.querySelector("#documentModal");
          try { if (typeof window.closeModal === "function") return window.closeModal(); } catch {}
          modalEl?.classList.remove("active");
        });
        top.appendChild(closeBtn);
      } else {
        if (closeBtn !== top.lastElementChild) top.appendChild(closeBtn);
      }
      const applyPath = () => {
        const full = document.querySelector("#documentModal #documentPath")?.textContent?.trim() || "";
        pathChip.title = full || "";
        const shown = trimPathStart(full, pathChip);
        if (pathChip.textContent !== shown) pathChip.textContent = shown;
      };
      applyPath();
      requestAnimationFrame(applyPath);
      const z = "1000";
      document.querySelector("#documentModal .modal-body .nav-arrow.nav-arrow-left")?.style.setProperty("z-index", z, "important");
      document.querySelector("#documentModal .modal-body .nav-arrow.nav-arrow-right")?.style.setProperty("z-index", z, "important");
      if (!modal.__mtPathObserver){
        const pathSpan = document.querySelector("#documentModal #documentPath");
        if (pathSpan){
          const mo = new MutationObserver(applyPath);
          mo.observe(pathSpan, { childList:true, subtree:true, characterData:true });
          modal.__mtPathObserver = mo;
        }
        window.addEventListener("resize", applyPath, { passive:true });
      }
    }

    function hideNav(modal){
      const navWrap = document.querySelector("#documentModal .navigation-thumbnails");
      if (!navWrap) return;
      navWrap.setAttribute("aria-hidden", "true");
      navWrap.style.setProperty("display", "none", "important");
      navWrap.style.setProperty("height", "0", "important");
      navWrap.style.setProperty("padding", "0", "important");
      navWrap.style.setProperty("margin", "0", "important");
      navWrap.style.setProperty("border", "0", "important");
    }

    function hookModal(modal){
      if (!modal || modal.__mtHooked) return;
      modal.__mtHooked = true;

      installGlobalGuards(modal);

      const onChange = () => {
        if (modal.classList.contains("active")) {
          PageScroll.lock();
          hideNav(modal);
          ensureColumns(modal);
          ensureTopbar(modal);
        } else {
          PageScroll.unlock();
        }
      };

      const obs = new MutationObserver(onChange);
      obs.observe(modal, { attributes:true, attributeFilter:["class"] });
      onChange();
    }

    const modal0 = document.querySelector("#documentModal");
    if (modal0) {
      hookModal(modal0);
    } else {
      const mo = new MutationObserver(() => {
        const m = document.querySelector("#documentModal");
        if (m){ hookModal(m); mo.disconnect(); }
      });
      mo.observe(document.body || document.documentElement, { childList:true, subtree:true });
    }
  }

  // ===== Boot only on allowed pages =====
  (async () => {
    if (!(await isAllowed())) {
      console.info("[chudyyFix] URL not allowed. Use TM menu: Guard: trust current URL.");
      return;
    }

    // Search on Enter
    // (already installed above if enabled)

    // Document Viewer merged zoom
    if (SETTINGS.modules.dvMergedZoom) {
      const pct = Math.min(100, Math.max(10, parseInt(SETTINGS.modules.dvMergedZoomPercent||40,10)));
      try { sessionStorage.setItem("docViewerScale", String(pct/100)); } catch {}
      if (!window.__cfDvMergedZoomBooted) cfInitDvMergedZoomOverlay();
    }

    // NEW modal layout (gated by inverted UI semantics)
    // storage uses dvOldLayout=true to mean "legacy"; thus new layout runs when dvOldLayout is false
    if (!SETTINGS.modules.dvOldLayout) {
      cfInitDocumentModalLayout();
    }
  })();
})();

/* ==== cfx-links module: File Links + Links button + single Export/Import + centered dark panel ==== */
(function () {
  'use strict';
  if (window.__CFX_LINKS_INTEGRATED__) return;
  window.__CFX_LINKS_INTEGRATED__ = true;

  // ---------- CSS (contrast + larger centered panel + links UI) ----------
  GM_addStyle(`
    /* Enlarge and center main settings panel */
    .cf-panel.open {
      position: fixed !important;
      top: 50% !important; left: 50% !important; transform: translate(-50%, -50%) !important;
      width: min(1100px, 96vw) !important;
      max-height: 88vh !important;
      z-index: 2147483500 !important;
      background: #0b1220 !important;
      color: #e5e7eb !important;
      border: 1px solid #25314a !important;
      border-radius: 12px !important;
      box-shadow: 0 24px 48px rgba(0,0,0,.35) !important;
    }
    .cf-panel.open .cf-hd {
      padding: 12px 14px !important;
      border-bottom: 1px solid #25314a !important;
      background: #0e172a !important;
    }
    .cf-panel.open .cf-title { color: #e5e7eb !important; font-weight: 600 !important; }
    .cf-panel.open .cf-bd {
      padding: 14px !important;
      max-height: calc(88vh - 120px) !important;
      overflow: auto !important;
      background: transparent !important;
    }
    .cf-panel.open .cf-row label { color: #e2e8f0 !important; }
    .cf-panel.open .cf-row input[type="checkbox"],
    .cf-panel.open .cf-row input[type="number"],
    .cf-panel.open .cf-row select {
      background: #0f172a !important;
      border: 1px solid #334155 !important;
      color: #e5e7eb !important;
      border-radius: 8px !important;
      padding: 6px 8px !important;
    }
    .cf-panel.open .cf-actions {
      border-top: 1px solid #25314a !important;
      background: #0e172a !important;
      padding: 12px 14px !important;
    }
    .cf-panel.open .cf-btn {
      background: #111827 !important;
      color: #e5e7eb !important;
      border: 1px solid #334155 !important;
      border-radius: 8px !important;
    }
    .cf-panel.open .cf-btn:hover { filter: brightness(1.08) !important; }
    .cf-panel.open .cf-btn.primary {
      background: #1d4ed8 !important;
      border-color: #1d4ed8 !important;
      color: #fff !important;
    }

    /* Topbar & Links button */
    .mt-topbar { position: relative !important; z-index: 10050 !important; pointer-events: auto !important; }
    .cfx-ln-wrap { position: relative !important; display: inline-flex; gap: 8px; align-items: center; margin-right: 8px; z-index: 10060 !important; pointer-events: auto !important; }
    .cfx-ln-btn.mt-chip{
      position: relative !important; z-index: 10070 !important; pointer-events: auto !important;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
      color: #ffffff !important; border: none !important; border-radius: 8px;
      padding: 0.65rem 1.2rem; cursor: pointer !important;
      font-size: 0.95rem; font-family: inherit; font-weight: 500; letter-spacing: 0.5px;
      box-shadow: 0 4px 15px rgba(102,126,234,0.30) !important;
      transition: transform .25s ease, box-shadow .25s ease, filter .25s ease !important;
      will-change: transform; line-height: 1.2;
    }
    .cfx-ln-btn.mt-chip:hover { transform: translateY(-2px) !important; box-shadow: 0 8px 18px rgba(102,126,234,0.45) !important; filter: brightness(1.03) !important; }
    .cfx-ln-btn.mt-chip:active { transform: translateY(-1px) !important; }
    .cfx-ln-btn.mt-chip:focus { outline: none !important; box-shadow: 0 0 0 3px rgba(118,75,162,.25) !important, 0 6px 16px rgba(102,126,234,.40) !important; }

    /* Dropdown */
    .cfx-ln-portal {
      position: fixed; z-index: 2147483000;
      min-width: 260px; max-width: 80vw;
      background: #0b1220; color: #e5e7eb;
      border: 1px solid #334155; border-radius: 8px;
      box-shadow: 0 12px 28px rgba(0,0,0,0.35);
      overflow: hidden; display: none;
    }
    .cfx-ln-portal.show { display: block; }
    .cfx-ln-item { padding: 9px 12px; font-size: 13px; white-space: nowrap; cursor: pointer; transition: background-color .15s ease; }
    .cfx-ln-item:hover { background: #111827; }

    /* File Links section (high contrast) */
    #cfx-links-settings.cfx-ln-embed {
      margin: 12px 0; padding: 12px;
      border: 1px solid #334155; border-radius: 10px;
      background:#0f172a; color:#e5e7eb;
    }
    #cfx-links-settings h3 { margin: 0 0 8px 0; font-size: 15px; color:#e5e7eb; }
    #cfx-links-settings .cfx-ln-note { font-size: 12px; color: #94a3b8; margin-bottom: 8px; }
    #cfx-links-settings .cfx-ln-rows { display: grid; gap: 8px; }
    #cfx-links-settings .cfx-ln-row {
      display: grid; grid-template-columns: 1fr 1fr 140px 120px auto; gap: 6px; align-items: center;
      border-bottom: 1px solid #1f2937; padding: 8px 0;
    }
    #cfx-links-settings .cfx-ln-row input[type="text"],
    #cfx-links-settings .cfx-ln-row select {
      width: 100%; padding: 6px 8px; font-size: 13px;
      border: 1px solid #334155; border-radius: 6px;
      background:#0b1220; color:#e5e7eb;
    }
    #cfx-links-settings .cfx-ln-row label { font-size: 12px; color:#cbd5e1; }
    #cfx-links-settings .cfx-ln-actions > button {
      all: unset; padding: 6px 10px; margin-left: 6px; border: 1px solid #334155;
      background: #111827; color:#e5e7eb; border-radius: 6px; cursor: pointer; font-size: 12px;
    }
    #cfx-links-settings .cfx-ln-actions > button:hover { background: #1f2937; }
    #cfx-links-settings .cfx-ln-toolbar { display: flex; justify-content: space-between; gap: 8px; margin-top: 10px; }
    #cfx-links-settings .cfx-ln-toolbar button {
      all: unset; padding: 8px 12px; border: 1px solid #334155;
      background: #111827; color:#e5e7eb; border-radius: 6px; cursor: pointer; font-size: 13px;
    }
    #cfx-links-settings .cfx-ln-toolbar button:hover { background:#1f2937; }

    /* Single Export/Import editor */
    #cfx-exim {
      margin: 12px 0; padding: 12px; border: 1px dashed #334155;
      border-radius: 10px; background:#0b1220; color:#e5e7eb;
    }
    #cfx-exim h3 { margin: 0 0 8px 0; font-size: 15px; color:#e5e7eb; }
    #cfx-exim textarea {
      width: 100%; min-height: 260px; resize: vertical;
      border-radius: 8px; border:1px solid #334155;
      background:#0a1325; color:#e5e7eb; padding:10px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace; font-size: 12px;
    }
    #cfx-exim .bar { margin-top: 8px; display:flex; gap:8px; }
    #cfx-exim .bar button {
      all:unset; padding: 8px 12px; border:1px solid #334155; border-radius: 6px; cursor:pointer;
      background:#111827; color:#e5e7eb;
    }
    #cfx-exim .bar button:hover { background:#1f2937; }

    /* Toast */
    .cfx-toast {
      position: fixed; right: 14px; bottom: 14px; z-index: 2147483600;
      background: #111; color: #fff; padding: 10px 12px; border-radius: 8px; opacity: .96;
      box-shadow: 0 6px 20px rgba(0,0,0,.25); font-size: 13px;
    }
  `);

  // ---------- tiny utils ----------
  const $  = (sel, root = document) => (root || document).querySelector(sel);
  const $$ = (sel, root = document) => Array.from((root || document).querySelectorAll(sel));
  const on = (el, ev, fn, opts) => el && el.addEventListener(ev, fn, opts);
  const toast = (msg, ms=1800) => { const t=document.createElement('div'); t.className='cfx-toast'; t.textContent=msg; document.body.appendChild(t); setTimeout(()=>t.remove(), ms); };

  // ---------- storage ----------
  const KEY_LINKS = 'cfx.links.config';
  const GM_Get = (k,d)=>{ try{ return GM_getValue(k,d); }catch(_){ return d; } };
  const GM_Set = (k,v)=>{ try{ GM_setValue(k,v); }catch(_){ } };
  const loadLinks = () => {
    const arr = GM_Get(KEY_LINKS, []);
    return Array.isArray(arr) ? arr.map(s => ({
      prefix: typeof s.prefix === 'string' ? s.prefix : '',
      suffix: typeof s.suffix === 'string' ? s.suffix : '',
      sep: s.sep === '\\' ? '\\' : '/',
      urlEncode: !!s.urlEncode
    })) : [];
  };
  const saveLinks = (list) => GM_Set(KEY_LINKS, (list || []).map(s => ({
    prefix: typeof s.prefix === 'string' ? s.prefix : '',
    suffix: typeof s.suffix === 'string' ? s.suffix : '',
    sep: s.sep === '\\' ? '\\' : '/',
    urlEncode: !!s.urlEncode
  })));

  // ---------- data helpers ----------
  function getRelPath(topbar){
    const chip = topbar.querySelector('.mt-chip.mt-path');
    if(!chip) return null;
    const t = (chip.getAttribute('title') || chip.textContent || '').trim();
    return t || null;
  }
  function fileNameFromRelPath(rel){
    if(!rel) return null;
    const parts = rel.split('/');
    return parts[parts.length-1] || null;
  }
  function splitBaseExt(filename){
    if (!filename) return { base:'', ext:'' };
    const i = filename.lastIndexOf('.');
    if (i <= 0 || i === filename.length-1) return { base: filename, ext: '' };
    return { base: filename.slice(0,i), ext: filename.slice(i+1) };
  }
  function getImageAbsUrl(){
    const img = document.getElementById('documentImage') || $('img#documentImage') || $('img[src*="image.php?hash="]');
    if (!img) return null;
    const src = img.getAttribute('src') || img.src || '';
    try { return new URL(src, location.href).href; } catch { return src; }
  }
  function encodeSegments(path, sep) {
    return path.split(sep).map(p => (p === '' ? '' : encodeURIComponent(p))).join(sep);
  }
  function applyPlaceholders(str, ctx, doEncode){
    if (!str) return '';
    const map = { '%filename%': ctx.filename||'', '%basename%': ctx.basename||'', '%ext%': ctx.ext||'' };
    return String(str).replace(/%filename%|%basename%|%ext%/gi, (m) => {
      let v = map[m.toLowerCase()] || '';
      if (doEncode) v = encodeURIComponent(v);
      return v;
    });
  }
  function buildLink(entry, relPath) {
    if (!entry || !relPath) return null;
    const sep = entry.sep === '\\' ? '\\' : '/';
    const filename = fileNameFromRelPath(relPath) || '';
    const { base: basename, ext } = splitBaseExt(filename);

    let rp = relPath;
    if (sep === '\\') rp = rp.replace(/\//g, '\\');
    if (entry.urlEncode) rp = encodeSegments(rp, sep);

    const ctx = { filename, basename, ext, sep };
    const prefix = applyPlaceholders(entry.prefix || '', ctx, entry.urlEncode);
    const suffix = applyPlaceholders(entry.suffix || '', ctx, entry.urlEncode);

    let out = '';
    const prefixEndsWithSep = prefix.endsWith(sep);
    const rpStartsWithSep = rp.startsWith(sep);
    out = prefix ? ((prefixEndsWithSep && rpStartsWithSep) ? (prefix + rp.slice(1)) : (prefix + rp)) : rp;
    out += suffix;
    return out;
  }

  // ---------- dropdown (created once) ----------
  const portal = document.createElement('div');
  portal.className = 'cfx-ln-portal';
  document.body.appendChild(portal);
  const hidePortal = () => portal.classList.remove('show');
  on(document, 'click', (e)=>{ if(portal.classList.contains('show') && !portal.contains(e.target)) hidePortal(); }, true);
  on(document, 'keydown', (e)=>{ if(e.key==='Escape') hidePortal(); }, true);

  function openMenuAt(btn, topbar){
    const rel = getRelPath(topbar);
    const fileName = fileNameFromRelPath(rel);
    const imgAbs = getImageAbsUrl();
    const cfg = loadLinks();

    const items = [];
    if (fileName) items.push({ label: fileName, onClick: () => GM_setClipboard(fileName) });
    if (imgAbs)   items.push({ label: imgAbs, onClick: () => GM_setClipboard(imgAbs) });
    if (rel) for (const e of cfg) {
      const link = buildLink(e, rel);
      if (!link) continue;
      items.push({ label: link, onClick: () => GM_setClipboard(link) });
    }

    portal.innerHTML = '';
    for (const it of items) {
      const n = document.createElement('div');
      n.className = 'cfx-ln-item';
      n.textContent = it.label;
      n.addEventListener('click', (ev)=>{ ev.stopPropagation(); try{ it.onClick(); }catch{} hidePortal(); }, {capture:true});
      portal.appendChild(n);
    }

    const r = btn.getBoundingClientRect();
    const gap = 6;
    const top = Math.min(window.innerHeight - 12, r.bottom + gap);
    const left = Math.min(window.innerWidth - 12, r.left);
    portal.style.top = `${top}px`;
    portal.style.left = `${left}px`;
    portal.classList.add('show');
  }

  // ---------- settings JSON model ----------
  function buildSettingsJSON(panel){
    return {
      version: '1',
      ui: {
        searchOnEnter: !!$('#cf-soe', panel)?.checked,
        markReviewed:  !!$('#cf-mr', panel)?.checked,
        dvReduceZoom:  !!$('#cf-dv-on', panel)?.checked,
        dvScale:       parseInt($('#cf-dv-scale', panel)?.value || '100', 10),
        dvOldLayout:   !!$('#cf-dv-old', panel)?.checked,
        thumbMaxH:     parseInt($('#cf-thumbmaxh', panel)?.value || '120', 10),
        dvHideLabels:  !!$('#cf-dv-hide-labels', panel)?.checked
      },
      fileLinks: ($('#cfx-links-settings')?.__data) || loadLinks()
    };
  }
  function applySettingsJSON(panel, obj){
    if (!obj || typeof obj !== 'object') return;
    if (obj.ui) {
      const ui = obj.ui;
      const set = (sel, prop, transform=v=>v)=>{ const el = $(sel, panel); if(el && (prop in ui)){ const val = transform(ui[prop]); if('checked' in el) el.checked = !!val; if('value' in el) el.value = val; } };
      set('#cf-soe', 'searchOnEnter');
      set('#cf-mr', 'markReviewed');
      set('#cf-dv-on', 'dvReduceZoom');
      set('#cf-dv-scale', 'dvScale', v=>String(v));
      set('#cf-dv-old', 'dvOldLayout');
      set('#cf-thumbmaxh', 'thumbMaxH', v=>String(v));
      set('#cf-dv-hide-labels', 'dvHideLabels');
    }
    if (Array.isArray(obj.fileLinks)) {
      saveLinks(obj.fileLinks);
      const sec = panel.querySelector('#cfx-links-settings');
      if (sec) {
        sec.__data = loadLinks();
        if (typeof sec.__renderRows === 'function') sec.__renderRows();
      }
    }
  }

  // ---------- inject File Links section + single Export/Import ----------
  function renderSettingsIntoCfPanel(panel){
    const bd = panel.querySelector('.cf-bd');
    if (!bd) return;

    // File Links section once
    if (!bd.querySelector('#cfx-links-settings')) {
      const hr = document.createElement('hr');
      hr.style.cssText = 'border:0;border-top:1px solid #374151;opacity:.6;margin:12px 0';
      bd.appendChild(hr);

      const root = document.createElement('section');
      root.className = 'cfx-ln-embed';
      root.id = 'cfx-links-settings';

      const h3 = document.createElement('h3');
      h3.textContent = 'File Links';
      const note = document.createElement('div');
      note.className = 'cfx-ln-note';
      note.innerHTML =
        'Each row builds link as: <code>prefix + relPath + suffix</code> (relPath from <code>.mt-chip.mt-path</code>). ' +
        'Separator: "/" or "\\\\", optional URL-encode on path segments. ' +
        'Placeholders in prefix/suffix: <code>%filename%</code>, <code>%basename%</code>, <code>%ext%</code>.';

      const rowsWrap = document.createElement('div');
      rowsWrap.className = 'cfx-ln-rows';

      const toolbar = document.createElement('div');
      toolbar.className = 'cfx-ln-toolbar';
      const left = document.createElement('div');
      toolbar.appendChild(left);
      const btnAdd = document.createElement('button'); btnAdd.textContent = 'Add link';
      left.appendChild(btnAdd);

      root.appendChild(h3);
      root.appendChild(note);
      root.appendChild(rowsWrap);
      root.appendChild(toolbar);
      bd.appendChild(root);

      root.__data = loadLinks();

      function renderRows(){
        rowsWrap.innerHTML = '';
        root.__data.forEach((e, idx) => {
          const row = document.createElement('div');
          row.className = 'cfx-ln-row';

          const inPrefix = document.createElement('input');
          inPrefix.type = 'text'; inPrefix.placeholder = 'prefix (supports %filename% %basename% %ext%)'; inPrefix.value = e.prefix;

          const inSuffix = document.createElement('input');
          inSuffix.type = 'text'; inSuffix.placeholder = 'suffix (supports %filename% %basename% %ext%)'; inSuffix.value = e.suffix;

          const selSep = document.createElement('select');
          ['/', '\\'].forEach(s => {
            const opt = document.createElement('option');
            opt.value = s; opt.textContent = `separator: ${s}`;
            if (e.sep === s) opt.selected = true;
            selSep.appendChild(opt);
          });

          const labEnc = document.createElement('label');
          const cbEnc = document.createElement('input');
          cbEnc.type = 'checkbox'; cbEnc.checked = !!e.urlEncode;
          labEnc.appendChild(cbEnc);
          labEnc.append(' URL-encode');

          const actions = document.createElement('div');
          actions.className = 'cfx-ln-actions';
          const up   = document.createElement('button'); up.textContent = 'Up';
          const down = document.createElement('button'); down.textContent = 'Down';
          const del  = document.createElement('button'); del.textContent = 'Delete';

          on(up,   'click', ()=>{ if (idx <= 0) return; const t = root.__data[idx-1]; root.__data[idx-1]=root.__data[idx]; root.__data[idx]=t; renderRows(); });
          on(down, 'click', ()=>{ if (idx >= root.__data.length-1) return; const t = root.__data[idx+1]; root.__data[idx+1]=root.__data[idx]; root.__data[idx]=t; renderRows(); });
          on(del,  'click', ()=>{ root.__data.splice(idx,1); renderRows(); });

          on(inPrefix, 'input', ()=> e.prefix = inPrefix.value);
          on(inSuffix, 'input', ()=> e.suffix = inSuffix.value);
          on(selSep,   'change',()=> e.sep    = selSep.value);
          on(cbEnc,    'change',()=> e.urlEncode = !!cbEnc.checked);

          actions.appendChild(up); actions.appendChild(down); actions.appendChild(del);

          row.appendChild(inPrefix);
          row.appendChild(inSuffix);
          row.appendChild(selSep);
          row.appendChild(labEnc);
          row.appendChild(actions);
          rowsWrap.appendChild(row);
        });
      }

      on(btnAdd,'click', ()=>{ root.__data.push({ prefix:'', suffix:'', sep:'/', urlEncode:false }); renderRows(); });
      root.__renderRows = renderRows;
      renderRows();

      // Hook main Save (persist fileLinks to storage)
      const saveBtn = panel.querySelector('#cf-save');
      if (saveBtn && !saveBtn.dataset.cfxWired) {
        saveBtn.dataset.cfxWired = '1';
        saveBtn.addEventListener('click', () => {
          const sec = panel.querySelector('#cfx-links-settings');
          if (sec && sec.__data) saveLinks(sec.__data);
        }, { capture:true });
      }
    }

    // Single Export/Import button (create once)
    const actions = panel.querySelector('.cf-actions');
    if (actions && !actions.querySelector('#cf-exim')) {
      const oldEx = actions.querySelector('#cf-export'); if (oldEx) oldEx.style.display = 'none';
      const oldIm = actions.querySelector('#cf-import'); if (oldIm) oldIm.style.display = 'none';

      const eximBtn = document.createElement('button');
      eximBtn.className = 'cf-btn subtle';
      eximBtn.id = 'cf-exim';
      eximBtn.textContent = 'Export/Import';
      actions.insertBefore(eximBtn, actions.querySelector('#cf-cancel') || actions.firstChild);

      eximBtn.addEventListener('click', () => openExImEditor(panel), { capture:true });
    }
  }

  // ---------- Export/Import textarea ----------
  function openExImEditor(panel){
    const bd = panel.querySelector('.cf-bd');
    if (!bd) return;
    let exim = bd.querySelector('#cfx-exim');
    if (!exim) {
      exim = document.createElement('section');
      exim.id = 'cfx-exim';
      exim.innerHTML = `
        <h3>Export / Import settings (JSON)</h3>
        <div class="cfx-ln-note">Copy the JSON below to save. To import, paste your JSON and press <b>Apply</b>. Then click panel <b>Save</b> to persist.</div>
        <textarea id="cfx-exim-ta" spellcheck="false"></textarea>
        <div class="bar">
          <button id="cfx-exim-refresh">Refresh JSON</button>
          <button id="cfx-exim-apply">Apply</button>
          <button id="cfx-exim-close">Close</button>
        </div>
      `;
      bd.appendChild(exim);

      const ta = $('#cfx-exim-ta', exim);
      const btnRefresh = $('#cfx-exim-refresh', exim);
      const btnApply   = $('#cfx-exim-apply', exim);
      const btnClose   = $('#cfx-exim-close', exim);

      const fill = ()=> ta.value = JSON.stringify(buildSettingsJSON(panel), null, 2);

      btnRefresh.addEventListener('click', ()=>{ fill(); toast('JSON refreshed'); });
      btnApply.addEventListener('click', ()=>{
        try{
          const obj = JSON.parse(ta.value || '{}');
          applySettingsJSON(panel, obj);
          toast('JSON applied — click Save');
        }catch(e){
          console.error(e);
          toast('Invalid JSON');
        }
      });
      btnClose.addEventListener('click', ()=>{ exim.remove(); });

      fill();
    } else {
      exim.remove();
    }
  }

  // ---------- observe panel open and inject ----------
  const panelObserver = new MutationObserver(() => {
    document.querySelectorAll('.cf-panel.open').forEach(renderSettingsIntoCfPanel);
  });
  panelObserver.observe(document.body, { childList:true, subtree:true });

  // also try if already open
  document.querySelectorAll('.cf-panel.open').forEach(renderSettingsIntoCfPanel);

  // hook gear click to probe for panel shortly after open
  const gear = document.querySelector('.cf-gear.br');
  if (gear) {
    gear.addEventListener('click', () => {
      const tEnd = Date.now() + 2000;
      (function probe(){
        const panel = document.querySelector('.cf-panel.open');
        if (panel) renderSettingsIntoCfPanel(panel);
        else if (Date.now() < tEnd) requestAnimationFrame(probe);
      })();
    }, { capture:true });
  }

  // ---------- "Links" button in modal topbar ----------
  function matchCloseMetrics(topbar, btn){
    const close = topbar.querySelector('.mt-chip.mt-close, .mt-close, button.mt-close');
    if(!close) return;
    const cs = getComputedStyle(close);
    btn.style.borderRadius = cs.borderRadius;
    btn.style.padding = cs.padding;
    btn.style.fontSize = cs.fontSize;
    btn.style.lineHeight = cs.lineHeight;
    btn.style.fontFamily = cs.fontFamily;
    btn.style.height = cs.height;
  }

  function ensureLinksButton(topbar){
    if (!topbar) return;
    const pathChip = topbar.querySelector('.mt-chip.mt-path');
    if (!pathChip) return;

    let wrap = topbar.querySelector('.cfx-ln-wrap');
    if (!wrap) {
      wrap = document.createElement('span');
      wrap.className = 'cfx-ln-wrap';
      pathChip.parentNode.insertBefore(wrap, pathChip);
    }

    let lnBtn = wrap.querySelector('.cfx-ln-btn');
    if (!lnBtn) {
      lnBtn = document.createElement('button');
      lnBtn.className = 'mt-chip cfx-ln-btn';
      lnBtn.type = 'button';
      lnBtn.innerHTML = '<span>Links</span>';
      wrap.appendChild(lnBtn);

      matchCloseMetrics(topbar, lnBtn);

      lnBtn.addEventListener('mousedown', (e)=>e.stopPropagation(), true);
      lnBtn.addEventListener('click', (e)=>{
        e.stopPropagation();
        if (portal.classList.contains('show')) portal.classList.remove('show');
        else openMenuAt(lnBtn, topbar);
      }, {capture:true});
    }
  }

  function scanTopbars(){ $$('.mt-topbar').forEach(ensureLinksButton); }
  const mo = new MutationObserver(()=>scanTopbars());
  mo.observe(document.body, { childList:true, subtree:true });
  setInterval(scanTopbars, 1500);
  scanTopbars();
})();
