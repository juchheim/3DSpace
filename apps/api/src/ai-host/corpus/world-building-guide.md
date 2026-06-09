# 3DSpace World-Building Guide (AI World Host knowledge base)

This is the authoritative reference the AI World Host uses to answer build questions in
Free-for-All rooms. Everything here describes the **shipped** build controls. If a control,
tool, material, or limit is not in this guide, it does not exist — say so rather than guessing.

Keyboard shortcuts are written as keys (for example `3` or `R`). "Undo" is `⌘Z` on macOS and
`Ctrl+Z` on Windows/Linux; "Redo" is `⌘⇧Z` / `Ctrl+Shift+Z`.

---

## 1. What world building is

World building lets anyone in a Free-for-All room place and remove simple 3D pieces — walls,
floors, ramps, doorways, windows, and lights — to make rooms, towers, mazes, and structures.
Building is **collaborative and live**: every piece you place appears for everyone in the room
in real time, and (in Free-for-All) **anyone can remove anyone's pieces**. There is no separate
"owner" of a piece in Free-for-All.

Building works in both the 3D view and the 2D top-down view.

**Availability:** World building is a Free-for-All feature and must be enabled for the room. If
the Build toggle is not visible, building is turned off for that room or environment.

---

## 2. Turning building on

- Find the **Build** toggle in the build dock (bottom of the screen). It reads **"Build off"**
  when inactive and **"Build on"** when active.
- Click it (or it may already be on) to enter build mode. The tool palette, stamps, materials,
  and the live piece counter appear.
- Click it again to leave build mode and go back to just walking around.

While build mode is **off**, the dock shows the hint: "Place walls, floors, and ramps — anyone
can build or remove."

---

## 3. The grid: cells, levels, and dimensions

Building snaps to a fixed grid. Knowing the grid explains most "why did it go there" questions.

- **Cell size:** every cell is **2 meters × 2 meters**. Floors and ramps fill one cell.
- **Level height:** each vertical level is **2 meters** tall. Walls are exactly one level tall,
  which keeps floor tops flush with wall tops when you stack.
- **Levels:** pieces live on levels **0 through 4** (5 levels total). Level 0 is the ground
  floor. The **maximum build height is level 4** — you cannot place above it.
- **Wall thickness:** ~0.2 m. **Floor thickness:** ~0.3 m.
- Because a cell, a level, and a wall are all 2 m, a single-cell ramp rises one level over one
  cell — a clean **45° ramp**.

Pieces are placed where your cursor highlights a cell or a cell edge. Edge pieces (walls, doors,
windows) snap to the nearest **edge** of a cell — north, east, south, or west. Floors, ramps, and
lights occupy the **cell** itself.

---

## 4. The tools (and their shortcuts)

Select a tool by clicking it in the palette or pressing its number key. The active tool is
highlighted.

| Tool | Key | What it does |
| --- | --- | --- |
| **Wall** | `1` | Places a solid wall along the nearest cell edge. Blocks movement. Boards can be hung on walls. |
| **Simple Wall** | `9` | Like a wall but uses a plainer mesh. Same collision and board rules as a wall. |
| **Floor** | `2` | Places a 2×2 floor tile filling the cell. Walkable surface; stack on higher levels to make upper storeys. |
| **Ramp** | `3` | Places a 45° ramp filling the cell, rising one level. Walk up it to reach the next floor. Use `R` to aim it. |
| **Destroy** | `4` | Removes the piece you click. In Free-for-All anyone can destroy any piece. |
| **Door** (doorway) | `5` | Like a wall but with a walk-through opening. The avatar-height band is open so you can pass; the frame still reads as a wall. |
| **Window** | `6` | Like a wall with a clear gap above a low sill. You **cannot** walk through a window — the sill blocks your feet and the gap is too low. |
| **Light** | `7` | Places a light source in the cell to brighten an area. |

Notes:

- **Walls, doors, and windows are "edge" pieces** — they share the same edge slots, so a cell
  edge holds one of them at a time. Replacing a wall with a doorway means destroying the wall
  first (or placing the doorway on an empty edge).
- **Floors, ramps, and lights are "cell" pieces** — they occupy the cell, not an edge.
- **Doorway vs. window:** a **doorway** is passable (walk through it); a **window** is **not**
  passable (it has a low sill and the opening sits too high to step through). Use a doorway when
  you want a path, a window when you want a view or light gap but a closed barrier.

---

## 5. Rotating pieces — `R`

Press **`R`** to rotate the current placement by 90° (it cycles 0° → 90° → 180° → 270° → 0°).
The dock also has a **↻** rotate button on mobile that shows the current angle.

Rotation matters most for the **Ramp**: it sets which way the ramp climbs. Rotate until the high
end faces the floor level you want to reach, then place. For edge pieces, the placement already
snaps to the nearest edge, so rotation is mainly a ramp-aiming tool.

---

## 6. Drag to paint

You don't have to click each cell. **Hold and drag** across the grid to place a line or run of
the current piece in one motion ("drag to paint"). This is the fast way to lay a row of floor
tiles or a straight wall. Drag-paint respects all the same placement rules — invalid cells in
the drag are simply skipped.

---

## 7. Materials

Pick a material swatch before placing; new pieces use the selected material. Available materials:

| Material | Look |
| --- | --- |
| **Stone** | Matte grey, the default. |
| **Wood** | Warm brown, low shine. |
| **Metal** | Light grey, shiny/metallic. |
| **Glass** | Translucent light blue — see-through. |
| **Neon** | Glowing cyan; emits its own light/accent. |

Material is cosmetic (plus glass being see-through and neon glowing); it does not change a
piece's collision or rules. The material picker is shown on desktop; the default is **stone**.

---

## 8. Stamps (prefab shortcuts)

Stamps drop several pieces at once so you don't have to place them one by one. Select a stamp
from the stamp row, then click to place it at the highlighted cell. Press `R` to rotate the
whole stamp before placing. Built-in stamps:

| Stamp | What it places |
| --- | --- |
| **Room 3×3** | A floored 3×3 area with surrounding walls and a doorway on the south side. A quick complete room. |
| **Corridor** | Two floor cells with side walls and doorways at each end — a hallway segment. |
| **Floor 2×2** | Four floor tiles, no walls. |
| **Perimeter 5×5** | A hollow 5×5 box of outer walls only (no floor, no door) — a courtyard or fence. |

Selecting a stamp deselects the single-piece tool; click the stamp again to deselect it and
return to normal tools.

---

## 9. Undo, redo, clear, and getting unstuck

- **Undo:** `⌘Z` (macOS) / `Ctrl+Z` (Windows/Linux), or the **Undo** button. Reverses your last
  build action (place or destroy).
- **Redo:** `⌘⇧Z` / `Ctrl+Shift+Z`, or the **Redo** button. Re-applies an undone action.
- **Clear all:** the **Clear all** button removes **every** build piece in the room (it asks for
  confirmation first and tells you how many pieces will go). This affects the whole room for
  everyone — use it carefully.
- **Place ahead** (mobile): places a piece in the cell directly in front of your avatar — handy
  when precise aiming is hard on touch. Disabled for the Destroy tool and while a stamp is
  selected.
- **Spawn / Return to spawn:** teleports you back to a spawn point if you've boxed yourself in or
  fallen somewhere you can't escape.
- **Piece counter:** the number in the dock is the current count of build pieces in the room.

---

## 10. Boards on build walls

Dynamic boards (the shared screens/whiteboards you can place on walls) can be hung on the build
walls you create, not just the room's original walls. To do this, build a **wall** piece, then
use the board placement flow and aim at the wall face.

Important interaction: if a build wall has a **board attached**, you must **remove the board
first** before you can destroy that wall. Trying to destroy a wall that still has a board on it
is blocked with the message "Remove the board before destroying this wall."

Boards cannot be placed in the room's reserved board zones (see "board-keep-out" below).

---

## 11. Limits and caps

| Limit | Value | Meaning |
| --- | --- | --- |
| Max height | Level **4** | You cannot place pieces above level 4 (5 levels: 0–4). |
| Pieces per room | **1000** | The whole room can hold up to 1000 build pieces. |
| Pieces per user | **400** | Each person can have up to 400 of their own pieces placed. |
| Active lights | **8** | Only a limited number of lights illuminate at once (about 8 nearest); extra lights still exist but may not all light up. |
| Placement rate | throttled | Placement is rate-limited server-side to prevent spam; rapid drag-paint is fine. |

When a cap is hit you'll see a message like "Build piece limit reached for this room" or
"…for this user." To free room capacity, destroy unused pieces or use Clear all.

---

## 12. Where you can and can't build (Free-for-All keep-out zones)

Free-for-All rooms have a round central arena (about a **23 m radius**) with **four halls/exits**
leading out. Some areas are reserved so the room stays usable and people can get in and out.
When a placement is blocked, the app shows a short reason. Here is every rejection reason, what
it means, and how to fix it:

| Reason shown | Plain meaning | How to fix |
| --- | --- | --- |
| **Too close to a spawn point** (`spawn-keep-out`) | You're trying to build on or right next to where people spawn in. Spawns are kept clear so nobody appears trapped inside a wall. | Move a cell or two away from the spawn pads and try again. |
| **Cannot build in the hall** (`hall-keep-out`) | The cell is inside one of the four entry/exit halls. Halls stay clear so people can walk in and out. | Build inside the central arena instead of in a hallway. |
| **Cannot build in the exit wedge** (`exit-keep-out`) | The cell overlaps the wedge of space in front of an exit. | Step away from the exit opening and build elsewhere. |
| **Cannot build over a board zone** (`board-keep-out`) | Wall/door/window edge pieces can't go where the room reserves space for its boards. | Place the piece outside the reserved board area, or use a non-edge piece if appropriate. |
| **Outside the build area** (`out-of-bounds`) | The cell is past the room's outer bounds. | Build within the room's walls/arena. |
| **Maximum build height reached** (`level-cap`) | You're at level 4 (the top) or trying to put a ramp on the top level. | Build lower, or remember the ceiling is 5 levels (0–4). |
| **That slot is already filled** (`slot-occupied`) | A piece already occupies that cell/edge/level. | Destroy the existing piece first, or pick an empty slot. |
| **Invalid piece placement** (`invalid-piece`) | The piece can't form a valid shape there (e.g., an edge piece with no valid edge). | Re-aim at a clear cell edge or cell and try again. |
| **Build piece limit reached for this room** (`room-cap`) | The room hit 1000 pieces. | Destroy unused pieces or Clear all. |
| **Build piece limit reached for this user** (`user-cap`) | You hit 400 of your own pieces. | Destroy some of your pieces. |

These rules are checked the same way on your screen (the placement preview turns red) and on the
server, so an invalid spot will be refused even if you force it.

---

## 13. Common how-to recipes

**Make a simple room:** Select the **Room 3×3** stamp and click to drop a complete walled room
with a doorway. Or, by hand: lay **Floor** tiles for the footprint, then place **Wall** pieces
around the edges, and add a **Door** where you want to enter.

**Make stairs / reach an upper floor:** Place a **Floor** at level 1 where you want the upper
storey. Then place a **Ramp** (key `3`) in the cell below leading up to it; press `R` to aim the
ramp's high end toward the upper floor. Walk up the ramp to step onto the floor. Because a ramp
rises exactly one level, line the ramp's top with the floor edge.

**Build a tower:** Stack floors and walls level by level (0 → 4). Use ramps to connect each level
so you can walk up. Remember level 4 is the ceiling.

**Add a window for light/views:** Use the **Window** tool (`6`) on a wall edge. Remember you
can't walk through windows — use a **Door** (`5`) for a passage.

**Light a dark space:** Use the **Light** tool (`7`) in the cell. Up to ~8 nearest lights are
active at once, so spread them out rather than clustering many in one spot.

**Lay a long wall or floor fast:** Pick the tool, then **drag** across the cells instead of
clicking each one.

**Put a board on your wall:** Build a **Wall**, then use the dynamic board placement flow and aim
at the wall's face. To later remove that wall, delete the board first.

**Undo a mistake:** Press `⌘Z` / `Ctrl+Z`. To wipe everything and start over, use **Clear all**
(it confirms first).

**I'm stuck inside my build:** Click **Spawn** to teleport back to a spawn point.

---

## 14. Quick FAQ

- **Q: How do I undo?** A: `⌘Z` on macOS, `Ctrl+Z` on Windows/Linux (or the Undo button). Redo is
  `⌘⇧Z` / `Ctrl+Shift+Z`.
- **Q: What does key `3` do?** A: Selects the **Ramp** tool.
- **Q: What's the difference between a door and a window?** A: A **doorway** is passable — you can
  walk through it. A **window** is not passable — it has a low sill and the gap is too high to
  step through; it's for views/light.
- **Q: How tall can I build?** A: Up to **level 4** (5 levels, 0–4); each level is 2 m.
- **Q: How big is a cell?** A: **2 m × 2 m**.
- **Q: Can I recolor pieces?** A: You can choose a **material** (stone, wood, metal, glass, neon)
  before placing. There's no free-form color picker.
- **Q: Why can't I build here?** A: You're likely in a keep-out zone (spawn, hall, exit wedge, or
  board zone), out of bounds, at the height cap, on an occupied slot, or at a piece limit. See
  section 12 for the exact reason and fix.
- **Q: Can others delete my stuff?** A: In Free-for-All, yes — anyone can build or remove any
  piece. It's a shared sandbox.
- **Q: How do I rotate a ramp?** A: Press `R` to cycle the angle, then place.
- **Q: How do I clear the whole room?** A: Use **Clear all** (it confirms and shows the count).
- **Q: Can the guide build for me?** A: No — the World Host gives advice and instructions only; it
  doesn't place or remove pieces.

---

## 15. Tone for answers

When helping with building: be concise and friendly, cite the exact key or button (for example
"press `3` for Ramp" or "use the Undo button"), and when a build was rejected, name the reason in
plain language and give the one-line fix. Never invent tools, materials, shortcuts, piece types,
or limits that are not in this guide. If you don't know or it isn't covered here, say so and
suggest the closest supported option.
