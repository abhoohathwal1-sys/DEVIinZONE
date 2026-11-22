/* Retro 8-Bit Arcade Chiptune Sound Effects */
window.ZP_AUDIO = (function () {
  let ctx = null;
  function getCtx() {
    try {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) ctx = new AC();
      }
      if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {});
    } catch (e) {}
    return ctx;
  }

  function beep(freq, dur, type = "square", vol = 0.06, delay = 0) {
    try {
      const c = getCtx();
      if (!c) return;
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, c.currentTime + delay);
      g.gain.setValueAtTime(vol, c.currentTime + delay);
      g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + delay + dur);
      o.connect(g);
      g.connect(c.destination);
      o.start(c.currentTime + delay);
      o.stop(c.currentTime + delay + dur);
    } catch (e) {}
  }

  function noise(dur = 0.22, vol = 0.12) {
    try {
      const c = getCtx();
      if (!c) return;
      const n = Math.floor(c.sampleRate * dur);
      const buf = c.createBuffer(1, n, c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (n * 0.28));
      const src = c.createBufferSource();
      src.buffer = buf;
      const g = c.createGain();
      g.gain.setValueAtTime(vol, c.currentTime);
      src.connect(g);
      g.connect(c.destination);
      src.start();
    } catch (e) {}
  }

  window.addEventListener("pagehide", () => {
    try { if (ctx && ctx.state === "running") ctx.suspend(); } catch (e) {}
  });

  return {
    click() { beep(660, 0.05, "square", 0.05); },
    introChime() {
      beep(330, 0.12, "triangle", 0.07, 0);
      beep(494, 0.12, "triangle", 0.07, 0.11);
      beep(659, 0.28, "triangle", 0.08, 0.22);
    },
    bottleTick(p = 500) { beep(p, 0.04, "square", 0.05); },
    bottleSmash() {
      noise(0.28, 0.14);
      beep(920, 0.07, "square", 0.06, 0);
      beep(180, 0.24, "sawtooth", 0.08, 0.05);
      if (navigator.vibrate) navigator.vibrate([100, 40, 180]);
    },
    devilRoar() {
      beep(140, 0.35, "sawtooth", 0.09, 0);
      beep(95, 0.45, "square", 0.09, 0.12);
    },
    radarPing() {
      beep(880, 0.10, "square", 0.06, 0);
      beep(1320, 0.18, "square", 0.06, 0.11);
      if (navigator.vibrate) navigator.vibrate([80, 50, 110]);
    },
    zoneExpand() {
      beep(440, 0.10, "square", 0.06, 0);
      beep(660, 0.16, "square", 0.06, 0.10);
    },
    zoneShrink() {
      beep(340, 0.12, "sawtooth", 0.06, 0);
      beep(210, 0.20, "sawtooth", 0.06, 0.13);
    },
    catchSound() {
      beep(523, 0.08, "square", 0.07, 0);
      beep(659, 0.08, "square", 0.07, 0.08);
      beep(1046, 0.22, "square", 0.08, 0.16);
      if (navigator.vibrate) navigator.vibrate(180);
    }
  };
})();
