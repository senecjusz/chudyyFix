// ==UserScript==
// @name         chudyyFix — Minimal Menu + SearchOnEnter + MarkReviewed
// @namespace    chudyfix
// @version      0.3.0
// @description  Settings panel + hashed-URL guard; Search on Enter (when modal not active) + Mark reviewed documents (toggle).
// @match        *://*/*
// @run-at       document-idle
// @grant        GM_addStyle
// @grant        GM_registerMenuCommand
// ==/UserScript==

(function () {
  "use strict";

  // ===== SETTINGS (cookie with LS fallback) =====
  const DEFAULTS = {
    ver: 3,
    ui: { corner: "br", size: 36 },
    modules: {
      searchOnEnter: true,  // run search() on Enter when #documentModal is not active
      markReviewed:  true,  // mark clicked document cards
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
    if (enc.length > 3800) { try { localStorage.setItem(LS, js); } catch {} setCookie(CK, "__LS__", DAYS); }
    else { setCookie(CK, enc, DAYS); try { localStorage.removeItem(LS); } catch {} }
  }
  function loadSettings() {
    const raw = getCookie(CK);
    if (!raw) return structuredClone(DEFAULTS);
    if (raw === "__LS__") { try { const js = localStorage.getItem(LS); if (js) return merge(DEFAULTS, JSON.parse(js)); } catch {} return structuredClone(DEFAULTS); }
    try { return merge(DEFAULTS, JSON.parse(decodeURIComponent(raw))); } catch { return structuredClone(DEFAULTS); }
  }
  let SETTINGS = loadSettings();

  // ===== URL GUARD (exactly like your working script idea) =====
  function normalizePath(p) {
    const noTrailing = (p || "/").replace(/\/+$/, "") || "/";
    return noTrailing;
  }
  async function sha256Hex(s) {
    try {
      const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
      return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2,"0")).join("");
    } catch {
      let h = 5381; for (let i = 0; i < s.length; i++) h = ((h<<5)+h) ^ s.charCodeAt(i);
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

  // ===== UI: gear + panel + overlay with proper close =====
  GM_addStyle(`
    .cf-gear{position:fixed;z-index:2147483000;width:${SETTINGS.ui.size}px;height:${SETTINGS.ui.size}px;border-radius:50%;
      background:#111;color:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 10px rgba(0,0,0,.3);
      cursor:pointer;opacity:.85}
    .cf-gear:hover{opacity:1}
    .cf-gear.tl{top:12px;left:12px}.cf-gear.tr{top:12px;right:12px}.cf-gear.bl{bottom:12px;left:12px}.cf-gear.br{bottom:12px;right:12px}
    .cf-ov{position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:2147482998;display:none}
    .cf-ov.open{display:block}
    .cf-panel{position:fixed;z-index:2147482999;right:12px;bottom:12px;width:min(520px,92vw);max-height:min(80vh,720px);
      background:#1f2937;color:#e5e7eb;border-radius:12px;box-shadow:0 12px 30px rgba(0,0,0,.35);
      display:none;flex-direction:column;font:14px/1.4 ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial}
    .cf-panel.open{display:flex}
    .cf-hd{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:#111827;
      border-top-left-radius:12px;border-top-right-radius:12px}
    .cf-title{font-weight:700}
    .cf-close{background:transparent;border:0;color:#e5e7eb;font-size:18px;cursor:pointer;line-height:1}
    .cf-bd{padding:12px;overflow:auto}
    .cf-row{display:grid;grid-template-columns:220px 1fr;gap:10px;align-items:center;margin:8px 0}
    .cf-row input[type="checkbox"]{transform:scale(1.15)}
    .cf-actions{display:flex;gap:8px;justify-content:flex-end;padding:12px;border-top:1px solid #374151}
    .cf-btn{padding:6px 10px;border-radius:8px;border:1px solid #4b5563;background:#374151;color:#fff;cursor:pointer}
    .cf-btn.primary{background:#2563eb;border-color:#1d4ed8}
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
      <div class="cf-row"><label>Search on Enter (when modal not active)</label><input id="cf-soe" type="checkbox"></div>
      <div class="cf-row"><label>Mark reviewed documents</label><input id="cf-mr" type="checkbox"></div>
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
    saveSettings(SETTINGS);
    closePanel(); // auto-close after save
    alert("Settings saved.");
  });

  gear.classList.remove("tl","tr","bl","br");
  gear.classList.add(SETTINGS.ui.corner);

  // ===== TM menu =====
  if (typeof GM_registerMenuCommand === "function") {
    GM_registerMenuCommand("Open settings (⚙️)", () => panel.classList.contains("open") ? closePanel() : openPanel());
    GM_registerMenuCommand("Export settings JSON", () => { navigator.clipboard?.writeText(JSON.stringify(SETTINGS, null, 2)); alert("Settings copied."); });
    GM_registerMenuCommand("Reset to defaults", () => { SETTINGS = structuredClone(DEFAULTS); saveSettings(SETTINGS); alert("Defaults restored."); });
    GM_registerMenuCommand("Guard: trust current URL", trustCurrent);
    GM_registerMenuCommand("Guard: clear trusted", clearTrusted);
    GM_registerMenuCommand("Reset reviewed marks", () => {
      try { localStorage.removeItem("tm_viewed_docs_v1"); } catch {}
      alert("Reviewed marks cleared.");
    });
  }

  // ===== Run only on allowed pages =====
  (async () => {
    if (!(await isAllowed())) {
      console.info("[chudyyFix] URL not allowed. Use TM menu: Guard: trust current URL.");
      return;
    }

    // === Search on Enter (exact behavior from your working script) ===
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

    // === Mark reviewed documents (toggle) ===
    if (SETTINGS.modules.markReviewed) {
      // style (subtle gray)
      const COLOR_RGB = [128,128,128], BADGE_ALPHA = 0.85, OUTLINE_PX = 2, IMG_OPACITY = 0.95, IMG_SATURATE = 0.9, BADGE_TEXT = "✓ viewed";
      const css = `
        .document-card { position: relative; }
        .document-card.tm-reviewed { outline: ${OUTLINE_PX}px solid rgb(${COLOR_RGB.join(",")}); border-radius: 8px; }
        .document-card.tm-reviewed .document-preview img { opacity: ${IMG_OPACITY}; filter: saturate(${IMG_SATURATE}); }
        .document-card .tm-reviewed-badge {
          position: absolute; top: 6px; left: 6px; font: 700 12px/1 ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;
          background: rgba(${COLOR_RGB.join(",")}, ${BADGE_ALPHA}); color: #fff; padding: 2px 6px; border-radius: 9999px;
          box-shadow: 0 1px 2px rgba(0,0,0,.15); z-index: 100; pointer-events: none;
        }`;
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
            if (!badge) { badge = document.createElement("div"); badge.className = "tm-reviewed-badge"; badge.textContent = BADGE_TEXT; card.appendChild(badge); }
            else { badge.textContent = BADGE_TEXT; }
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
        if (!viewed.has(id)) { viewed.add(id); saveSet(viewed); }
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
  })();

})();
