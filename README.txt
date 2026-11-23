DEVILinZONE (v11 — BUG FIXES)
=============================
1. Fixed false "ROOM NOT FOUND!" bug by pre-reading Firebase room before atomic transaction; host leaving shifts host to next player, and if no host/player remains the room is completely removed from Firebase.
2. Map character markers now show ONLY the pixel character sprites (no name tags).
3. REAL-WORLD ARENA lineup in Lobby smoothly switches the 4 outer characters' positions every 2.2s while keeping DEVIL? fixed in the center.
4. Zone-only joining: Host locks zone GPS on room creation, and joining players' GPS distance is validated so only players inside the zone radius can join.
