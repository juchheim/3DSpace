# World Skins Phase A — Demo Script

Companion to [`ROOM_OBJECT_DEMO_SCRIPT.md`](./ROOM_OBJECT_DEMO_SCRIPT.md).  
Concept: [`CONCEPT_WORLD_SKINS_PHASE_A.md`](./CONCEPT_WORLD_SKINS_PHASE_A.md).  
Status matrix: [`docs/planning/mvp+1/MVP_PLUS_ONE_STATUS.md`](../mvp+1/MVP_PLUS_ONE_STATUS.md).

**Audience:** Internal teacher demo / district sales call.  
**Runtime:** ~90 seconds.  
**Prerequisites:**
- `ENABLE_WORLD_SKINS=true` + `NEXT_PUBLIC_ENABLE_WORLD_SKINS=true` in staging.
- Five v1 asset packs uploaded to R2 (`world-skins/<slug>/v1/...`).
- Teacher tab open to an active classroom (≥ 1 student connected).

---

## Beat-by-beat (90 s)

### 0:00 — Default theater (5 s)
Open the teacher tab. Point out the familiar gray-green theater.  
"This is the default classroom. Students know exactly where they are."

### 0:05 — Environment card (5 s)
Expand the **Environment** card in the right HUD column.  
"The Environment card lets me set the mood for the whole class in one click — without changing any layouts, boards, or lesson steps."

### 0:10 — Mars Surface (20 s)
Click **Change…**. The picker grid opens with all five skins.  
Select **Mars Surface**.

- Walls, floor, and sky shift to the red Martian panorama.  
- Point out the warm directional light and atmospheric haze.  
- Walk slowly: "Notice the movement feels heavier — lower gravity, just like Mars."
- Point to the student tab: "Every student crossfaded to the same environment automatically."

### 0:30 — Student perspective (10 s)
Switch to the student tab.  
"Students see the 'Environment: Mars Surface' banner briefly — then it's gone. No UI clutter."

### 0:40 — Cell Interior + avatar scale (15 s)
Switch back to the teacher tab. Open the picker again.  
Select **Cell Interior**.

- "Now we're inside a living cell. Avatars scale down so the organelle walls loom over students."  
- Point out the blue/green lighting and scaled avatars.

### 0:55 — Roman Forum + day/night (15 s)
Select **Roman Forum**.

- "Ancient Rome. The Lighting row appears — only here — because the Forum has a night preset."
- Switch the **Lighting** select to **Night**.  
- "Torchlight ambiance. Perfect for a history presentation."
- Switch back to **Day** in two seconds.

### 1:10 — Default restore (5 s)
Click **Default** (in the action row below the skin name).  
"One click back to the standard classroom. Any lesson step we were on is completely intact."

### 1:15 — Lock (5 s)
Set **Mars Surface** again, then check **Lock for students**.  
"Teachers can lock the environment so students stay in the immersive context while they work."

### 1:20 — Close (10 s)
Dismiss the banner on the teacher side. Point out that the ambient slider lets you dial down background sound if you start talking.  
"The full lesson flow — check-ins, boards, groups, hall pass — works identically inside any skin. The environment is purely atmosphere; the pedagogy is unchanged."

---

## Key talking points

| Skin | Subject fit | Standout feature |
| --- | --- | --- |
| Mars Surface | Physics, Earth science, STEM | Walk-speed multiplier (lower gravity) |
| Cell Interior | Biology, anatomy | Avatar scale (you're microscopic) |
| Roman Forum | History, Latin, humanities | Day / Night lighting toggle |
| Rainforest Canopy | Ecology, Earth science | Ambient layered soundscape |
| Art Studio | Art, design, creativity | Neutral gallery lighting, warm floor |

---

## Failure modes / fallbacks

| Scenario | Recovery |
| --- | --- |
| Asset pack not yet uploaded to R2 | Skin loads as color-only (no panorama). Functionally fine; tell the audience "assets pending upload." |
| Ambient audio blocked by browser | Silence — autoplay policy. Dismiss gracefully: the slider will still work once a user gesture unlocks audio. |
| Slow connection | `useWorldSkin` holds the previous skin until new textures preload; no blank-scene flash. |
| Teacher accidentally locks skin | Uncheck **Lock for students** immediately. Lock is forward-compat — students have no picker in Phase A, so no actual UX impact today. |
