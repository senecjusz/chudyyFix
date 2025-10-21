// ==UserScript==
// @name         Search on Enter (only when modal not active)
// @namespace    chudyfix
// @version      1.2.0
// @description  Pressing Enter runs search() only when document modal is not active
// @match        *://*/*
// @run-at       document-idle
// @grant        none
// @updateURL   https://raw.githubusercontent.com/senecjusz/chudyyFix/main/userscripts/search-on-enter.user.js
// @downloadURL https://raw.githubusercontent.com/senecjusz/chudyyFix/main/userscripts/search-on-enter.user.js

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
    (function() {
      "use strict";

      document.addEventListener("keydown", function(e) {
        if (e.key === "Enter") {
          // Check if modal is visible/active
          const modal = document.querySelector("#documentModal");
          const modalActive = modal && modal.classList.contains("active");

          if (!modalActive) {
            e.preventDefault();
            // Option 1: if global search() function exists
            if (typeof search === "function") {
              search();
              return;
            }
            // Option 2: trigger button directly
            const btn = document.querySelector('button[onclick="search()"]');
            if (btn) btn.click();
          }
        }
      });
    })();
    // --- Original script ends here ---

  } catch (err) {
    // If crypto.subtle is unavailable (non-secure context), consider using TM "User includes" instead.
    // console.error('Guard init error:', err);
  }
})();
