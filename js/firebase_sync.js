/* =========================================================
   DEVILinZONE — LIVE FIREBASE RTDB MULTIPLAYER SYNC
   - Create Room / Join Room across 3–8 Android phones
   - Synced Start + Shared Random Devil Index
   - Host-Authoritative Zone & Radar Timers
   - 2-second Throttled GPS & State Writes (Zero Lag / Low Reads)
   ========================================================= */
window.ZP_SYNC = (function () {
  let db = null;
  let enabled = false;
  let roomRef = null;
  let lastGpsWrite = 0;
  let lastStateWrite = 0;
  const WRITE_INTERVAL_MS = 2000;

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
      if (onReady) onReady(true);
    } catch (e) {
      enabled = false;
      if (onReady) onReady(false);
    }
  }

  // Host creates a live room in Firebase RTDB
  function createRoom(roomCode, state, hostPlayer, cb) {
    if (!enabled || !db) { if (cb) cb(false, "Offline"); return; }
    const payload = {
      meta: {
        hostId: hostPlayer.id,
        status: "lobby",
        durationMin: state.durationMin || 15,
        maxPlayers: state.maxPlayers || 5,
        startRadius: state.startRadius || 150,
        fastTimers: !!state.fastTimers,
        devilId: "",
        createdAt: Date.now()
      },
      arenaMap: state.arenaMap || {},
      players: {}
    };
    payload.players[hostPlayer.id] = {
      id: hostPlayer.id,
      name: hostPlayer.name,
      isHost: true,
      isBot: false,
      role: "pending",
      alive: true,
      catchCode: hostPlayer.catchCode,
      spriteIdx: hostPlayer.spriteIdx || 0,
      x: 0, y: 0,
      joinedAt: Date.now()
    };
    db.ref("rooms/" + roomCode).set(payload)
      .then(() => { if (cb) cb(true); })
      .catch(err => { if (cb) cb(false, err && err.message); });
  }

  // Friend joins an existing live room in Firebase RTDB
  function joinRoomAsPlayer(roomCode, playerObj, cb) {
    if (!enabled || !db) { if (cb) cb(false, "Offline"); return; }
    const ref = db.ref("rooms/" + roomCode);
    ref.once("value").then(snap => {
      const room = snap.val();
      if (!room || !room.meta) {
        if (cb) cb(false, "ROOM NOT FOUND!");
        return;
      }
      const existing = room.players ? Object.keys(room.players).length : 0;
      if (existing >= (room.meta.maxPlayers || 8) && !(room.players && room.players[playerObj.id])) {
        if (cb) cb(false, "ROOM IS FULL!");
        return;
      }
      ref.child("players/" + playerObj.id).set({
        id: playerObj.id,
        name: playerObj.name,
        isHost: false,
        isBot: false,
        role: "pending",
        alive: true,
        catchCode: playerObj.catchCode,
        spriteIdx: playerObj.spriteIdx || 1,
        x: 0, y: 0,
        joinedAt: Date.now()
      }).then(() => { if (cb) cb(true, room); })
        .catch(err => { if (cb) cb(false, err && err.message); });
    }).catch(err => { if (cb) cb(false, err && err.message); });
  }

  // Host adds a bot to Firebase room
  function addBotToRoom(roomCode, botObj) {
    if (!enabled || !db) return;
    db.ref(`rooms/${roomCode}/players/${botObj.id}`).set({
      id: botObj.id, name: botObj.name, isHost: false, isBot: true,
      role: "pending", alive: true, catchCode: botObj.catchCode,
      spriteIdx: botObj.spriteIdx || 1, x: 0, y: 0, joinedAt: Date.now()
    }).catch(() => {});
  }

  function removePlayerFromRoom(roomCode, playerId) {
    if (!enabled || !db) return;
    db.ref(`rooms/${roomCode}/players/${playerId}`).remove().catch(() => {});
  }

  // Host starts the match -> writes shared devilId & status='playing' so ALL phones launch together!
  function startMatchHost(roomCode, devilId, arenaMap) {
    if (!enabled || !db) return Promise.resolve(false);
    return db.ref("rooms/" + roomCode).update({
      "meta/status": "playing",
      "meta/devilId": devilId,
      "meta/startedAt": Date.now(),
      "arenaMap": arenaMap || {}
    }).then(() => true).catch(() => false);
  }

  function joinRoom(roomCode, onRoomUpdate) {
    if (!enabled || !db) return;
    leaveRoom();
    roomRef = db.ref("rooms/" + roomCode);
    roomRef.on("value", snap => {
      const val = snap.val();
      if (val && onRoomUpdate) onRoomUpdate(val);
    });
  }

  function leaveRoom() {
    if (roomRef) { roomRef.off(); roomRef = null; }
  }

  function pushMyLocation(roomCode, playerId, data, force = false) {
    if (!enabled || !db) return;
    const now = Date.now();
    if (!force && now - lastGpsWrite < WRITE_INTERVAL_MS) return;
    lastGpsWrite = now;
    db.ref(`rooms/${roomCode}/players/${playerId}`).update({
      x: Math.round(data.x),
      y: Math.round(data.y),
      alive: !!data.alive,
      cloaked: !!data.cloaked,
      updatedAt: now
    }).catch(() => {});
  }

  function pushHostState(roomCode, hostPayload, force = false) {
    if (!enabled || !db) return;
    const now = Date.now();
    if (!force && now - lastStateWrite < WRITE_INTERVAL_MS) return;
    lastStateWrite = now;
    db.ref(`rooms/${roomCode}/gameState`).set({ ...hostPayload, syncedAt: now }).catch(() => {});
  }

  function setPlayerReady(roomCode, playerId, isReady) {
    if (!enabled || !db) return;
    db.ref(`rooms/${roomCode}/players/${playerId}/ready`).set(!!isReady).catch(() => {});
  }

  function pushCatchEvent(roomCode, targetId, reason, victimName, victimSpriteIdx) {
    if (!enabled || !db) return;
    db.ref(`rooms/${roomCode}/players/${targetId}/alive`).set(false).catch(() => {});
    db.ref(`rooms/${roomCode}/lastEvent`).set({
      type: "elim",
      text: reason,
      victimName: victimName || "HIDER",
      victimSpriteIdx: victimSpriteIdx || 0,
      ts: Date.now()
    }).catch(() => {});
  }

  function pushGhostAlert(roomCode, fromName, x, y) {
    if (!enabled || !db) return;
    db.ref(`rooms/${roomCode}/ghostPing`).set({ from: fromName, x: Math.round(x), y: Math.round(y), ts: Date.now() }).catch(() => {});
  }

  return {
    isConfigured,
    isEnabled: () => enabled,
    init,
    createRoom,
    joinRoomAsPlayer,
    addBotToRoom,
    removePlayerFromRoom,
    startMatchHost,
    joinRoom,
    leaveRoom,
    pushMyLocation,
    pushHostState,
    setPlayerReady,
    pushCatchEvent,
    pushGhostAlert
  };
})();
