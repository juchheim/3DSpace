# 3DSpace World-Building Guide (AI World Host knowledge base)

This is the authoritative reference the AI World Host uses to answer build questions.
Everything here describes the **shipped** World Builder controls. If a control, tool,
material, object, scene, or limit is not in this guide, it does not exist — say so rather
than guessing.

Keyboard shortcuts are written as keys (for example `3` or `R`). "Undo" is `⌘Z` on macOS and
`Ctrl+Z` on Windows/Linux; "Redo" is `⌘⇧Z` / `Ctrl+Shift+Z`.

---

## 1. What world building is

The **World Builder** lets participants place and remove 3D content in supported room types:

- **Grid build pieces** — walls, floors, image floors, ramps, doorways, windows, lights, and mirrors.
- **World objects** — furniture, trees, grass, podiums, and other props from the **Objects** tab.
- **World scenes** — large pre-made environments (market, classroom, Mars terrain, etc.) from the **Scenes** tab.

Building is **collaborative and live**: placements appear for everyone in real time. In
Free-for-All and Dream IXR **verse** rooms, **anyone can build or remove anyone's work**
(build pieces and placed objects). There is no per-piece owner in those room types.

Building works in both the 3D view and the 2D top-down view.

**Availability:** World building is enabled in **Free-for-All**, all **Dream IXR verse**
rooms (`skill-verse`, `culture-verse`, etc.), and **escape-room** rooms when the feature
flag is on. Classroom and workforce-training rooms do not ship the World Builder. If the
Build toggle is not visible, building is turned off for that room or environment.

---

## 2. Turning building on

- Find the **Build** toggle in the **World Builder** dock (bottom of the screen). It reads
  **"Build off"** when inactive and **"Build on"** when active.
- Click it, or press **`B`**, to enter build mode. The dock expands with category tabs, the
  tool palette, materials, and the live piece counter.
- Click **Build on** again (or press **`B`**) to leave build mode and walk around normally.
  Closing build mode also **cancels any selected world object or scene** you were about to place.

While build mode is **off**, the dock shows: "Place walls, floors & objects — anyone can build
or remove."

---

## 3. World Builder categories (tabs)

When build mode is on, three tabs organize the dock:

| Tab | What it contains |
| --- | --- |
| **Build** | Grid pieces (walls, floors, ramps, doors, windows, lights, mirrors, image floors) plus material and rotation controls. |
| **Objects** | Smaller props — chairs, tables, trees, grass, podiums. Click one, then click in the world to place. |
| **Scenes** | Large environment meshes — Vienna Market, Classroom, Mars, Escher Head. One placement drops a whole scene. |

Selecting an object or scene deselects the single-piece build tool, and vice versa.

---

## 4. The grid: cells, levels, and dimensions

Building snaps to a fixed grid. Knowing the grid explains most "why did it go there" questions.

- **Cell size:** every cell is **3 meters × 3 meters**. Floors, image floors, and ramps fill one cell.
- **Level height:** each vertical level is **3 meters** tall. Walls are exactly one level tall,
  which keeps floor tops flush with wall tops when you stack.
- **Levels:** pieces live on levels **0 through 4** (5 levels total). Level 0 is the ground
  floor. The **maximum build height is level 4 (12 m)** — you cannot place above it.
- **Wall thickness:** ~0.2 m. **Floor thickness:** ~0.3 m.
- Because a cell, a level, and a wall are all 3 m, a single-cell ramp rises one level over one
  cell — a clean **45° ramp**.

Pieces are placed where your cursor highlights a cell or a cell edge. Edge pieces (walls, doors,
windows, mirrors) snap to the nearest **edge** of a cell — north, east, south, or west. Floors,
image floors, ramps, and lights occupy the **cell** itself.

World objects and scenes are **not** grid-snapped — they place at the click point (with optional
**Fine placement** for precise nudging; see section 10).

---

## 5. The build tools (and their shortcuts)

Select a tool by clicking it in the **Build** tab palette or pressing its number key. The active
tool is highlighted. **Erase** (destroy) is a separate utility button and also key **`4`**.

| Tool | Key | What it does |
| --- | --- | --- |
| **Wall** | `1` | Places a solid wall along the nearest cell edge. Blocks movement. Boards can be hung on walls. The wall's front faces you when you place it. |
| **Simple Wall** | `9` | Like a wall but uses a plainer mesh. Same collision and board rules as a wall. |
| **Floor** | `2` | Places a 3×3 m floor tile filling the cell. Walkable surface; stack on higher levels to make upper storeys. |
| **Image Floor** | `0` | A floor tile whose top face shows an uploaded or preset image. See section 8. |
| **Ramp** | `3` | Places a 45° ramp filling the cell, rising one level. Walk up it to reach the next floor. Use `R` to aim it. |
| **Erase** (Destroy) | `4` | Removes the build piece **or placed world object** you click. Anyone can erase in FFA/verse rooms. |
| **Door** (doorway) | `5` | Like a wall but with a walk-through opening. The avatar-height band is open so you can pass. |
| **Window** | `6` | Like a wall with a clear gap above a low sill. You **cannot** walk through a window. |
| **Light** | `7` | Places a light source in the cell to brighten an area. |
| **Mirror** | `8` | A reflective wall panel on a cell edge. Blocks movement like a wall; the reflective face points toward you when placed. |
| **Wood Arbor Ceiling** | — | A wood pergola trellis overhead in one cell — open gaps let sky light through. Non-colliding; stacks with floors and lights in the same cell. Use **`R`** to rotate. |
| **Futuristic Arbor Ceiling** | — | A sci-fi pergola trellis overhead in one cell — same rules as the wood arbor ceiling. Non-colliding; stacks with floors and lights. Use **`R`** to rotate. |
| **Futuristic Lighting Ceiling** | — | A flat sci-fi light panel mounted overhead in one cell — visual only (baked emissive in the GLB). Use the **Light** tool to brighten the area below. Non-colliding; stacks with floors and other fixtures. Use **`R`** to rotate. |
| **Futuristic Ceiling** | — | A flat sci-fi ceiling panel in one cell — visual only. Non-colliding; stacks with floors, lights, and other fixtures. Use **`R`** to rotate. |

Notes:

- **Walls, simple walls, doors, windows, and mirrors are "edge" pieces** — they share the same
  edge slots, so a cell edge holds one of them at a time.
- **Floors, image floors, ramps, lights, and arbor ceilings are "cell" pieces** — they occupy the cell, not an edge.
  Plain **floor** and **image floor** compete for the same cell slot — you cannot have both in one cell.
- **Doorway vs. window:** a **doorway** is passable; a **window** is **not** passable (low sill,
  opening too high to step through).

---

## 6. Rotating pieces — `R`

Press **`R`** to rotate the current **build-piece** placement by 90° (0° → 90° → 180° → 270° → 0°).
The dock also has a **↻** rotate button showing the current angle.

Rotation matters most for the **Ramp**: it sets which way the ramp climbs. For edge pieces, placement
already snaps to the nearest edge; regular walls auto-face you, while ramps use manual rotation.

**World objects and scenes** also use **`R`** for 90° rotation while placing (unless **Fine placement**
is on — then `Q`/`E` rotate in 5° steps; see section 10).

---

## 7. Drag to paint

You don't have to click each cell for most build tools. **Hold and drag** across the grid to place
a line or run of the current piece in one motion. Drag-paint respects all placement rules — invalid
cells are skipped.

**Image Floor** uses **rectangle drag** instead: pick an image first, click to anchor one corner,
drag to sweep out a rectangle of tiles (up to **24 cells per side**), release to commit. Drag again
from an edge of an existing image floor to **extend** the same texture. Use **Erase** (`4`) to
remove individual image-floor tiles.

---

## 8. Image Floor (tool `0`)

Image floors turn floor cells into textured ground — grass, dirt, concrete, photos, maps, etc.

**Getting an image**

1. Select **Image Floor** (`0`) in the **Build** tab.
2. Choose one of:
   - A **built-in preset** swatch: **Grass**, **Dirt**, or **Concrete** (under "In this room").
   - **Upload floor image** — PNG, JPEG, or WebP (large photos are downscaled automatically).
   - A **swatch from images already used** in this room (reuse or extend an existing floor).

**Image span:** before placing, pick how many cells one image covers: **2×2**, **4×4** (default),
or **8×8**. A single uploaded image stretches across that many cells in each direction. Connected
tiles with the **same image and span** merge into one continuous textured region.

**Placing:** after an image is selected, **drag a rectangle** on the ground. The preview shows
green (valid) or red (blocked) with a tile count. Tiles that already have the same texture are
skipped; tiles with a different texture are repainted.

**Tips:** image floors share floor slots with plain floors. Undo/redo applies to image-floor
placements like any other build piece.

---

## 9. Materials

Pick a material swatch before placing build pieces; new pieces use the selected material.
(Image floors use their uploaded image instead of these materials.)

| Material | Look |
| --- | --- |
| **Stone** | Matte grey, the default. |
| **Wood** | Warm brown, low shine. |
| **Metal** | Light grey, shiny/metallic. |
| **Glass** | Translucent light blue — see-through. |
| **Neon** | Glowing cyan; emits its own light/accent. |

Material is cosmetic (plus glass being see-through and neon glowing); it does not change collision
or placement rules.

---

## 10. World objects (Objects tab)

Click an object in the **Objects** tab, then click in the 3D or 2D view to place it. Press **`R`**
to rotate 90° before placing. Press **`Esc`** or click the selected object again to cancel.
Use **Erase** (`4`) to remove a placed object.

**Fine placement** (toggle above the object grid): when on, the first click sets down a **draft**
you can nudge with **arrow keys** (hold **Shift** for smaller steps), rotate with **`Q`**/**`E`**
in 5° steps, then confirm with **Enter** or cancel with **Esc**. When off, objects drop instantly
at 90° rotations.

### Shipped objects

| Object | Notes |
| --- | --- |
| **Folding Chair** | Sit with **E** when nearby. |
| **Walnut Chair** | Sit with **E** when nearby. |
| **Walnut Table** | Decorative / furniture prop. |
| **Round Walnut Table** | Decorative / furniture prop. |
| **Student Desk** | Sit with **E**; while seated press **`N`** to open your **personal notebook** (type, draw, flip pages, export PDF). Notes are saved per room per user. |
| **Tree** | Outdoor prop; each placement gets a slightly random size (natural variation). |
| **Tree in a Pot** | Potted tree; slight random size per placement. |
| **Southern Live Oak** | Large tree; slight random size per placement. |
| **Tall Grass** | **Scatter** placement: one click strews several grass patches across a 3×3 m square. Use the **Patches per square** slider (1–12, default 6). Grass gently sways in the wind. |
| **Podium** | Walk up and tap **E** to **stand & present** (locks you behind the lectern facing the room). While at the podium, press **`N`** for a **presentation notebook** (same editor as the desk, plus **Import** for `.txt`/`.md` files up to 200 KB). Tap **E** again to leave. |

Undo/redo applies to **build pieces only**, not placed world objects.

---

## 11. World scenes (Scenes tab)

Scenes are large pre-built GLB environments placed as a single object. They appear under the
**Scenes** tab. Placement works like objects (click to place, **`R`** rotate, optional **Fine
placement**, **Erase** to remove).

Scenes include a **walkable physics collider** — you can walk and jump on the terrain/architecture
(verse rooms also support avatar physics when enabled).

### Shipped scenes

| Scene | Notes |
| --- | --- |
| **Vienna Market** | Outdoor market environment; walkable. |
| **Classroom** | Simple classroom interior; walkable. |
| **Mars** | Mars terrain patch (scaled up); walkable. |
| **Escher Head** | Sculptural environment; walkable. |

Place scenes on open ground with enough clearance — they are much larger than a single grid cell.

---

## 13. Undo, redo, clear, and getting unstuck

- **Undo:** `⌘Z` / `Ctrl+Z`, or the **Undo** button. Reverses your last **build-piece** action
  (place or destroy). Does **not** undo world object/scene placements.
- **Redo:** `⌘⇧Z` / `Ctrl+Shift+Z`, or the **Redo** button.
- **Clear all:** the **Clear** button removes **every build piece** in the room (confirms first).
  It does **not** remove placed world objects or scenes — erase those individually with **Erase** (`4`).
- **Place ahead** (mobile): places a build piece in the cell directly in front of your avatar.
  Disabled for Erase and while placing a world object or scene.
- **Return to spawn** (⌂): teleports you back to a spawn point if boxed in or stuck.
- **Piece counter:** the number in the dock header counts **build pieces** only, not world objects.

---

## 14. Boards on build walls

Dynamic boards (shared screens/whiteboards) can be hung on **build walls** you create, as well as
the room's original walls. Build a wall, then use the board placement flow and aim at the wall face.

If a build wall has a **board attached**, you must **remove the board first** before destroying that
wall ("Remove the board before destroying this wall.").

Boards cannot be placed in reserved board zones (see `board-keep-out` below). Verse rooms have
board anchors on their perimeter walls at ±28 m.

---

## 15. Limits and caps

| Limit | Value | Meaning |
| --- | --- | --- |
| Max height | Level **4** | Cannot place above level 4 (5 levels: 0–4). |
| Build pieces per room | **1000** | Total grid pieces in the room. |
| Build pieces per user | **400** | Each person's own placed build pieces. |
| Active lights | **8** | Only ~8 nearest lights fully illuminate; extras still exist. |
| Placement rate | throttled | Server-side rate limit; normal drag-paint is fine. |

When a cap is hit you'll see "Build piece limit reached for this room" or "…for this user."
Destroy unused pieces or use **Clear all** (build pieces only).

---

## 16. Where you can and can't build (keep-out zones)

When a placement is blocked, the app shows a short reason. Rules are checked on your screen (red
preview) and on the server.

| Reason shown | Plain meaning | How to fix |
| --- | --- | --- |
| **Too close to a spawn point** (`spawn-keep-out`) | Building on or next to a spawn pad. | Move a cell or two away from spawn points. |
| **Cannot build in the hall** (`hall-keep-out`) | Cell is inside a Free-for-All entry/exit hall. **FFA only.** | Build in the central arena, not in a hallway. |
| **Cannot build in the exit wedge** (`exit-keep-out`) | Cell overlaps the wedge in front of an FFA exit. **FFA only.** | Step away from the exit opening. |
| **Cannot build over a board zone** (`board-keep-out`) | Edge piece overlaps a reserved board area. **FFA only** for dynamic edge checks. | Place outside the reserved zone. |
| **Outside the build area** (`out-of-bounds`) | Past the room's outer bounds. | Stay inside the room canvas (80×80 m in verse/escape; FFA arena bounds). |
| **Maximum build height reached** (`level-cap`) | At level 4 or ramp on top level. | Build lower. |
| **That slot is already filled** (`slot-occupied`) | Cell/edge/level already has a piece. | Erase the existing piece first. |
| **Invalid piece placement** (`invalid-piece`) | Piece can't form a valid shape there. | Re-aim at a clear cell or edge. |
| **Build piece limit reached for this room** (`room-cap`) | Room hit 1000 build pieces. | Erase unused pieces or Clear all. |
| **Build piece limit reached for this user** (`user-cap`) | You hit 400 of your own build pieces. | Erase some of your pieces. |

**Verse** and **escape-room** canvases do **not** apply FFA hall, exit-wedge, or board-zone
keep-outs — only spawn keep-out, out-of-bounds, level cap, slot conflicts, and piece caps.

---

## 17. Common how-to recipes

**Make a simple room:** Lay **Floor** tiles and **Wall** edges with a **Door** (`5`) for entry.

**Texture a lawn or path:** Select **Image Floor** (`0`), pick **Grass** or upload an image, set **Image span**, drag a rectangle on the ground.

**Make stairs / upper floor:** Place **Floor** at level 1, then a **Ramp** (`3`) below; press `R` to aim the high end toward the upper floor.

**Furnish a space:** Open the **Objects** tab, place chairs and tables. Enable **Fine placement** for precise arrangement.

**Drop a whole environment:** Open **Scenes**, pick e.g. **Classroom** or **Mars**, click to place (use Fine placement to nudge).

**Give a presentation:** Place a **Podium**, walk up, press **E** to stand, **N** for the notebook (import `.txt`/`.md` on the podium notebook).

**Study at a desk:** Place a **Student Desk**, sit with **E**, press **N** for your notebook.

**Scatter grass:** Select **Tall Grass**, adjust **Patches per square**, click on the ground.

**Lay a long wall or floor fast:** Pick the tool, then **drag** across cells.

**Put a board on your wall:** Build a **Wall**, use dynamic board placement on the wall face. Remove the board before destroying the wall.

**Remove a chair or scene:** Select **Erase** (`4`) and click the object.

**Undo a build mistake:** `⌘Z` / `Ctrl+Z`. To wipe all grid pieces, **Clear all** (confirms first).

**I'm stuck inside my build:** Click **Return to spawn** (⌂).

---

## 18. Quick FAQ

- **Q: How do I open the World Builder?** A: Click **Build off** in the dock, or press **`B`**.
- **Q: What tabs are in the World Builder?** A: **Build**, **Objects**, and **Scenes**.
- **Q: How do I undo?** A: `⌘Z` / `Ctrl+Z` for build pieces. World objects are removed with Erase (`4`), not undo.
- **Q: What does key `0` do?** A: Selects **Image Floor**.
- **Q: What does key `8` do?** A: Selects **Mirror**.
- **Q: What does key `3` do?** A: Selects **Ramp**.
- **Q: What's the difference between a door and a window?** A: Doorways are passable; windows are not.
- **Q: How tall can I build?** A: Up to **level 4** (5 levels, 0–4); each level is 3 m (12 m max).
- **Q: How big is a cell?** A: **3 m × 3 m**.
- **Q: Can I recolor build pieces?** A: Choose a **material** (stone, wood, metal, glass, neon) before placing. Image floors use uploaded images instead.
- **Q: Why can't I build here?** A: Keep-out zone, out of bounds, height cap, occupied slot, or piece limit — see section 16.
- **Q: Why can't I build in the hall?** A: That rule applies in **Free-for-All** rooms only. Verse and escape rooms don't have FFA halls.
- **Q: Can others delete my stuff?** A: In FFA and verse rooms, yes — shared sandbox.
- **Q: How do I sit on a chair?** A: Walk up and tap **E**. Student desks and podiums have extra features (notebook / present).
- **Q: How do I rotate a ramp?** A: Press `R`, then place.
- **Q: How do I clear the whole room?** A: **Clear all** removes all **build pieces** (confirms first). Erase objects/scenes one by one with `4`.
- **Q: Can the guide build for me?** A: No — the World Host gives advice only; it cannot place or remove pieces.

---

## 19. Tone for answers

When helping with building: be concise and friendly, cite the exact key or button (for example
"press `0` for Image Floor" or "open the Objects tab"), and when a build was rejected, name the
reason in plain language and give the one-line fix. Never invent tools, materials, objects, scenes,
shortcuts, or limits that are not in this guide. If you don't know or it isn't covered here, say so
and suggest the closest supported option.
