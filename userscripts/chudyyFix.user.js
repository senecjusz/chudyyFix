// ==UserScript==
// @name         chudyyFix
// @namespace    https://git.ts.archax.eu/veloadmingitea
// @version      1.0.0
// @description  Private site userscript with hashed URL matching
// @match        *://*/*
// @run-at       document-start
// @grant        none
// @updateURL    https://git.ts.archax.eu/veloadmingitea/chudyyFix/raw/branch/main/userscripts/chudyyFix.user.js
// @downloadURL  https://git.ts.archax.eu/veloadmingitea/chudyyFix/raw/branch/main/userscripts/chudyyFix.user.js
// ==/UserScript==

(async () => {
  try {
    // Compute SHA-256 of origin + normalized path (no query, no trailing slash)
    const canonicalPath = location.pathname.replace(/\/+$/, '') || '/';
    const input = location.origin + canonicalPath;
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
    const hex = [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');

    // Allowed hashes
    const allowed = new Set([
      'df9c64cf96e0a7d2389edee1b0df09992ed09d171d99431de4cb102b099a1510',
    ]);
    if (!allowed.has(hex)) return;

    // --- Your real logic below ---
    document.documentElement.setAttribute('data-chudyyfix', '1');
    // console.log('[chudyyFix] active', { input, hex });
  } catch (e) {
    // console.error('[chudyyFix] init error:', e);
  }
})();
