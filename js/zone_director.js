/* =========================================================
   SMART AI ZONE DIRECTOR (v7 — Anti-Abuse Expand Cooldown & Limit!)
   - Max 2 Anti-Trap Expands per match + 90s cooldown (30s demo)
   - Devil can also trigger "ZONE LOCK" gadget to block expand for 20s
   - Far Hiders -> Zone SHRINKS
   - Every 10m (45s demo) -> Random Center Shift
   ========================================================= */
window.ZP_ZONE_DIRECTOR = (function () {
  function create(opts) {
    const fast = !!opts.fastTimers;
    const startR = opts.startRadius || 150;
    const minR = opts.minRadius || 85;
    const maxR = opts.maxRadius || 300;
    const maxCenterRoam = opts.maxCenterRoam || 135;

    const CHECK_INTERVAL = fast ? 14 : 45;
    const SHIFT_DURATION = fast ? 10 : 25;
    const CENTER_SHIFT_INTERVAL = fast ? 45 : 600;
    const EXPAND_COOLDOWN = fast ? 30 : 90;  // Checklist #2: Cooldown prevents border camping!
    const MAX_EXPANDS = 2;                   // Checklist #2: Max 2 expands per match!

    const z = {
      cx: 0, cy: 0, radius: startR,
      targetCx: 0, targetCy: 0, targetRadius: startR,
      state: "waiting",
      actionType: "HOLD",
      stateTimer: CHECK_INTERVAL,
      centerShiftTimer: CENTER_SHIFT_INTERVAL,
      expandsUsed: 0,
      maxExpands: MAX_EXPANDS,
      expandCooldownLeft: 0,
      expandLockedSec: 0 // Set by Devil's "Zone Lock" gadget
    };

    function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }

    function pickRandomCenter() {
      for (let attempt = 0; attempt < 12; attempt++) {
        const ang = Math.random() * Math.PI * 2;
        const jump = 45 + Math.random() * 55;
        let nx = z.cx + Math.cos(ang) * jump;
        let ny = z.cy + Math.sin(ang) * jump;
        const fromOrigin = Math.hypot(nx, ny);
        if (fromOrigin > maxCenterRoam) {
          nx *= maxCenterRoam / fromOrigin;
          ny *= maxCenterRoam / fromOrigin;
        }
        if (dist(nx, ny, z.cx, z.cy) >= 35) return { x: Math.round(nx), y: Math.round(ny) };
      }
      const a = Math.random() * Math.PI * 2;
      return { x: Math.round(Math.cos(a) * 65), y: Math.round(Math.sin(a) * 65) };
    }

    function evaluateAndPlan(players, forceCenterShift, callbacks) {
      const devil = players.find(p => p.role === "devil" && p.alive);
      const aliveHiders = players.filter(p => p.role === "hider" && p.alive);
      if (!devil || !aliveHiders.length) return;

      let totalDist = 0, minDist = Infinity, trappedHider = null;
      aliveHiders.forEach(h => {
        const dDevil = dist(devil.x, devil.y, h.x, h.y);
        const edgeMargin = z.radius - dist(h.x, h.y, z.cx, z.cy);
        totalDist += dDevil;
        if (dDevil < minDist) minDist = dDevil;
        if ((edgeMargin < Math.max(24, z.radius * 0.22) && dDevil < Math.max(46, z.radius * 0.40)) || (dDevil < 32 && z.radius <= 120)) {
          trappedHider = h;
        }
      });
      const avgDist = totalDist / aliveHiders.length;

      // 1) Random Center Shift every 10m (45s demo)
      if (forceCenterShift) {
        const nc = pickRandomCenter();
        z.targetCx = nc.x; z.targetCy = nc.y;
        z.targetRadius = Math.round(z.radius);
        z.actionType = "CENTER_SHIFT";
        z.state = "shifting";
        z.stateTimer = SHIFT_DURATION;
        z.centerShiftTimer = CENTER_SHIFT_INTERVAL;
        if (callbacks && callbacks.onShift) callbacks.onShift("CENTER_SHIFT", "UNPREDICTABLE ZONE! CENTER SHIFTING!");
        return;
      }

      // 2) Anti-Trap EXPAND (STRICTLY LIMITED: Max 2 per match + Cooldown + Not Zone-Locked!)
      const canExpand =
        trappedHider &&
        z.expandsUsed < z.maxExpands &&
        z.expandCooldownLeft <= 0 &&
        z.expandLockedSec <= 0 &&
        z.radius < maxR - 15;

      if (canExpand) {
        z.expandsUsed++;
        z.expandCooldownLeft = EXPAND_COOLDOWN;
        z.targetCx = z.cx; z.targetCy = z.cy;
        z.targetRadius = Math.min(maxR, Math.round(z.radius + 48));
        z.actionType = "EXPANDING";
        z.state = "shifting";
        z.stateTimer = SHIFT_DURATION;
        if (callbacks && callbacks.onShift) {
          callbacks.onShift("EXPANDING", `ANTI-TRAP EXPAND (${z.expandsUsed}/${z.maxExpands}) → ${z.targetRadius}m`);
        }
        return;
      }

      // 3) Action SHRINK when Hiders are far
      if (avgDist > z.radius * 0.60 && minDist > 45 && z.radius > minR + 10) {
        z.targetCx = z.cx; z.targetCy = z.cy;
        z.targetRadius = Math.max(minR, Math.round(z.radius - 36));
        z.actionType = "SHRINKING";
        z.state = "shifting";
        z.stateTimer = SHIFT_DURATION;
        if (callbacks && callbacks.onShift) {
          callbacks.onShift("SHRINKING", `HIDERS FAR — ZONE SHRINKING TO ${z.targetRadius}m`);
        }
        return;
      }

      z.actionType = "HOLD";
      z.state = "waiting";
      z.stateTimer = CHECK_INTERVAL;
    }

    function stepFrame(dt) {
      if (z.state !== "shifting") return;
      const alpha = Math.min(1, dt / Math.max(0.8, z.stateTimer));
      z.cx += (z.targetCx - z.cx) * alpha;
      z.cy += (z.targetCy - z.cy) * alpha;
      z.radius += (z.targetRadius - z.radius) * alpha;
    }

    function tickSecond(players, callbacks) {
      if (z.expandCooldownLeft > 0) z.expandCooldownLeft--;
      if (z.expandLockedSec > 0) z.expandLockedSec--;
      z.centerShiftTimer--;

      if (z.state === "waiting") {
        z.stateTimer--;
        if (z.centerShiftTimer <= 0) evaluateAndPlan(players, true, callbacks);
        else if (z.stateTimer <= 0) evaluateAndPlan(players, false, callbacks);
      } else {
        z.stateTimer--;
        if (z.stateTimer <= 0) {
          z.cx = z.targetCx; z.cy = z.targetCy; z.radius = z.targetRadius;
          z.state = "waiting"; z.actionType = "HOLD"; z.stateTimer = CHECK_INTERVAL;
        }
      }
    }

    function lockExpand(sec = 20) {
      z.expandLockedSec = Math.max(z.expandLockedSec, sec);
    }

    function isOutside(px, py) { return dist(px, py, z.cx, z.cy) > z.radius; }

    return { data: z, stepFrame, tickSecond, lockExpand, isOutside };
  }

  return { create };
})();
