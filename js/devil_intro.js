/* =========================================================
   DEVIL SELECTION CINEMATIC INTRO (js/devil_intro.js)
   Uses exact transparent character PNGs from 40424.png!
   1. 5 RPG Adventurers stand in a circle
   2. Pixel Chemical Bottle spins in center & picks random player
   3. Bottle smashes -> Target mutates into RED HORNED DEVIL!
   4. Other 4 adventurers panic & sprint outward!
   ========================================================= */
window.ZP_DEVIL_INTRO = (function () {
  function run({ canvas, players, devilIdx, onComplete }) {
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    let rafId = null;
    let finished = false;
    const startTime = performance.now();

    // Preload crisp PNG sprites from assets/chars/
    const imgCache = {};
    function getImg(src) {
      if (!imgCache[src]) {
        const im = new Image();
        im.src = src;
        imgCache[src] = im;
      }
      return imgCache[src];
    }
    const devilImg = getImg(window.ZP_ART.DEVIL_FILE);
    players.forEach((p, i) => getImg(window.ZP_ART.charSrc("me", p.spriteIdx ?? i)));

    const N = players.length;
    const playerAngles = players.map((_, i) => (i / N) * Math.PI * 2 - Math.PI / 2);
    const targetAngle = playerAngles[devilIdx];
    const totalSpinRot = Math.PI * 2 * 5 + (targetAngle + Math.PI / 2);

    let lastTickSector = -1;
    let smashTriggered = false;
    let roarTriggered = false;
    const shards = [], blobs = [], dust = [];

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = canvas.clientWidth * dpr;
      canvas.height = canvas.clientHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = false;
    }
    resize();
    window.addEventListener("resize", resize);

    function spawnSmash(x, y) {
      for (let i = 0; i < 26; i++) {
        const a = Math.random() * Math.PI * 2;
        const spd = 65 + Math.random() * 175;
        shards.push({ x, y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd - 45, size: 4 + Math.floor(Math.random() * 5), life: 1, color: i % 3 === 0 ? "#fff" : "#4ade80" });
      }
      for (let i = 0; i < 28; i++) {
        const a = Math.random() * Math.PI * 2;
        const spd = 25 + Math.random() * 125;
        blobs.push({ x, y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, s: 6 + Math.floor(Math.random() * 8), life: 1, color: i % 2 === 0 ? "#22c55e" : "#a855f7" });
      }
    }

    function drawChar(x, y, p, i, isDevil, devilProg, runCycle, panic) {
      const px = Math.round(x);
      const hop = runCycle ? Math.abs(Math.sin(runCycle * 16)) * 7 : 0;
      const py = Math.round(y - hop);
      ctx.save();
      ctx.translate(px, py);

      // Ground shadow
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.beginPath();
      ctx.ellipse(0, 22 + hop, 17, 6, 0, 0, Math.PI * 2);
      ctx.fill();

      // Crimson Devil Mutation Aura
      if (isDevil && devilProg > 0.08) {
        const r = Math.round(28 + devilProg * 18 + Math.sin(performance.now() * 0.014) * 4);
        ctx.fillStyle = "rgba(239, 44, 44, 0.30)";
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();
      }

      // Draw Real Extracted Character Sprite (Switches to Red Horned Devil after smash!)
      const useDevilSprite = isDevil && devilProg > 0.35;
      const spr = useDevilSprite ? devilImg : getImg(window.ZP_ART.charSrc("me", p.spriteIdx ?? i));
      const targetH = useDevilSprite ? Math.round(48 + devilProg * 14) : 48;
      if (spr && spr.complete && spr.naturalHeight > 0) {
        const targetW = Math.round(spr.naturalWidth * (targetH / spr.naturalHeight));
        ctx.drawImage(spr, -Math.round(targetW / 2), -Math.round(targetH / 2) - 2, targetW, targetH);
      }

      if (panic) {
        ctx.fillStyle = "#111";
        ctx.fillRect(-6, -42, 12, 14);
        ctx.fillStyle = "#ffe44d";
        ctx.fillRect(-2, -40, 4, 6);
        ctx.fillRect(-2, -32, 4, 3);
      }

      const label = useDevilSprite ? ("DEVIL " + (p.id === "me" ? "YOU" : p.name)) : (p.id === "me" ? "YOU" : p.name);
      ctx.font = "bold 10px 'Courier New', monospace";
      ctx.textAlign = "center";
      ctx.fillStyle = "#111";
      ctx.fillText(label, 1, 35 + hop);
      ctx.fillStyle = useDevilSprite ? "#ff7878" : (p.id === "me" ? "#ffe478" : "#e8ffe8");
      ctx.fillText(label, 0, 34 + hop);

      ctx.restore();
    }

    function drawBottle(x, y, angle, scale = 1) {
      ctx.save();
      ctx.translate(Math.round(x), Math.round(y));
      ctx.rotate(angle);
      ctx.scale(scale, scale);

      ctx.fillStyle = "rgba(82, 168, 50, 0.35)";
      ctx.fillRect(-20, -20, 40, 40);
      ctx.fillStyle = "#111";
      ctx.fillRect(-6, -24, 12, 6);
      ctx.fillRect(-5, -18, 10, 10);
      ctx.fillRect(-14, -8, 28, 24);
      ctx.fillStyle = "#e6b422";
      ctx.fillRect(-4, -22, 8, 4);
      ctx.fillStyle = "#d9f2e4";
      ctx.fillRect(-3, -16, 6, 8);
      ctx.fillRect(-11, -5, 22, 18);
      ctx.fillStyle = "#22c55e";
      ctx.fillRect(-11, 2, 22, 11);
      ctx.fillStyle = "#ffe478";
      ctx.fillRect(-6, 5, 4, 4);
      ctx.fillRect(3, 8, 3, 3);
      ctx.fillStyle = "#ef4444";
      ctx.fillRect(-2, -32, 4, 6);
      ctx.fillRect(-6, -28, 12, 3);

      ctx.restore();
    }

    function cleanup() {
      if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
      window.removeEventListener("resize", resize);
    }

    function finishNow() {
      if (finished) return;
      finished = true;
      cleanup();
      if (onComplete) onComplete();
    }

    let prevNow = startTime;
    function frame(now) {
      if (finished) return;
      const dt = Math.min(0.05, (now - prevNow) / 1000);
      prevNow = now;
      const t = (now - startTime) / 1000;

      const w = canvas.clientWidth, h = canvas.clientHeight;
      const cx = w / 2, cy = h / 2 + 12;
      const ringR = Math.min(w, h) * 0.29;

      let sx = 0, sy = 0;
      if (t >= 4.4 && t < 4.9) {
        const mag = (1 - (t - 4.4) / 0.5) * 9;
        sx = Math.round((Math.random() - 0.5) * mag * 2);
        sy = Math.round((Math.random() - 0.5) * mag * 2);
      }

      ctx.save();
      ctx.translate(sx, sy);

      const tile = 28;
      for (let gx = -tile; gx < w + tile; gx += tile) {
        for (let gy = -tile; gy < h + tile; gy += tile) {
          const alt = ((Math.floor(gx / tile) + Math.floor(gy / tile)) & 1) === 0;
          ctx.fillStyle = t >= 4.4 ? (alt ? "#2b161b" : "#221116") : (alt ? "#274e2f" : "#214428");
          ctx.fillRect(gx, gy, tile, tile);
        }
      }

      ctx.beginPath();
      ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
      ctx.strokeStyle = t >= 4.4 ? "#ef4444" : "#ffe478";
      ctx.lineWidth = 4;
      ctx.setLineDash([10, 8]);
      ctx.stroke();
      ctx.setLineDash([]);

      const devilX = cx + Math.cos(targetAngle) * ringR;
      const devilY = cy + Math.sin(targetAngle) * ringR;

      let title = "5 PLAYERS IN CIRCLE!", sub = "Chemical Bottle Ready...", col = "#7ee058";
      if (t >= 0.9 && t < 3.8) { title = "BOTTLE SPINNING..."; sub = "Kaun Banega DEVIL?"; col = "#ffe478"; }
      else if (t >= 3.8 && t < 4.4) { title = "LOCKED: " + (players[devilIdx].id === "me" ? "YOU!" : players[devilIdx].name); sub = "Chemical Incoming!"; col = "#ff7878"; }
      else if (t >= 4.4 && t < 6.2) { title = (players[devilIdx].id === "me" ? "YOU ARE DEVIL!" : players[devilIdx].name + " = DEVIL!"); sub = "MUTATION COMPLETE!"; col = "#ff5c5c"; }
      else if (t >= 6.2) { title = "HIDERS RUNNING!"; sub = "60s Hide Timer Starting..."; col = "#ffe478"; }

      ctx.fillStyle = "#111"; ctx.fillRect(14, 18, w - 28, 62);
      ctx.fillStyle = "#1d2935"; ctx.fillRect(17, 21, w - 34, 56);
      ctx.textAlign = "center";
      ctx.font = "bold 15px 'Courier New', monospace"; ctx.fillStyle = col; ctx.fillText(title, cx, 46);
      ctx.font = "bold 11px 'Courier New', monospace"; ctx.fillStyle = "#d0dde8"; ctx.fillText(sub, cx, 66);

      const devilProg = t < 4.4 ? 0 : Math.min(1, (t - 4.4) / 1.0);
      const runProg = t < 6.2 ? 0 : Math.min(1, (t - 6.2) / 1.8);

      players.forEach((p, i) => {
        const a = playerAngles[i], isDevil = i === devilIdx;
        let px = cx + Math.cos(a) * ringR, py = cy + Math.sin(a) * ringR;
        if (t < 0.8) {
          const k = 1 - Math.pow(1 - t / 0.8, 3);
          px = cx + Math.cos(a) * (ringR + (1 - k) * 90);
          py = cy + Math.sin(a) * (ringR + (1 - k) * 90);
        }
        let runCycle = 0, panic = false;
        if (!isDevil && runProg > 0) {
          const push = runProg * runProg * Math.max(w, h) * 0.65;
          px += Math.cos(a) * push; py += Math.sin(a) * push;
          runCycle = t; panic = true;
          if (Math.random() < 0.32) dust.push({ x: px, y: py + 18, s: 6, life: 0.65 });
        }
        if (isDevil && runProg > 0) {
          px += (cx - px) * Math.min(1, runProg * 0.7);
          py += (cy - py) * Math.min(1, runProg * 0.7);
        }
        drawChar(px, py, p, i, isDevil, devilProg, runCycle, panic);
      });

      for (let i = dust.length - 1; i >= 0; i--) {
        const d = dust[i]; d.life -= dt * 1.5;
        if (d.life <= 0) { dust.splice(i, 1); continue; }
        ctx.fillStyle = `rgba(235, 255, 235, ${d.life * 0.55})`;
        ctx.fillRect(Math.round(d.x), Math.round(d.y), d.s, d.s);
      }

      if (t < 4.4) {
        let bx = cx, by = cy, bAngle = 0, bScale = 1.05;
        if (t < 0.9) bAngle = Math.sin(t * 4) * 0.12;
        else if (t < 3.8) {
          const u = (t - 0.9) / 2.9;
          bAngle = (1 - Math.pow(1 - u, 3.2)) * totalSpinRot;
          const sec = Math.floor(bAngle / ((Math.PI * 2) / N));
          if (sec !== lastTickSector) { lastTickSector = sec; window.ZP_AUDIO.bottleTick(440 + (1 - u) * 260); }
        } else {
          const u = (t - 3.8) / 0.6;
          bx = cx + (devilX - cx) * (u * u);
          by = cy + ((devilY - 14) - cy) * (u * u) - Math.sin(u * Math.PI) * 52;
          bAngle = totalSpinRot + u * 2.2;
          bScale = 1.05 + Math.sin(u * Math.PI) * 0.4;
        }
        drawBottle(bx, by, bAngle, bScale);
      } else {
        if (!smashTriggered) { smashTriggered = true; window.ZP_AUDIO.bottleSmash(); spawnSmash(devilX, devilY - 10); }
        if (t >= 5.0 && !roarTriggered) { roarTriggered = true; window.ZP_AUDIO.devilRoar(); }
      }

      for (let i = blobs.length - 1; i >= 0; i--) {
        const b = blobs[i]; b.x += b.vx * dt; b.y += b.vy * dt; b.vx *= 0.93; b.vy *= 0.93; b.life -= dt;
        if (b.life <= 0) { blobs.splice(i, 1); continue; }
        ctx.fillStyle = b.color;
        const sz = Math.max(2, Math.round(b.s * b.life));
        ctx.fillRect(Math.round(b.x), Math.round(b.y), sz, sz);
      }
      for (let i = shards.length - 1; i >= 0; i--) {
        const s = shards[i]; s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 320 * dt; s.life -= dt * 1.1;
        if (s.life <= 0) { shards.splice(i, 1); continue; }
        ctx.fillStyle = s.color;
        ctx.fillRect(Math.round(s.x), Math.round(s.y), s.size, s.size);
      }

      ctx.restore();
      if (t >= 8.0) { finishNow(); return; }
      rafId = requestAnimationFrame(frame);
    }

    rafId = requestAnimationFrame(frame);
    return { skip: finishNow, destroy: cleanup };
  }
  return { run };
})();
