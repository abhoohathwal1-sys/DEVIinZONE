/* =========================================================
   CHARACTER SPRITES (FROM 40424.png) & PIXEL UI ICONS
   ========================================================= */
window.ZP_ART = (function () {
  const HERO_FILES = [
    "assets/chars/hero_1.png",
    "assets/chars/hero_2.png",
    "assets/chars/hero_3.png",
    "assets/chars/hero_4.png",
    "assets/chars/hero_5.png",
    "assets/chars/hero_6.png"
  ];
  const DEVIL_FILE = "assets/chars/devil.png";

  function charSrc(type = "me", spriteIdx = 0) {
    if (type === "devil") return DEVIL_FILE;
    return HERO_FILES[Math.abs(spriteIdx) % HERO_FILES.length];
  }

  function charIMG(type = "me", heightPx = 46, spriteIdx = 0) {
    const src = charSrc(type, spriteIdx);
    return `<img src="${src}" alt="${type}" style="height:${heightPx}px;width:auto;display:block;image-rendering:pixelated;pointer-events:none;" />`;
  }

  const icons = {
    play: `<svg class="px-icon" viewBox="0 0 16 16" shape-rendering="crispEdges"><path d="M4 2h2v2h2v2h2v2h2v1h-2v2H8v2H6v2H4V2z" fill="currentColor"/></svg>`,
    flask: `<svg class="px-icon" viewBox="0 0 16 16" shape-rendering="crispEdges"><rect x="6" y="1" width="4" height="2" fill="#e6b422"/><rect x="6" y="3" width="4" height="3" fill="#d9f2e4"/><rect x="4" y="6" width="8" height="3" fill="#d9f2e4"/><rect x="3" y="9" width="10" height="5" fill="#22c55e"/><rect x="5" y="10" width="2" height="2" fill="#ffe478"/></svg>`,
    gps: `<svg class="px-icon" viewBox="0 0 16 16" shape-rendering="crispEdges"><rect x="7" y="1" width="2" height="3" fill="currentColor"/><rect x="7" y="12" width="2" height="3" fill="currentColor"/><rect x="1" y="7" width="3" height="2" fill="currentColor"/><rect x="12" y="7" width="3" height="2" fill="currentColor"/><rect x="5" y="5" width="6" height="6" fill="none" stroke="currentColor" stroke-width="2"/><rect x="7" y="7" width="2" height="2" fill="#ffe478"/></svg>`,
    back: `<svg class="px-icon" viewBox="0 0 16 16" shape-rendering="crispEdges"><path d="M10 2H8v2H6v2H4v4h2v2h2v2h2v-3H8V5h2V2z" fill="currentColor"/></svg>`,
    trophy: `<svg class="px-icon" style="width:42px;height:42px;" viewBox="0 0 16 16" shape-rendering="crispEdges"><rect x="4" y="2" width="8" height="6" fill="#e6b422"/><rect x="2" y="3" width="2" height="3" fill="#ffe478"/><rect x="12" y="3" width="2" height="3" fill="#ffe478"/><rect x="6" y="8" width="4" height="3" fill="#b88812"/><rect x="4" y="11" width="8" height="3" fill="#e6b422"/><rect x="5" y="3" width="2" height="3" fill="#fff4a3"/></svg>`,
    cloak: `<svg class="px-icon" style="width:24px;height:24px;" viewBox="0 0 16 16" shape-rendering="crispEdges"><rect x="5" y="1" width="6" height="2" fill="#6ce8f7"/><rect x="3" y="3" width="10" height="8" fill="#6ce8f7"/><rect x="3" y="11" width="2" height="3" fill="#6ce8f7"/><rect x="7" y="11" width="2" height="3" fill="#6ce8f7"/><rect x="11" y="11" width="2" height="3" fill="#6ce8f7"/><rect x="5" y="5" width="2" height="2" fill="#0d1920"/><rect x="9" y="5" width="2" height="2" fill="#0d1920"/><rect x="6" y="8" width="4" height="1" fill="#0d1920"/></svg>`,
    decoy: `<svg class="px-icon" style="width:24px;height:24px;" viewBox="0 0 16 16" shape-rendering="crispEdges"><rect x="5" y="1" width="6" height="2" fill="#ffe07d"/><rect x="3" y="3" width="10" height="6" fill="#f5b727"/><rect x="6" y="4" width="4" height="4" fill="#10161c"/><rect x="7" y="5" width="2" height="2" fill="#ffe07d"/><rect x="5" y="9" width="6" height="3" fill="#f5b727"/><rect x="7" y="12" width="2" height="3" fill="#ffe07d"/></svg>`,
    sense: `<svg class="px-icon" style="width:24px;height:24px;" viewBox="0 0 16 16" shape-rendering="crispEdges"><rect x="4" y="3" width="8" height="2" fill="#ff7c7c"/><rect x="2" y="5" width="12" height="6" fill="#ff7c7c"/><rect x="4" y="11" width="8" height="2" fill="#ff7c7c"/><rect x="5" y="5" width="6" height="6" fill="#10161c"/><rect x="6" y="6" width="4" height="4" fill="#ffe07d"/><rect x="7" y="7" width="2" height="2" fill="#de3b3b"/></svg>`,
    scan: `<svg class="px-icon" style="width:24px;height:24px;" viewBox="0 0 16 16" shape-rendering="crispEdges"><rect x="5" y="1" width="6" height="2" fill="#6ce8f7"/><rect x="5" y="13" width="6" height="2" fill="#6ce8f7"/><rect x="1" y="5" width="2" height="6" fill="#6ce8f7"/><rect x="13" y="5" width="2" height="6" fill="#6ce8f7"/><rect x="4" y="4" width="8" height="8" fill="none" stroke="#1bb3c8" stroke-width="2"/><rect x="7" y="7" width="2" height="2" fill="#ffe07d"/><rect x="9" y="5" width="2" height="2" fill="#ffe07d"/></svg>`,
    lock: `<svg class="px-icon" style="width:24px;height:24px;" viewBox="0 0 16 16" shape-rendering="crispEdges"><rect x="5" y="2" width="6" height="2" fill="#ffe07d"/><rect x="4" y="4" width="2" height="3" fill="#ffe07d"/><rect x="10" y="4" width="2" height="3" fill="#ffe07d"/><rect x="3" y="7" width="10" height="7" fill="#f5b727"/><rect x="7" y="9" width="2" height="3" fill="#10161c"/></svg>`,
    target: `<svg class="px-icon" viewBox="0 0 16 16" shape-rendering="crispEdges"><rect x="2" y="2" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"/><rect x="6" y="6" width="4" height="4" fill="#ffe478"/></svg>`
  };

  return { HERO_FILES, DEVIL_FILE, charSrc, charIMG, icons };
})();
