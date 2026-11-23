DEVILinZONE (v10 — MULTIPLAYER LIFECYCLE & RECONNECTION FIXED)
==============================================================

Critical Multiplayer Fixes Implemented:
1. Strict Room Lifecycle (WAITING | STARTING | IN_MATCH | CLOSED):
   - Every room has a unique `roomInstanceId` + `createdAt` + atomic collision-safe `createRoom()`.
   - `CLOSED` rooms can NEVER be reopened or rejoined with an old code.
   - Host leaving atomically transfers `hostId` to the next connected human player or closes the room.
2. Accurate Player Lifecycle (LOBBY | PLAYING | DISCONNECTED | LEFT | ELIMINATED | EXPIRED):
   - Intentional exit marks player `LEFT`, removes them immediately from active gameplay/HUD/markers/win checks, and stops GPS sync.
3. 180-Second (3-Minute) Reconnection Grace Period:
   - Accidental exit / Back / Refresh / Background marks `DISCONNECTED` with `disconnectedAt` + `reconnectExpiresAt` (180s).
   - Reopening within 180s restores the exact player ID, role, matchId, timers, and zone without duplicating players or rerolling Devil.
   - After 180s, player is atomically marked `EXPIRED` and cannot rejoin.
4. Strict Match Lifecycle (READY | STARTING | ACTIVE | ENDED | CANCELLED):
   - Only 1 `ACTIVE` match per room instance (atomic `startMatchHost()` transaction).
   - `PLAY AGAIN` checks Firebase authoritative `match.status === "ENDED"` — never creates a duplicate match while an active match is running.
5. Updated `firebase_rules.json`:
   - Paste into Firebase Console -> Realtime Database -> Rules -> Publish.
