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
  // Compute SHA-256 of origin + normalized path (no query, no trailing slash)
  const canonicalPath = location.pathname.replace(/\/+$/, '') || '/';
  const input = location.origin + canonicalPath;
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  const hex = [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');

  // Put your allowed hashes here
  const allowed = new Set([
    'PASTE_HASH_HEX_1',
    // 'PASTE_HASH_HEX_2',
  ]);
  if (!allowed.has(hex)) return;

  // --- Your script logic below ---
  // Example:
  // console.log('[chudyyFix] active on allowed page');

})();
