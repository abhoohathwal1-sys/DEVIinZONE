/* Shared State (v7 Launch-Ready: 3-8 Players, Real Play Default + Demo Toggle) */
window.ZP_STATE = (function () {
  const KEY = "hathwal_devilinzone_v8";
  const BOT_NAMES = ["VIKRAM", "SHADOW", "KABIR", "GHOST", "RAVI", "ZOYA", "AARAV", "MAYA"];

  function randCode(len = 4) {
    let s = "";
    for (let i = 0; i < len; i++) s += Math.floor(Math.random() * 10);
    return s;
  }

  function defaultState() {
    return {
      playerName: "PLAYER1",
      myId: "p_" + randCode(4),
      mySpriteIdx: 0,
      roomCode: randCode(4),
      isHost: true,
      demoMode: false,        // REAL PLAY by default; small Demo button enables bots!
      fastTimers: false,      // Real play timers by default (Demo mode turns fastTimers on)
      roleMode: "random",     // 100% fair random Devil
      maxPlayers: 5,          // Flexible: 3 to 8 players! (Checklist #6)
      durationMin: 15,        // Selectable: 10, 15, 30, 40 min! (Checklist #6)
      startRadius: 150,
      minRadius: 85,
      maxRadius: 300,
      arenaMap: {
        ready: false,
        anchorLat: 28.6139,
        anchorLng: 77.2090,
        cropRadius: 340,
        seed: Math.floor(Math.random() * 999999),
        propCandidates: []
      },
      players: [
        { id: "me", name: "PLAYER1", isBot: false, isHost: true, role: "pending", catchCode: randCode(4), spriteIdx: 0 }
      ]
    };
  }

  function readRaw() {
    try { const ls = window.localStorage.getItem(KEY); if (ls) return ls; } catch (e) {}
    try { if (window.name && window.name.indexOf("DIZ8:") === 0) return window.name.slice(4); } catch (e) {}
    return null;
  }

  function writeRaw(str) {
    try { window.localStorage.setItem(KEY, str); } catch (e) {}
    try { window.name = "DIZ8:" + str; } catch (e) {}
  }

  function load() {
    try {
      const raw = readRaw();
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      const base = defaultState();
      const merged = Object.assign(base, parsed);
      merged.arenaMap = Object.assign(base.arenaMap, parsed.arenaMap || {});
      return merged;
    } catch (e) {
      return defaultState();
    }
  }

  function save(state) {
    try { writeRaw(JSON.stringify(state)); } catch (e) {}
    return state;
  }

  function createBot(existing) {
    const used = new Set(existing.map(p => p.name));
    const avail = BOT_NAMES.filter(n => !used.has(n));
    const name = avail.length ? avail[0] : ("BOT" + randCode(2));
    return {
      id: "bot_" + Math.random().toString(36).slice(2, 7),
      name,
      isBot: true,
      isHost: false,
      role: "pending",
      catchCode: randCode(4),
      spriteIdx: existing.length % 6
    };
  }

  function fillBotsToTarget(state, targetCount) {
    const cap = Math.max(3, Math.min(8, targetCount || state.maxPlayers || 5));
    while (state.players.length < cap) {
      state.players.push(createBot(state.players));
    }
    return save(state);
  }

  function pickDevilIndex(players, roleMode) {
    if (!players.length) return 0;
    const meIdx = players.findIndex(p => p.id === "me" || p.isSelf);
    if (roleMode === "devil" && meIdx >= 0) return meIdx;
    if (roleMode === "hider" && players.length > 1) {
      const others = players.map((_, i) => i).filter(i => i !== meIdx);
      return others[Math.floor(Math.random() * others.length)];
    }
    return Math.floor(Math.random() * players.length);
  }

  function mulberry32(a) {
    return function () {
      let t = (a += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function prebakeArenaProps(state, lat, lng) {
    const cropR = Math.max(280, (state.startRadius || 150) + 190);
    const seed = Math.floor(Math.random() * 999999);
    const rnd = mulberry32(seed);
    const types = ["pine_green", "pine_green", "pine_autumn", "bush", "bush", "pond", "rock", "cabin"];

    const placed = [];
    for (let attempt = 0; attempt < 900 && placed.length < 95; attempt++) {
      const ang = rnd() * Math.PI * 2;
      const rad = 26 + Math.sqrt(rnd()) * (cropR - 42);
      const x = Math.round(Math.cos(ang) * rad);
      const y = Math.round(Math.sin(ang) * rad);
      let tooClose = false;
      for (let j = 0; j < placed.length; j++) {
        if (Math.hypot(placed[j].x - x, placed[j].y - y) < 28) { tooClose = true; break; }
      }
      if (!tooClose) placed.push({ x, y, type: types[Math.floor(rnd() * types.length)] });
    }

    state.arenaMap = {
      ready: true,
      anchorLat: lat || state.arenaMap.anchorLat || 28.6139,
      anchorLng: lng || state.arenaMap.anchorLng || 77.2090,
      cropRadius: cropR,
      seed,
      propCandidates: placed
    };
    return save(state);
  }

  function showToast(msg) {
    let el = document.getElementById("zp-toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "zp-toast";
      el.className = "g-toast";
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove("show"), 2300);
  }

  return { load, save, randCode, createBot, fillBotsToTarget, pickDevilIndex, prebakeArenaProps, showToast };
})();
