# Room-Type Feature Ideas — Classroom · Workforce Training · Free-for-All · Escape Room

Last updated: 2026-06-01
Author: brainstorm pass reviewing the four room types end-to-end.

Parent room-type specs:
- Classroom — `docs/planning/new-features/LEARNING_FEATURE_IDEAS.md` (the canonical classroom brainstorm)
- Workforce Training — `docs/planning/rooms/workforce-training/PLAN_WORKFORCE_TRAINING_ROOM.md`
- Free-for-All — `docs/planning/rooms/free-for-all/PLAN_FREE_FOR_ALL_ROOM.md` + `world-building/IDEAS_FREE_FOR_ALL_WORLD_BUILDING.md`
- Escape Room — `docs/planning/rooms/escape-room/PLAN_ESCAPE_ROOM_ROOM_TYPE.md` + `world-building/ROADMAP_ESCAPE_ROOMS_TO_TRIGGER_BLOCKS.md`

---

## 0. How to read this doc

This is a **brainstorm**, not a committed plan. Every idea is either:

- **Novel** — a capability the room type does not have today, or
- **Iterate** — an improvement/extension of something already shipped or planned.

Each idea is tagged so triage is fast (same convention as `IDEAS_FREE_FOR_ALL_WORLD_BUILDING.md`):

- **Effort:** `S` (hours–1 day) · `M` (a few days) · `L` (1–2 weeks) · `XL` (a real project)
- **Impact:** `low` / `med` / `high` (user-facing leverage)
- **Builds on:** the existing systems/symbols it extends, so nobody re-invents plumbing
- **Type:** `Novel` or `Iterate`

The load-bearing primitives this doc keeps reusing (so scope stays honest):

- `RoomManifest` + 3D theater geometry + 2D top-down projection (`packages/room-engine`).
- `WallObject` types (`image.file`, `video.file`, `camera.live`, `screen.live`, `web.link`, `note`, `poll`, `timer`, …) + dynamic `DynamicWallAnchor` boards on build walls.
- `ClassroomState` (`helpRequests`, `boardAccessGrants`, `privateChecks`, `groups`, `spotlight`, `lessonRun`) + `LessonRun` step kinds + optimistic version-locked action endpoint.
- `BuildPiece` (wall/floor/ramp) + `groundHeightAt` + `resolveWallCollisionsV2`; `BuildLogicPiece` + the server-authoritative **channel bus** (`room.logic.*`) + `EscapeSession`.
- `RoomObject` free-pose 3D manipulatives + `room.object.state.v1`.
- World Skins (manifest skin overrides), Avatar Physics (Rapier, behind `ENABLE_PHYSICS`).
- LiveKit reliable/unreliable data channels; spatial audio in `useSpatialAudio`.
- `getRoomTypeFeatureFlags(room.type)` already gates per-type behavior — the natural switchboard for everything below.

A recurring theme: **three engines we built for one room type are reusable across the others.** The escape-room **channel-bus logic engine**, the FFA **world-building kit**, and the **RoomObject** manipulatives system are each currently scoped to one type but are pure-data systems that `getRoomTypeFeatureFlags` can light up elsewhere. The biggest-leverage ideas below are cross-pollinations.

---

## 1. Classroom

The classroom is the most mature type (lesson runs, private checks, groups, spotlight, emotes, whisper, hall pass, exit tickets, world skins, breakout pods planned). `LEARNING_FEATURE_IDEAS.md` already holds the deep brainstorm (LessonSmith AI co-pilot, Time Capsule, Universal Access, Quiet Corner). The ideas here are **additive** to that doc and lean on primitives that shipped *since* it was written (RoomObjects, world skins, avatar physics, the logic engine).

### 1.1 Cold-call / equity randomizer — `S`, impact: med · Novel
A teacher HUD button "Call on someone" that picks a student weighted toward those **not** recently called, then spotlights them (reuse `spotlight`) and pings their HUD. Tracks per-roster call counts for the session so participation is visibly equitable.
- **Builds on:** `ClassroomState.spotlight`, classroom action pattern, roster. **Why:** equity-of-voice is a top-cited instructional practice; today the teacher tracks it in their head.

### 1.2 Reaction timeline / "comprehension scrubber" — `S`–`M`, impact: high · Iterate (Emotes)
Emotes (Small 1) fire ephemeral sprites today. Aggregate them into a **time-series strip** under the lesson HUD, aligned to `lessonRun` step boundaries: "during Step 3 (group work), confusion spiked to 6." Gives the teacher a readable history instead of a momentary glance, and becomes a Time-Capsule artifact later.
- **Builds on:** `avatar.reaction.v1`, `lessonRun` step markers. **Why:** turns a passive signal into actionable post-lesson data with no new student UI.

### 1.3 Manipulative-anchored checks — `M`–`L`, impact: high · Novel (RoomObject × private-check)
A new `LessonStep`/private-check variant whose answer is the **state of a RoomObject**: "rotate the water molecule to show the 104.5° bond angle," "arrange the base-10 blocks to make 142," "place the country on the globe." The check passes when `room.object.state.v1` matches an author-set target (within tolerance).
- **Builds on:** `RoomObject` (Alternate A), `ClassroomPrivateCheck`, `room.object.state.v1`. **Why:** this is the feature that finally makes the **3D** in 3DSpace pedagogically load-bearing — the manipulative *is* the assessment, not a wall poster.

### 1.4 Focus-board annotation + laser pointer — `M`, impact: high · Iterate (focus-board / Whiteboard)
During a `focus-board` step, let the teacher draw/highlight/point on the board surface; strokes and a pointer beam broadcast to all clients. A lightweight precursor to the planned full Whiteboard surface, scoped to "annotate what's already on the board."
- **Builds on:** `focus-board` step, planned `WHITEBOARD_SURFACE`, reliable data channel. **Why:** "look here" is the single most common live-teaching gesture and we have no analog.

### 1.5 Group auto-former + teleport-to-group — `M`, impact: med · Iterate (groups / breakout pods)
Teacher sets group size + strategy (random / mixed-ability / by-prior-answer) and the system forms `groups` and **teleports** members into their zone (reuse `teleportToPosition` from avatar physics / `selectSpawnPoint`). Removes the "everyone shuffle to your corner" dead time.
- **Builds on:** `ClassroomState.groups`, breakout-pod zones, physics `teleportToPosition`. **Why:** group transitions are slow and chaotic; automating them reclaims minutes per lesson.

### 1.6 Lesson template library + teacher-to-teacher share — `M`, impact: med · Iterate (LessonRun / LessonSmith)
Persist a finished `LessonRun` as a reusable, parameterized template; let a teacher clone a colleague's published lesson into their own class. The natural home for LessonSmith drafts and the thing that makes lesson authoring compound over time.
- **Builds on:** `LessonRun`, classroom actions, durable persistence. **Why:** today every lesson is built from scratch; reuse is the highest-leverage teacher time-saver.

### 1.7 Field-trip lesson packs (skin + lesson + manipulatives bundle) — `M`, impact: med · Iterate (World Skins)
World Skins shipped the *environments*; bundle each skin with a starter `LessonRun` and skin-specific `RoomObject`s (Mars rover to inspect, cell organelles to label) as a one-click "Field Trip Pack." Closes the loop between the demo-that-sells (skins) and the lesson-that-teaches.
- **Builds on:** World Skins, RoomObjects, lesson templates (1.6). **Why:** a skin alone is set dressing; a pack is a ready-to-run period.

### 1.8 Attendance + participation export — `S`, impact: med · Novel
Persist join/leave, hand-raises, check submissions, and emote counts to `RoomEvents` and expose a per-session CSV for the teacher (mirrors the hall-pass principal report). Operational, unglamorous, and frequently demanded by admins.
- **Builds on:** durable `RoomEvents`, existing hall-pass report pattern. **Why:** gradebook/attendance integration is table-stakes for district adoption.

---

## 2. Workforce Training

Workforce Training is **planning-only** today (Phase 1 = multi-zone geometry: 40×40 central room + U-shaped hallway + three 10×10 side rooms + 16 boards + Instructor/Trainee labels). Its geometry is unique among the types — **the side rooms are begging to be used as stations** — and its §9 already lists future instructor abilities. The ideas below flesh those out and add novel ones, prioritizing what the multi-room layout makes uniquely possible.

### 2.1 Station rotation / round-robin training — `M`–`L`, impact: high · Novel
Turn the three side rooms into **stations**. The instructor defines a rotation (cohort A → Station 1 → Station 2 → …) on a shared countdown; when the timer fires, the HUD nudges each cohort to its next room and (optionally) teleports them. This is the *signature* workforce-training mode — it's why the layout has three side rooms off a connected corridor.
- **Builds on:** WT manifest side-room zones, `timer` step kind, physics `teleportToPosition`, group assignment. **Why:** station-based skills training is the dominant corporate/CTE pedagogy and the geometry was designed for it.

### 2.2 Competency checkpoints + completion tracking — `M`, impact: high · Iterate (PLAN §9)
Each side room is a **module**; a trainee earns a checkmark when they finish its board activity / pass its check. Instructor sees a live matrix (trainee × module). Persist attempts for auditability (corporate training is compliance-driven).
- **Builds on:** private-check primitive, durable `RoomEvents`, roster. **Why:** "who has completed what" is the core question every L&D manager asks; certifications (2.6) depend on it.

### 2.3 Broadcast / all-hands mode — `M`, impact: high · Iterate (PLAN §9)
An instructor toggle that (a) makes their voice carry to every zone regardless of distance and (b) pushes one pinned board (slide/video/announcement) to the front board of **all** rooms simultaneously. Resolves PLAN open questions #4 (instructor voice carry) and "screen share to all boards."
- **Builds on:** spatial-audio override (teacher-voice-carries logic), WallObject broadcast, reliable channel. **Why:** "everyone stop and look here" across a multi-room space is impossible today.

### 2.4 Zone-aware audio + per-room huddles — `L`, impact: high · Iterate (PLAN §4.6 / breakout pods)
Make side-room walls **acoustically occlude** so each station is a private conversation, with the instructor able to drop into any one. This is the workforce-training instance of Breakout Pods (Alternate B) — same per-zone audio-island problem, different geometry.
- **Builds on:** `useSpatialAudio`, Breakout Pods plan, WT manifest zones. **Why:** PLAN §8 flags that side rooms currently leak central-room audio; real station work needs isolation.

### 2.5 Interactive equipment props per station — `M`, impact: med · Novel (RoomObject)
Place skill-specific `RoomObject`s in stations: a control panel to operate, a machine to inspect/disassemble, a safety-checklist board. Trainees with "touch" permission manipulate them; correct manipulation can satisfy a checkpoint (2.2).
- **Builds on:** `RoomObject`, `room.object.state.v1`, checkpoint tracking. **Why:** hands-on practice is what differentiates training from a lecture; props make a station a workstation.

### 2.6 Certificates / badges on completion — `S`–`M`, impact: med · Iterate (PLAN §9)
On session end (or when all checkpoints clear), grant a completion badge/certificate with export (PDF/CSV) for the trainee and L&D records. Pairs directly with 2.2.
- **Builds on:** completion tracking (2.2), `RoomEvents` export. **Why:** auditable completion is the deliverable corporate training is bought for.

### 2.7 Branching scenario simulations (logic engine reuse) — `L`, impact: high · Novel (Escape logic × training)
Light up the escape-room `logic` flag for workforce-training so instructors wire **skill gates**: a station door that only opens after the trainee completes the prerequisite task; a "wrong procedure → alarm/reset" consequence; a guided sequence enforced by channels. Safety/procedure training is fundamentally branching logic.
- **Builds on:** `BuildLogicPiece` + channel bus, `getRoomTypeFeatureFlags(...).logic`, WT geometry. **Why:** turns static rooms into consequence-driven simulations (lockout/tagout, emergency response, equipment startup) without code.

### 2.8 Self-paced / async training mode — `L`, impact: med · Iterate (Time Capsule)
Let trainees walk the rooms solo, on their own schedule, completing checkpoints without a live instructor — the Time Capsule "ghost visit" model applied to a course. Corporate onboarding is rarely fully synchronous.
- **Builds on:** Time Capsule big-idea (read-only room visit), checkpoint tracking. **Why:** async completion is how most workforce training actually gets consumed.

---

## 3. Free-for-All

FFA's **world-building** future is already deeply planned in `IDEAS_FREE_FOR_ALL_WORLD_BUILDING.md` (instancing, undo, prefabs, lights, jump pads, trigger blocks, AI prompt→structure, versioned/forkable worlds). To avoid duplication, this section focuses on FFA as a **social / collaboration / events space** — the layer *around* building — plus a few build cross-references.

### 3.1 Conversation tables / spatial audio zones — `M`, impact: high · Novel
Drop "table" zones (or auto-detect avatar clusters) where audio is clear within the huddle and a murmur outside — the FFA equivalent of Whisper circles and Breakout Pods, but self-organized and persistent. The central square becomes a true social hub.
- **Builds on:** `useSpatialAudio`, Whisper-circle gain math, breakout-pod zones. **Why:** open social rooms live or die on "can I have a side conversation"; one giant audio soup kills them.

### 3.2 Community directory with themes & tags — `M`, impact: med · Iterate (open-join browse)
The open-join room list (PLAN §4.3) becomes a real discovery surface: thumbnails (photo mode, 3.6), tags ("build battle," "study hall," "gallery"), live participant counts, sort/filter. The front door to a community of rooms.
- **Builds on:** FFA open-join list, room metadata. **Why:** discovery is what makes a sandbox a *destination* rather than a one-off link.

### 3.3 Collaborative brainstorm walls (retro / workshop mode) — `M`, impact: med · Iterate (dynamic boards / Whiteboard)
Sticky-note clusters and a shared whiteboard on dynamic build walls, with grouping/voting — FFA is the ideal canvas for team retros, affinity mapping, and workshops. Distinct from a passive board: many editors, movable notes.
- **Builds on:** `DynamicWallAnchor` boards, planned Whiteboard surface, realtime board events. **Why:** "open collaborative space" is FFA's pitch; brainstorming is the highest-value non-game use.

### 3.4 AI world host / NPC guide — `L`, impact: med · Novel (Frame parity #16) — **Planned**
A placeable NPC that greets arrivals, teaches world building (“how do I X?”), and converses about user-uploaded study files. **Planning:** [`../rooms/free-for-all/aibot/PLAN_FREE_FOR_ALL_AI_WORLD_HOST.md`](../rooms/free-for-all/aibot/PLAN_FREE_FOR_ALL_AI_WORLD_HOST.md) + [`IMPL_FREE_FOR_ALL_AI_WORLD_HOST.md`](../rooms/free-for-all/aibot/IMPL_FREE_FOR_ALL_AI_WORLD_HOST.md) — retro-robot avatar (`RetroRobotHostAvatar`), user-chosen name, private chat threads, room-persistent files.
- **Builds on:** AI provider abstraction, world-building corpus, R2 uploads, FFA realtime. **Why:** directly closes a named Frame parity gap and makes empty rooms feel inhabited.

### 3.5 Event / presentation stage mode — `M`, impact: med · Novel
A "stage" affordance: a presenter spotlight, audience seating snap-points, voice prioritization for the speaker, and a big shared board — turning a built amphitheater into a meetup/lightning-talk venue. Maps to Frame's event posture (parity gap #8, scaled-down).
- **Builds on:** `spotlight`, spatial-audio priority, dynamic boards, build kit (stages are buildable). **Why:** community rooms want talks/demos, not just freeform hangs.

### 3.6 Photo mode + shareable world snapshots — `S`–`M`, impact: med · Iterate (versioned/forkable worlds)
A framed screenshot/"postcard" capture of a built world, used as the directory thumbnail (3.2) and a social share. Pairs with the planned versioned/forkable links (IDEAS §8) for virality.
- **Builds on:** R3F render, versioned-world snapshots. **Why:** sharing is the cheapest growth loop a sandbox has.

### 3.7 Moderation & anti-grief toolkit — `M`, impact: high · Iterate (IDEAS §2.10 / §8.3)
Because anyone joins and anyone builds/destroys, FFA needs: per-user recent-activity view, mute/hide/soft-kick, region protect (plots), and rate limits — surfaced as a host panel, not just backend safety valves. Prerequisite for trusting larger public rooms.
- **Builds on:** build telemetry, `buildDestroyPolicy`, plots (IDEAS §8.3). **Why:** open join without moderation is a griefing magnet; this gates safe scale.

> Build-layer ideas (jump pads, parkour/king-of-the-hill, trigger blocks, AI prompt→structure, prefabs) live in `IDEAS_FREE_FOR_ALL_WORLD_BUILDING.md` — not repeated here.

---

## 4. Escape Room

Escape Room is **feature-rich already**: room type, authoring (undo, stamps, doorway/window/glass, lights), play mode, the full channel-bus logic engine (door, button, teleporter, light, pressure plate, proximity zone, timer emitter, latch/toggle/whileHeld/requireAll), `EscapeSession` timer + win zone, starter kit, and an author guide. The ideas below extend the logic vocabulary, add the session/meta layer escapes want, and open the strategic bridge to education.

### 4.1 Keypad / combination lock + sequence gate — `M`, impact: high · Iterate (logic; resolves open Q4/Q5)
A first-class **numeric/keypad** consumer (enter a code → pulse channel) and a **`sequenceGate`** node ("buttons in order 1-8-4-7, wrong order resets") — the two patterns the roadmap explicitly faked with multiple channels (§4.4, §4.6). The most-requested escape mechanic.
- **Builds on:** `BuildLogicPiece` kinds, channel bus, interact detection. **Why:** "find the code, enter the code" is the canonical escape puzzle and currently has no clean primitive.

### 4.2 Inventory & key items — `L`, impact: high · Novel
Collectible item pieces (key, card, tool) players pick up and **use** on a consumer (key opens a specific door, card swipes a reader). Adds the "find X to unlock Y" loop that pure switches can't express.
- **Builds on:** `RoomObject`/logic-piece hybrid, player-carried state in `EscapeSession`, channel bus. **Why:** inventory is the second pillar of escape design after switches; unlocks a huge puzzle space.

### 4.3 Timed hint system — `S`–`M`, impact: med · Iterate (timer emitter + board)
Author attaches escalating hints to a puzzle; after N minutes of no progress (or on a "stuck" button), a board reveals the next nudge. Reuses the timer emitter + board + channel; keeps groups from rage-quitting.
- **Builds on:** timer emitter, board consumer, channel bus. **Why:** un-hinted escapes strand players; hints are standard in real escape rooms.

### 4.4 Leaderboard + best-time tracking & replay — `M`, impact: med · Novel
Persist `EscapeSession` results (time, hints used, party size) into a per-room leaderboard; optionally store a lightweight movement/event replay. Turns a one-and-done puzzle into a competitive, repeatable experience.
- **Builds on:** `EscapeSession`, durable `RoomEvents`. **Why:** replayability + competition is what gives an authored escape a long tail.

### 4.5 Spectator / game-master mode — `M`, impact: med · Novel
The author watches a live run, sees logic state, and can manually trigger hints, open a stuck door, or reset — without joining as a player. Reuses play-mode + the authoritative logic state.
- **Builds on:** play mode, `room.logic.state.v1`, author permissions. **Why:** facilitated escapes (classroom/team-building) need a human GM safety valve.

### 4.6 Ambient audio & music cues on channels — `M`, impact: med · Iterate (channel bus × world skins)
Let channels trigger sound: a tension sting when a timer hits 2:00, a chime on solve, ambient loops per room. Audio is half of escape-room atmosphere and the channel bus already carries the events.
- **Builds on:** channel bus, world-skin ambient audio, audio WallObject. **Why:** cheap, high-immersion payoff on infrastructure that already exists.

### 4.7 Educational escape rooms (curriculum mode) — `M`–`L`, impact: high · Novel (strategic bridge)
A board poses a content question (math problem, vocabulary, a date); the answer entered on the keypad (4.1) opens the door. This turns the escape engine into a **gamified assessment** usable inside classroom/workforce contexts — the single highest-leverage cross-room move in this doc.
- **Builds on:** keypad (4.1), boards, channel bus, `getRoomTypeFeatureFlags`. **Why:** "escape room as a review activity" is a proven, beloved K-12/CTE format and we already own the entire engine.

### 4.8 AI escape-room generator — `XL`, impact: high · Novel (AI prompt→structure, extended)
"Generate a 4-room haunted-library escape, medium difficulty" → AI emits `BuildPiece[]` **and** `BuildLogicPiece[]` **and** boards **and** wired channels, validated and placed via batch. Extends FFA's planned AI prompt→structure (IDEAS §7.1) from geometry to full puzzle logic.
- **Builds on:** AI-objects pipeline, `placeBatch`, `isBuildAllowedAt`, channel-bus authoring. **Why:** authoring a good escape is hard and slow; generation is the unlock that makes the type broadly usable.

### 4.9 Template gallery / publish & share escapes — `L`, impact: high · Iterate (versioned/forkable worlds)
Publish a finished escape room as a forkable template others can clone and run. Seeds a library of ready-made escapes (incl. educational ones from 4.7) and drives the same virality as FFA world sharing.
- **Builds on:** versioned/forkable worlds (FFA IDEAS §8), escape manifest + logic snapshot. **Why:** most teachers/hosts will *run* an escape long before they *author* one; a gallery is the adoption on-ramp.

---

## 5. Cross-room synergies (the highest-leverage theme)

Three systems were each built for one room type but are pure-data and already gated by `getRoomTypeFeatureFlags`. Lighting them up elsewhere is mostly a flag flip + UX, not new engines:

| System (home) | Classroom | Workforce Training | Free-for-All | Escape Room |
|---|---|---|---|---|
| **Channel-bus logic** (Escape) | Interactive demos, "click to reveal" (1.4) | Branching skill gates (2.7) | Trigger-block minigames (FFA IDEAS §6.1) | *home* |
| **World-building kit** (FFA) | Buildable lesson props/sets | Author custom stations | *home* | *home (reused)* |
| **RoomObjects** (Classroom alt-A) | Manipulative checks (1.3) | Equipment props (2.5) | Decor/social props | Clue props / keys (4.2) |
| **World Skins** (Classroom) | Field trips (1.7) | Branded/site environments | Social ambiance | Themed escapes (4.6) |
| **AI prompt→structure** (FFA) | Auto-build a lesson set | Scenario authoring | *home* | Escape generation (4.8) |
| **Async ghost visit** (Time Capsule) | Lesson review | Self-paced training (2.8) | Tour a world | Replay an escape (4.4) |
| **Zone audio / breakout pods** | Group work | Station huddles (2.4) | Conversation tables (3.1) | Co-op comms |

**Implication:** the next time we build a "new" capability, check whether one of these engines already does 80% of it for another type first.

---

## 6. Suggested quick wins (high impact ÷ low effort)

If a short sprint wants defensible per-type value before committing to a big bet:

1. **Classroom — Cold-call randomizer (1.1, `S`)** + **Reaction scrubber (1.2, `S`–`M`)**: two small, daily-loop teacher tools on shipped primitives.
2. **Escape — Keypad + sequence gate (4.1, `M`)** + **Timed hints (4.3, `S`–`M`)**: closes the two biggest puzzle-vocabulary gaps the roadmap already flagged.
3. **Workforce — Broadcast/all-hands (2.3, `M`)**: the one instructor ability that the multi-room layout most obviously needs (and answers an open PLAN question).
4. **FFA — Conversation tables (3.1, `M`)**: makes the social hub actually social; reuses Whisper math.

Bigger strategic bets, in rough leverage order:
- **Educational escape rooms (4.7)** — reuses a finished engine to create a beloved cross-type format.
- **Station rotation (2.1)** — the feature that makes Workforce Training worth shipping past Phase 1.
- **Manipulative-anchored checks (1.3)** — finally makes "3D" pedagogically essential.
- **Logic engine in Workforce Training (2.7)** + **AI escape generator (4.8)** — the differentiators, each riding an existing engine.

---

## 7. Open questions

1. **Logic engine generalization:** do we formally promote the escape-room channel bus to a shared service (`getRoomTypeFeatureFlags(...).logic` for workforce/classroom), or keep it escape-only and copy patterns? (Recommend: generalize — 2.7 and 4.7 both depend on it.)
2. **Workforce roles:** several ideas (checkpoints, certificates) want a real `instructor`/`trainee` role divergence the PLAN deferred. Which idea triggers that schema work?
3. **Persistence scope:** completion tracking (2.2), leaderboards (4.4), and participation export (1.8) all want durable per-user records. One shared "activity/results" collection, or per-feature tables?
4. **AI cost governance:** the AI ideas (3.4, 4.8) reuse the LLM provider abstraction — do they share LessonSmith's per-tenant spend cap and audit, or get their own?
5. **Async surface:** Time Capsule (Classroom) and self-paced training (2.8) are the same read-only-visit mechanic for different types — build one generalized async-visit mode, or two?
6. **Education ↔ game bleed:** educational escape rooms (4.7) blur Classroom and Escape. Does an escape become a `LessonStep` kind, or do classrooms launch escape sub-sessions?
