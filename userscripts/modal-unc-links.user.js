// ==UserScript==
// @name         Modal UNC Links - left buttons, path after, Close right
// @namespace    chudyfix
// @version      1.7.0
// @description  Adds left-aligned "net link" (file:// UNC) and "win link" (\\UNC) buttons before path; keeps Close on the right.
// @match        *://*/*
// @run-at       document-idle
// @grant        GM_setClipboard
// @grant        GM_addStyle
// @updateURL    https://git.ts.archax.eu/veloadmingitea/chudyyFix/raw/branch/main/userscripts/modal-unc-links.user.js
// @downloadURL  https://git.ts.archax.eu/veloadmingitea/chudyyFix/raw/branch/main/userscripts/modal-unc-links.user.js
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
      const UNC_ROOT = "\\\\fs.emea.local\\Shares\\Teams"; // UNC base; keep \\ escaped
      const HEADER_SELECTOR = ".modal-header";             // modal header container
      const PATH_SELECTOR = "#documentPath";               // element with relative path text
      const LABEL_NET = ["net", "link"];                   // two-line label for file:// UNC
      const LABEL_WIN = ["win", "link"];                   // two-line label for \\UNC
      const QUOTE_WINDOWS_PATH = false;                    // wrap Windows UNC in quotes
      const BUTTON_FONT_SIZE_PX = 13;                      // button font size
      const BUTTON_PADDING = "4px 10px";                   // button padding
      const GAP_BETWEEN = 8;                               // gap (px) between items on the left
      // ===== /CONFIG =====

      // Styles scoped to headers we touch
      const css = `
        ${HEADER_SELECTOR}.tm-enhanced {
          display: flex;
          align-items: center;
          justify-content: space-between; /* left group vs Close button */
          gap: ${GAP_BETWEEN}px;
        }
        ${HEADER_SELECTOR}.tm-enhanced .tm-left {
          display: flex;
          align-items: center;
          gap: ${GAP_BETWEEN}px;
          min-width: 0; /* enable truncation if container is tight */
        }
        ${HEADER_SELECTOR}.tm-enhanced .tm-link-btn {
          font-size: ${BUTTON_FONT_SIZE_PX}px;
          line-height: 1.1;
          padding: ${BUTTON_PADDING};
          white-space: normal; /* allow our manual <br> */
          text-align: center;
          cursor: pointer;
        }
        ${HEADER_SELECTOR}.tm-enhanced ${PATH_SELECTOR} {
          /* Let the path use remaining space but not push Close off-screen */
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          display: block;
          max-width: 100%;
        }
      `;
      if (typeof GM_addStyle === "function") GM_addStyle(css);
      else {
        const s = document.createElement("style");
        s.textContent = css;
        document.head.appendChild(s);
      }

      // --- UNC helpers ---
      function parseUncRoot(unc) {
        const trimmed = String(unc || "").replace(/^\\\\+|^\/\/+/, "");
        const parts = trimmed.split(/[\\/]+/).filter(Boolean);
        const host = parts.shift() || "";
        return { host, segs: parts };
      }
      function splitRelPath(rawPath) {
        return String(rawPath || "")
          .trim()
          .split("#")[0]
          .replace(/^[\\/]+/, "")
          .split(/[\\/]+/)
          .filter(Boolean);
      }
      function buildFileUrlFromUnc(rawPath) {
        const { host, segs } = parseUncRoot(UNC_ROOT);
        const rel = splitRelPath(rawPath);
        const encoded = [...segs, ...rel].map(s => encodeURIComponent(s)).join("/");
        return `file://${host}/${encoded}`;
      }
      function buildWindowsUncPath(rawPath) {
        const { host, segs } = parseUncRoot(UNC_ROOT);
        const rel = splitRelPath(rawPath);
        const path = `\\\\${host}\\${[...segs, ...rel].join("\\")}`;
        return QUOTE_WINDOWS_PATH ? `"${path}"` : path;
      }

      // Clipboard
      async function copyToClipboard(text) {
        try {
          if (typeof GM_setClipboard === "function") {
            GM_setClipboard(text, "text");
            return true;
          }
        } catch {}
        try {
          if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(text);
            return true;
          }
        } catch {}
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        const ok = document.execCommand("copy");
        ta.remove();
        return ok;
      }

      // UI
      function makeButton(id, lines, title, builder) {
        const btn = document.createElement("button");
        btn.id = id;
        btn.type = "button";
        btn.className = "tm-link-btn";
        btn.title = title;
        btn.innerHTML = lines.map(l => escapeHtml(l)).join("<br>");
        btn.addEventListener("click", async () => {
          const header = btn.closest(HEADER_SELECTOR);
          const pathEl = header?.querySelector(PATH_SELECTOR);
          const raw = (pathEl?.textContent || "").trim();
          if (!raw) {
            alert("Missing path in " + PATH_SELECTOR);
            return;
          }
          const value = builder(raw);
          const ok = await copyToClipboard(value);
          const original = btn.innerHTML;
          btn.textContent = ok ? "copied" : "copy error";
          setTimeout(() => (btn.innerHTML = original), 1100);
        });
        return btn;
      }

      function escapeHtml(s) {
        return String(s)
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");
      }

      function inject(headerEl) {
        if (!headerEl) return;
        const pathEl = headerEl.querySelector(PATH_SELECTOR);
        if (!pathEl) return;

        // mark header so our CSS applies
        headerEl.classList.add("tm-enhanced");

        // ensure left group exists and is the first child
        let left = headerEl.querySelector(":scope > .tm-left");
        if (!left) {
          left = document.createElement("div");
          left.className = "tm-left";
          headerEl.insertBefore(left, headerEl.firstChild || null);
        }

        // add buttons if missing
        if (!left.querySelector("#tm-net-link")) {
          left.appendChild(
            makeButton("tm-net-link", LABEL_NET, "Copy file:// UNC link", buildFileUrlFromUnc)
          );
        }
        if (!left.querySelector("#tm-win-link")) {
          left.appendChild(
            makeButton("tm-win-link", LABEL_WIN, "Copy Windows UNC path", buildWindowsUncPath)
          );
        }

        // make sure PATH_ELEMENT sits after buttons inside the left group
        if (pathEl.parentElement !== left) {
          left.appendChild(pathEl);
        }

        // Close button stays on the right via flex space-between
      }

      // Initial pass
      document.querySelectorAll(HEADER_SELECTOR).forEach(inject);

      // Observe dynamic modals
      const mo = new MutationObserver(muts => {
        for (const m of muts) {
          for (const n of m.addedNodes) {
            if (!(n instanceof HTMLElement)) continue;
            if (n.matches?.(HEADER_SELECTOR)) inject(n);
            else n.querySelectorAll?.(HEADER_SELECTOR).forEach(inject);
          }
        }
      });
      mo.observe(document.body, { childList: true, subtree: true });
    })();
    // --- Original script ends here ---

  } catch (err) {
    // If crypto.subtle is unavailable (non-secure context), consider using TM "User includes" instead.
    // console.error('Guard init error:', err);
  }
})();
