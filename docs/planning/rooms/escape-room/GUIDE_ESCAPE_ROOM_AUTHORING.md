# Build your first escape room

A practical guide for authors (teachers / room owners). Escape rooms start as an
empty 80×80 canvas. You build walls, drop in **trigger blocks** (logic pieces),
wire them together with **channels**, then hit **Play test** to try the puzzle.

Everything is server-authoritative and syncs to every player in real time. Only
the room author can place or edit logic; players only interact during play mode.

---

## The toolbars

### Build bar (walls & rooms)

Place `floor`, `wall`, `ramp`, `doorway`, `window`, `light` pieces and prefab
**stamps** (Room 3×3, Corridor, …). Use it to shape the physical space first.

### Logic bar (trigger blocks)

Toggle **Logic on**, then pick a tool:

| Tool | Role | What it does |
| --- | --- | --- |
| **Button** | emitter | Press `E` (or click) to fire its channel. Mounts on a wall edge. |
| **Plate** | emitter | Fires while a player stands on it (`while held`) or as a pulse. |
| **Zone** | emitter | Fires when a player enters/leaves a proximity area. |
| **Timer** | emitter | Fires its channel after a delay (and optionally repeats). |
| **Door** | consumer | Opens when its channel is active. Mounts on a wall edge. |
| **Light** | consumer | Turns on when its channel is active. |
| **Teleport** | consumer | Warps the player to its paired pad (matched by **Link ID**). |
| **Remove** | — | Click a node to delete it. |

### Channels — the wires

A **channel** is just a name (e.g. `main-door`). Emitters *fire* a channel;
consumers *listen* on it. Any number of pieces can share a channel. The channel
picker is a combobox of channels already in the room plus free text for new ones,
and every channel gets a **stable color** so linked nodes glow the same hue
in-world.

### Modes (next to the channel picker)

- **Fires** (emitters): `Pulse` (a blip), `Toggle` (flip on/off each fire),
  `While held` (active only while stood on / inside).
- **Reacts** (consumers): `Momentary` (active only while the channel is fresh),
  `Toggle`, `Latch` (stays on once fired).
- **Win exit** (plate/zone): stepping on it ends the session as a win.
- **Delay ms** (timer): how long after its trigger before it fires.
- **Link** (teleporter): pads sharing a Link ID warp to each other.

### Inspector

Click any node (logic on, not play mode) to open the **inspector**: kind, channel,
config, live runtime state, and linked peers (click a peer to jump to it). Edit the
channel, mode, link, delay, or win-exit here, or remove the node.

### Debug overlay (play mode, author only)

In Play test the author sees a live **logic debug** panel: which channels are
latched/pulsing right now and the state of every consumer node — the "why didn't
my door open?" aid.

---

## Quickest start: the starter kit

With Logic on in an escape room, click **Starter kit**. It stamps a 5×5 room with
pre-wired logic (button → door on `exit-door`, a closet button → light on
`study-light`, and a win plate past the door). Switch to **Play test**, **Start
session**, and walk it. This is recipe §4.10 trimmed to a first playable loop.

---

## Recipe catalog (combine the elements)

Channel names are shown in quotes. Full reference:
`docs/planning/rooms/free-for-all/world-building/ROADMAP_ESCAPE_ROOMS_TO_TRIGGER_BLOCKS.md` §4.

1. **One switch, one door** — Button `pulse` → "main-door"; Door `latch` on
   "main-door". The smallest loop.
2. **Clue reveal** — Button → "study-light"; Light `latch` on "study-light" lights
   a dark room so a board becomes readable.
3. **Hold the door (co-op)** — Plate `while held` → "hold-door"; Door `momentary`
   on "hold-door". Door is open only while someone stands on the plate.
4. **Delayed unlock** — Button → "start-timer"; Timer (trigger "start-timer",
   delay 10s) → "vault-open"; Door on "vault-open".
5. **Two-key AND** — Plate A → "key-a", Plate B → "key-b"; Door requires
   *both* channels (set `requireAll` to `["key-a","key-b"]`). Needs two players.
6. **Secret passage** — Zone behind a shelf → "arm-secret"; Teleporter listens on
   "arm-secret" to arm, then warps via its Link ID to the paired pad.
7. **Win** — A plate/zone with **Win exit** on; stepping on it ends the session.

---

## Playtest checklist

1. Build the rooms, place logic, wire channels (watch the in-world colors match).
2. Use the inspector to confirm modes and linked peers.
3. Switch to **Play test** → **Start session** (timer HUD starts).
4. Solve the puzzle; the debug overlay shows live channel/node state.
5. Reach the **Win exit** before the timer runs out → "Escaped!".

**Exit criteria for 6.1:** a new author stamps the starter kit, hits Play test,
and a second player completes the escape with no dev tools.
