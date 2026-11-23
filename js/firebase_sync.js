/* =========================================================
   DEVILinZONE — AUTHORITATIVE MULTIPLAYER LIFECYCLE ENGINE (v10)
   Fixes:
   - Bug 1: Strict Room Lifecycle (WAITING | STARTING | IN_MATCH | CLOSED)
            Unique roomInstanceId, atomic create/join/leave/host-transfer
   - Bug 2: Strict Player Lifecycle (LOBBY | PLAYING | DISCONNECTED | LEFT | ELIMINATED | EXPIRED)
            Intentional leave immediately removes player from active gameplay
   - Bug 3: 180-Second (3-Minute) Reconnection Grace Period
            Server-time-based validation, restores exact player/match/timers/zone
   - Bug 4: Strict Match Lifecycle (READY | STARTING | ACTIVE | ENDED | CANCELLED)
            Unique matchId, atomic start, Match Again blocked while ACTIVE
   ========================================================= */
window.ZP_SYNC = (function () {
  let db = null;
  let enabled = false;
  let serverTimeOffset = 0;
  let roomRef = null;
  let connectedRef = null;
  let onDisconnectRef = null;
  let activeListenCode = "";
  let lastGpsWrite = 0;
  let lastStateWrite = 0;

  const WRITE_INTERVAL_MS = 2000;
  const RECONNECT_GRACE_MS = 180000; // Exact 3 minutes (180s)

  function nowServer() {
    return Date.now() + serverTimeOffset;
  }

  function isConfigured() {
    const cfg = window.ZP_FIREBASE_CONFIG;
    return !!(cfg && cfg.databaseURL && cfg.databaseURL.startsWith("https://"));
  }

  function init(onReady) {
    if (!isConfigured()) {
      enabled = false;
      if (onReady) onReady(false);
      return;
    }
    if (window.firebase && window.firebase.database) {
      bootApp(onReady);
      return;
    }
    const s1 = document.createElement("script");
    s1.src = "https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js";
    s1.onload = () => {
      const s2 = document.createElement("script");
      s2.src = "https://www.gstatic.com/firebasejs/10.12.2/firebase-database-compat.js";
      s2.onload = () => bootApp(onReady);
      s2.onerror = () => { enabled = false; if (onReady) onReady(false); };
      document.head.appendChild(s2);
    };
    s1.onerror = () => { enabled = false; if (onReady) onReady(false); };
    document.head.appendChild(s1);
  }

  function bootApp(onReady) {
    try {
      if (!firebase.apps.length) firebase.initializeApp(window.ZP_FIREBASE_CONFIG);
      db = firebase.database();
      enabled = true;
      // Track Firebase server time offset for tamper-proof 180s expiry checks
      db.ref(".info/serverTimeOffset").on("value", snap => {
        serverTimeOffset = snap.val() || 0;
      });
      if (onReady) onReady(true);
    } catch (e) {
      enabled = false;
      if (onReady) onReady(false);
    }
  }

  function haversineMeters(lat1, lng1, lat2, lng2) {
    const R = 6371000;
    const toRad = d => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function isEligibleHost(p) {
    return p && !p.isBot && (p.status === "LOBBY" || p.status === "PLAYING");
  }

  function isActiveInRoom(p) {
    return p && (p.status === "LOBBY" || p.status === "PLAYING" || p.status === "DISCONNECTED" || p.status === "ELIMINATED");
  }

  function pickNextHostId(playersMap, excludeId) {
    if (!playersMap) return null;
    const list = Object.values(playersMap)
      .filter(p => p && p.id !== excludeId && isEligibleHost(p))
      .sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0));
    return list.length ? list[0].id : null;
  }

  // ---------------------------------------------------------
  // 1. ATOMIC ROOM CREATION (Handles Code Collisions Safely!)
  // ---------------------------------------------------------
  function createRoom(state, hostPlayer, cb, attempt = 0) {
    if (!enabled || !db) { if (cb) cb(false, "Offline"); return; }
    if (attempt > 6) { if (cb) cb(false, "COULD NOT ALLOCATE ROOM CODE"); return; }

    const roomCode = window.ZP_STATE.randCode(4);
    const roomInstanceId = window.ZP_STATE.genUniqueId("ri");
    const createdAt = nowServer();
    const ref = db.ref("rooms/" + roomCode);

    ref.transaction(current => {
      // Never overwrite an active room! Only allow if missing or previously CLOSED.
      if (current && current.meta && current.meta.status !== "CLOSED") {
        return; // Abort transaction -> retry with a fresh code
      }
      const players = {};
      players[hostPlayer.id] = {
        id: hostPlayer.id,
        name: hostPlayer.name,
        isHost: true,
        isBot: false,
        status: "LOBBY",
        role: "pending",
        alive: true,
        ready: true,
        catchCode: hostPlayer.catchCode,
        spriteIdx: hostPlayer.spriteIdx || 0,
        x: 0, y: 0,
        joinedAt: createdAt,
        updatedAt: createdAt
      };
      return {
        meta: {
          code: roomCode,
          roomInstanceId,
          hostId: hostPlayer.id,
          status: "WAITING",
          durationMin: state.durationMin || 15,
          maxPlayers: Math.max(3, Math.min(8, state.maxPlayers || 5)),
          startRadius: state.startRadius || 150,
          fastTimers: !!state.fastTimers,
          currentMatchId: "",
          createdAt
        },
        arenaMap: state.arenaMap || {},
        players
      };
    }, (err, committed, snap) => {
      if (err) { if (cb) cb(false, err.message); return; }
      if (!committed) {
        // Collision with an active room -> retry with a new random code
        createRoom(state, hostPlayer, cb, attempt + 1);
        return;
      }
      if (cb) cb(true, { roomCode, roomInstanceId, room: snap.val() });
    });
  }

  // ---------------------------------------------------------
  // 2. ATOMIC ROOM JOIN (Fixes false ROOM NOT FOUND + Enforces Zone Check!)
  // ---------------------------------------------------------
  function joinRoomAsPlayer(roomCode, playerObj, userCoords, cb) {
    if (typeof userCoords === "function") { cb = userCoords; userCoords = null; }
    if (!enabled || !db) { if (cb) cb(false, "Offline"); return; }
    const ref = db.ref("rooms/" + roomCode);

    // Pre-read from server first so Firebase cache is warm & never aborts on initial null!
    ref.once("value").then(preSnap => {
      const preRoom = preSnap.val();
      if (!preRoom || !preRoom.meta) {
        if (cb) cb(false, "ROOM NOT FOUND!");
        return;
      }
      if (preRoom.meta.status === "CLOSED") {
        if (cb) cb(false, "ROOM IS CLOSED!");
        return;
      }
      if (preRoom.meta.status !== "WAITING") {
        if (cb) cb(false, "MATCH ALREADY STARTED!");
        return;
      }

      // FIX #4: Only players physically inside the room's zone can join!
      const am = preRoom.arenaMap;
      const zoneR = preRoom.meta.startRadius || 150;
      if (am && typeof am.anchorLat === "number" && typeof am.anchorLng === "number") {
        if (!userCoords || typeof userCoords.lat !== "number" || typeof userCoords.lng !== "number") {
          if (cb) cb(false, "GPS ON KARO — ZONE CHECK ZAROORI HAI!");
          return;
        }
        const distM = Math.round(haversineMeters(userCoords.lat, userCoords.lng, am.anchorLat, am.anchorLng));
        if (distM > zoneR) {
          if (cb) cb(false, `ZONE KE BAHAR HO! (${distM}m door, max ${zoneR}m)`);
          return;
        }
      }

      let rejectReason = "";
      ref.transaction(room => {
        if (room === null) return room; // Wait for server value if cache cleared
        rejectReason = "";
        if (!room.meta) { rejectReason = "ROOM NOT FOUND!"; return; }
        if (room.meta.status === "CLOSED") { rejectReason = "ROOM IS CLOSED!"; return; }
        if (room.meta.status !== "WAITING") { rejectReason = "MATCH ALREADY STARTED!"; return; }

        if (!room.players) room.players = {};
        const activeCount = Object.values(room.players).filter(isActiveInRoom).length;
        const alreadyIn = room.players[playerObj.id] && isActiveInRoom(room.players[playerObj.id]);
        if (!alreadyIn && activeCount >= (room.meta.maxPlayers || 8)) {
          rejectReason = "ROOM IS FULL!";
          return;
        }

        const now = nowServer();
        room.players[playerObj.id] = {
          id: playerObj.id,
          name: playerObj.name,
          isHost: room.meta.hostId === playerObj.id,
          isBot: false,
          status: "LOBBY",
          role: "pending",
          alive: true,
          ready: false,
          catchCode: playerObj.catchCode,
          spriteIdx: playerObj.spriteIdx || 1,
          x: 0, y: 0,
          joinedAt: (room.players[playerObj.id] && room.players[playerObj.id].joinedAt) || now,
          updatedAt: now
        };
        return room;
      }, (err, committed, snap) => {
        if (err) { if (cb) cb(false, err.message); return; }
        if (!committed || !snap.val()) { if (cb) cb(false, rejectReason || "COULD NOT JOIN ROOM!"); return; }
        const val = snap.val();
        if (cb) cb(true, { roomCode, roomInstanceId: val.meta.roomInstanceId, room: val });
      });
    }).catch(err => {
      if (cb) cb(false, (err && err.message) || "NETWORK ERROR!");
    });
  }

  // ---------------------------------------------------------
  // 3. PRESENCE & ACCIDENTAL DISCONNECT (180s Grace Window!)
  // ---------------------------------------------------------
  function bindPresence(roomCode, roomInstanceId, playerId, activeStatus = "LOBBY") {
    if (!enabled || !db || !roomCode || !playerId) return;
    unbindPresence();

    const pRef = db.ref(`rooms/${roomCode}/players/${playerId}`);
    connectedRef = db.ref(".info/connected");
    connectedRef.on("value", snap => {
      if (snap.val() !== true) return;
      // Validate roomInstanceId before arming onDisconnect
      db.ref(`rooms/${roomCode}/meta/roomInstanceId`).once("value").then(riSnap => {
        if (riSnap.val() !== roomInstanceId) return;
        onDisconnectRef = pRef.onDisconnect();
        onDisconnectRef.update({
          status: "DISCONNECTED",
          disconnectedAt: firebase.database.ServerValue.TIMESTAMP
        }).then(() => {
          // Mark connected & cancel any prior disconnection timestamp
          pRef.update({
            status: activeStatus,
            disconnectedAt: null,
            reconnectExpiresAt: null,
            updatedAt: nowServer()
          }).catch(() => {});
        }).catch(() => {});
      }).catch(() => {});
    });
  }

  function unbindPresence(cancelServerHook = false) {
    if (connectedRef) { connectedRef.off(); connectedRef = null; }
    if (onDisconnectRef) {
      if (cancelServerHook) {
        try { onDisconnectRef.cancel(); } catch (e) {}
      }
      onDisconnectRef = null;
    }
  }

  // Called on accidental backgrounding / pagehide (NOT intentional exit)
  function markTemporaryDisconnect(roomCode, roomInstanceId, playerId) {
    if (!enabled || !db || !roomCode || !playerId) return;
    const now = nowServer();
    db.ref(`rooms/${roomCode}/players/${playerId}`).transaction(p => {
      if (!p || p.status === "LEFT" || p.status === "EXPIRED") return;
      p.status = "DISCONNECTED";
      p.disconnectedAt = p.disconnectedAt || now;
      p.reconnectExpiresAt = p.disconnectedAt + RECONNECT_GRACE_MS;
      return p;
    }).catch(() => {});
  }

  // ---------------------------------------------------------
  // 4. INTENTIONAL LEAVE (Bug 1 & Bug 2: Marks LEFT, Transfers Host or Closes Room!)
  // ---------------------------------------------------------
  function leaveRoomIntentionally(roomCode, roomInstanceId, playerId, cb) {
    unbindPresence(true);
    leaveRoomListener();
    if (!enabled || !db || !roomCode || !playerId) { if (cb) cb(true); return; }

    const ref = db.ref("rooms/" + roomCode);
    ref.transaction(room => {
      if (!room || !room.meta || room.meta.roomInstanceId !== roomInstanceId) return;
      if (room.meta.status === "CLOSED") return;

      const now = nowServer();
      if (room.players && room.players[playerId]) {
        room.players[playerId].status = "LEFT";
        room.players[playerId].alive = false;
        room.players[playerId].isHost = false;
        room.players[playerId].leftAt = now;
        room.players[playerId].disconnectedAt = null;
        room.players[playerId].reconnectExpiresAt = null;
      }

      // Check remaining eligible human players
      const nextHostId = pickNextHostId(room.players, playerId);
      const anyReconnectable = Object.values(room.players || {}).some(
        p => p && !p.isBot && (p.status === "LOBBY" || p.status === "PLAYING" || p.status === "DISCONNECTED")
      );

      if (room.meta.hostId === playerId) {
        if (nextHostId) {
          // Shift host immediately to the next connected player!
          room.meta.hostId = nextHostId;
          if (room.players[nextHostId]) {
            room.players[nextHostId].isHost = true;
            room.players[nextHostId].ready = true;
          }
        } else if (!anyReconnectable) {
          // No host / no players left -> REMOVE room completely from Firebase!
          return null;
        }
      } else if (!anyReconnectable) {
        return null;
      }

      return room;
    }, () => { if (cb) cb(true); });
  }

  // ---------------------------------------------------------
  // 5. ATOMIC MATCH START (Bug 4: Only 1 ACTIVE Match per Room Instance!)
  // ---------------------------------------------------------
  function startMatchHost(roomCode, roomInstanceId, hostId, devilId, arenaMap, cb) {
    if (!enabled || !db) { if (cb) cb(false, "Offline"); return; }
    const ref = db.ref("rooms/" + roomCode);
    let failReason = "";

    ref.transaction(room => {
      failReason = "";
      if (!room || !room.meta || room.meta.roomInstanceId !== roomInstanceId) {
        failReason = "ROOM EXPIRED!";
        return;
      }
      if (room.meta.status === "CLOSED") {
        failReason = "ROOM IS CLOSED!";
        return;
      }
      if (room.meta.hostId !== hostId) {
        failReason = "ONLY HOST CAN START!";
        return;
      }
      // Prevent duplicate active matches if Start is tapped simultaneously!
      if (room.meta.status !== "WAITING" || (room.match && (room.match.status === "ACTIVE" || room.match.status === "STARTING"))) {
        failReason = "MATCH ALREADY ACTIVE!";
        return;
      }

      const activePlayers = Object.values(room.players || {}).filter(p => p && (p.status === "LOBBY" || p.isBot));
      if (activePlayers.length < 3) {
        failReason = "MIN 3 PLAYERS NEEDED!";
        return;
      }

      const now = nowServer();
      const matchId = window.ZP_STATE.genUniqueId("m");
      const chosenDevilId = (room.players && room.players[devilId]) ? devilId : activePlayers[0].id;

      Object.values(room.players).forEach(p => {
        if (!p) return;
        if (p.status === "LOBBY" || p.isBot) {
          p.status = "PLAYING";
          p.alive = true;
          p.role = (p.id === chosenDevilId) ? "devil" : "hider";
          p.disconnectedAt = null;
          p.reconnectExpiresAt = null;
        }
      });

      room.meta.status = "IN_MATCH";
      room.meta.currentMatchId = matchId;
      if (arenaMap && arenaMap.ready) room.arenaMap = arenaMap;

      room.match = {
        matchId,
        roomInstanceId,
        status: "ACTIVE",
        devilId: chosenDevilId,
        createdAt: now,
        startedAt: now,
        endedAt: null,
        phase: "intro",
        matchSecLeft: (room.meta.durationMin || 15) * 60,
        hideSecLeft: 60,
        radarRevealed: false,
        radarTimer: room.meta.fastTimers ? 20 : 180,
        zone: {
          cx: 0, cy: 0,
          radius: room.meta.startRadius || 150,
          targetCx: 0, targetCy: 0,
          targetRadius: room.meta.startRadius || 150,
          state: "waiting",
          actionType: "HOLD",
          stateTimer: room.meta.fastTimers ? 14 : 45,
          centerShiftTimer: room.meta.fastTimers ? 45 : 600,
          expandsUsed: 0
        }
      };
      return room;
    }, (err, committed, snap) => {
      if (err) { if (cb) cb(false, err.message); return; }
      if (!committed) { if (cb) cb(false, failReason || "COULD NOT START!"); return; }
      const val = snap.val();
      if (cb) cb(true, { matchId: val.match.matchId, devilId: val.match.devilId, room: val });
    });
  }

  // ---------------------------------------------------------
  // 6. ATOMIC MATCH END & SAFE "MATCH AGAIN" (Bug 4)
  // ---------------------------------------------------------
  function endMatchHost(roomCode, roomInstanceId, matchId, winnerTitle, winnerDesc) {
    if (!enabled || !db || !roomCode || !matchId) return;
    db.ref(`rooms/${roomCode}`).transaction(room => {
      if (!room || !room.meta || room.meta.roomInstanceId !== roomInstanceId) return;
      if (!room.match || room.match.matchId !== matchId) return;
      if (room.match.status === "ENDED") return;
      room.match.status = "ENDED";
      room.match.endedAt = nowServer();
      room.match.winnerTitle = winnerTitle;
      room.match.winnerDesc = winnerDesc;
      return room;
    }).catch(() => {});
  }

  // Match Again: ONLY transitions ENDED match back to WAITING; NEVER creates duplicate during ACTIVE!
  function requestMatchAgain(roomCode, roomInstanceId, playerId, cb) {
    if (!enabled || !db || !roomCode) { if (cb) cb("OFFLINE"); return; }
    let outcome = "FAILED";

    db.ref(`rooms/${roomCode}`).transaction(room => {
      if (!room || !room.meta || room.meta.roomInstanceId !== roomInstanceId) {
        outcome = "ROOM_CLOSED";
        return;
      }
      if (room.meta.status === "CLOSED") {
        outcome = "ROOM_CLOSED";
        return;
      }
      if (room.match && room.match.status === "ACTIVE") {
        outcome = "MATCH_STILL_ACTIVE";
        return;
      }
      if (room.meta.status === "WAITING") {
        outcome = "READY_IN_LOBBY";
        return;
      }
      // Match is ENDED or CANCELLED -> reset room cleanly to WAITING for next match
      if (room.match && (room.match.status === "ENDED" || room.match.status === "CANCELLED")) {
        room.meta.status = "WAITING";
        room.meta.currentMatchId = "";
        if (room.players) {
          Object.values(room.players).forEach(p => {
            if (p && (p.status === "PLAYING" || p.status === "ELIMINATED")) {
              p.status = "LOBBY";
              p.role = "pending";
              p.alive = true;
              p.ready = !!p.isHost || !!p.isBot;
            }
          });
        }
        outcome = "RESET_TO_LOBBY";
        return room;
      }
      return;
    }, (err, committed, snap) => {
      if (err) { if (cb) cb("ERROR"); return; }
      if (cb) cb(outcome, snap ? snap.val() : null);
    });
  }

  // ---------------------------------------------------------
  // 7. 3-MINUTE RECONNECTION VALIDATION & RESTORE (Bug 3)
  // ---------------------------------------------------------
  function checkAndReconnectSession(savedSession, cb) {
    if (!enabled || !db || !savedSession || !savedSession.roomCode || !savedSession.roomInstanceId) {
      if (cb) cb({ status: "NONE" });
      return;
    }

    const { roomCode, roomInstanceId, matchId, playerId } = savedSession;
    const ref = db.ref("rooms/" + roomCode);

    ref.once("value").then(snap => {
      const room = snap.val();
      if (!room || !room.meta || room.meta.roomInstanceId !== roomInstanceId || room.meta.status === "CLOSED") {
        if (cb) cb({ status: "CLOSED" });
        return;
      }

      const me = room.players && room.players[playerId];
      if (!me || me.status === "LEFT" || me.status === "EXPIRED") {
        if (cb) cb({ status: "LEFT_OR_EXPIRED" });
        return;
      }

      // If match already ended, show the End Screen instead of resuming gameplay!
      if (room.match && room.match.status === "ENDED") {
        if (cb) cb({ status: "MATCH_ENDED", room });
        return;
      }

      // Check 180-second reconnection expiry timestamp
      const now = nowServer();
      if (me.status === "DISCONNECTED") {
        const discAt = me.disconnectedAt || 0;
        const expiresAt = me.reconnectExpiresAt || (discAt + RECONNECT_GRACE_MS);
        if (discAt > 0 && now > expiresAt) {
          // Atomically mark EXPIRED in Firebase
          db.ref(`rooms/${roomCode}/players/${playerId}`).update({
            status: "EXPIRED",
            alive: false
          }).catch(() => {});
          if (cb) cb({ status: "EXPIRED" });
          return;
        }
      }

      // If still in WAITING lobby -> reconnect to lobby
      if (room.meta.status === "WAITING") {
        db.ref(`rooms/${roomCode}/players/${playerId}`).update({
          status: "LOBBY",
          disconnectedAt: null,
          reconnectExpiresAt: null,
          updatedAt: now
        }).then(() => {
          if (cb) cb({ status: "RECONNECT_LOBBY", room });
        }).catch(() => { if (cb) cb({ status: "NONE" }); });
        return;
      }

      // Active match reconnection: validate matchId matches!
      if (room.match && room.match.status === "ACTIVE" && (!matchId || room.match.matchId === matchId)) {
        const restoredStatus = me.alive ? "PLAYING" : "ELIMINATED";
        db.ref(`rooms/${roomCode}/players/${playerId}`).update({
          status: restoredStatus,
          disconnectedAt: null,
          reconnectExpiresAt: null,
          updatedAt: now
        }).then(() => {
          if (cb) cb({ status: "RECONNECT_MATCH", room });
        }).catch(() => { if (cb) cb({ status: "NONE" }); });
        return;
      }

      if (cb) cb({ status: "NONE" });
    }).catch(() => { if (cb) cb({ status: "NONE" }); });
  }

  // ---------------------------------------------------------
  // 8. HOST PERIODIC SWEEP: EXPIRE >180s DISCONNECTED PLAYERS & TRANSFER HOST
  // ---------------------------------------------------------
  function sweepExpiredPlayers(roomCode, roomInstanceId) {
    if (!enabled || !db || !roomCode || !roomInstanceId) return;
    const now = nowServer();
    db.ref("rooms/" + roomCode).transaction(room => {
      if (!room || !room.meta || room.meta.roomInstanceId !== roomInstanceId || room.meta.status === "CLOSED") return;
      if (!room.players) return;

      let changed = false;
      Object.values(room.players).forEach(p => {
        if (!p || p.isBot) return;
        if (p.status === "DISCONNECTED" && p.disconnectedAt) {
          const exp = p.reconnectExpiresAt || (p.disconnectedAt + RECONNECT_GRACE_MS);
          if (now > exp) {
            p.status = "EXPIRED";
            p.alive = false;
            p.isHost = false;
            changed = true;
          }
        }
      });

      // If host is DISCONNECTED/EXPIRED/LEFT, transfer host or remove empty room
      const currentHost = room.players[room.meta.hostId];
      if (!currentHost || !isEligibleHost(currentHost)) {
        const nextHostId = pickNextHostId(room.players, room.meta.hostId);
        if (nextHostId) {
          room.meta.hostId = nextHostId;
          room.players[nextHostId].isHost = true;
          room.players[nextHostId].ready = true;
          changed = true;
        } else {
          const anyLeft = Object.values(room.players).some(
            p => p && !p.isBot && (p.status === "LOBBY" || p.status === "PLAYING" || p.status === "DISCONNECTED")
          );
          if (!anyLeft) return null;
        }
      }

      return changed ? room : undefined;
    }).catch(() => {});
  }

  // ---------------------------------------------------------
  // 9. ROOM LISTENER & STALE-INSTANCE-PROTECTED WRITES
  // ---------------------------------------------------------
  function joinRoomListener(roomCode, onRoomUpdate) {
    if (!enabled || !db) return;
    leaveRoomListener();
    activeListenCode = roomCode;
    roomRef = db.ref("rooms/" + roomCode);
    roomRef.on("value", snap => {
      const val = snap.val();
      if (onRoomUpdate) onRoomUpdate(val);
    });
  }

  function leaveRoomListener() {
    if (roomRef) { roomRef.off(); roomRef = null; }
    activeListenCode = "";
  }

  function setPlayerReady(roomCode, roomInstanceId, playerId, isReady) {
    if (!enabled || !db) return;
    db.ref(`rooms/${roomCode}/meta/roomInstanceId`).once("value").then(s => {
      if (s.val() !== roomInstanceId) return;
      db.ref(`rooms/${roomCode}/players/${playerId}/ready`).set(!!isReady).catch(() => {});
    }).catch(() => {});
  }

  function pushMyLocation(roomCode, roomInstanceId, playerId, data, force = false) {
    if (!enabled || !db) return;
    const now = Date.now();
    if (!force && now - lastGpsWrite < WRITE_INTERVAL_MS) return;
    lastGpsWrite = now;
    db.ref(`rooms/${roomCode}/players/${playerId}`).transaction(p => {
      if (!p || p.status === "LEFT" || p.status === "EXPIRED") return;
      p.x = Math.round(data.x);
      p.y = Math.round(data.y);
      p.cloaked = !!data.cloaked;
      p.updatedAt = nowServer();
      return p;
    }).catch(() => {});
  }

  function pushHostState(roomCode, roomInstanceId, matchId, hostPayload, force = false) {
    if (!enabled || !db || !matchId) return;
    const now = Date.now();
    if (!force && now - lastStateWrite < WRITE_INTERVAL_MS) return;
    lastStateWrite = now;
    db.ref(`rooms/${roomCode}/match`).transaction(m => {
      if (!m || m.matchId !== matchId || m.roomInstanceId !== roomInstanceId || m.status !== "ACTIVE") return;
      m.phase = hostPayload.phase;
      m.matchSecLeft = hostPayload.matchSecLeft;
      m.hideSecLeft = hostPayload.hideSecLeft;
      m.radarRevealed = !!hostPayload.radarRevealed;
      m.radarTimer = hostPayload.radarTimer;
      m.zone = hostPayload.zone;
      m.syncedAt = nowServer();
      return m;
    }).catch(() => {});
  }

  function pushCatchEvent(roomCode, roomInstanceId, matchId, targetId, reason, victimName, victimSpriteIdx) {
    if (!enabled || !db) return;
    db.ref(`rooms/${roomCode}`).transaction(room => {
      if (!room || !room.meta || room.meta.roomInstanceId !== roomInstanceId) return;
      if (!room.match || room.match.matchId !== matchId || room.match.status !== "ACTIVE") return;
      if (room.players && room.players[targetId]) {
        room.players[targetId].alive = false;
        room.players[targetId].status = "ELIMINATED";
        room.players[targetId].eliminatedAt = nowServer();
      }
      room.lastEvent = {
        type: "elim",
        text: reason,
        victimName: victimName || "HIDER",
        victimSpriteIdx: victimSpriteIdx || 0,
        ts: nowServer()
      };
      return room;
    }).catch(() => {});
  }

  function pushGhostAlert(roomCode, fromName, x, y) {
    if (!enabled || !db) return;
    db.ref(`rooms/${roomCode}/ghostPing`).set({
      from: fromName, x: Math.round(x), y: Math.round(y), ts: nowServer()
    }).catch(() => {});
  }

  return {
    RECONNECT_GRACE_MS,
    nowServer,
    isConfigured,
    isEnabled: () => enabled,
    init,
    createRoom,
    joinRoomAsPlayer,
    bindPresence,
    unbindPresence,
    markTemporaryDisconnect,
    leaveRoomIntentionally,
    startMatchHost,
    endMatchHost,
    requestMatchAgain,
    checkAndReconnectSession,
    sweepExpiredPlayers,
    joinRoomListener,
    leaveRoomListener,
    setPlayerReady,
    pushMyLocation,
    pushHostState,
    pushCatchEvent,
    pushGhostAlert
  };
})();
