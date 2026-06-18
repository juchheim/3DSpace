# World Builder — Lighting System

A user-friendly, technically deep real-time lighting toolset for the World
Builder, surfaced as a new **Lighting** tab. Builders place and finely tune
real lights (point / spot / soft area), aim them with an in-world gizmo, and
shape the whole room's mood through a global **Environment** panel (sun & sky,
image-based lighting, fog, exposure). Everything is shared, persisted, and
multi-user — same architecture as build pieces and placed world assets.

## Documents

| Doc | What it covers |
| --- | --- |
| [`PLAN_WORLD_BUILDER_LIGHTING.md`](./PLAN_WORLD_BUILDER_LIGHTING.md) | The exhaustive design: which lighting methods were chosen and why, full data model, rendering/performance strategy, UI/UX spec (Verse room + lobby aesthetic), permissions, risks, acceptance criteria. |
| [`IMPL_WORLD_BUILDER_LIGHTING.md`](./IMPL_WORLD_BUILDER_LIGHTING.md) | The phased, file-by-file implementation breakdown (contracts → API → web hook → render layer → Lighting tab UI → environment editor → polish → validation). |
| [`PLAN_IN_WORLD_LIGHT_EDITOR.md`](./PLAN_IN_WORLD_LIGHT_EDITOR.md) | **Follow-up — improving how lights are adjusted.** Moves per-light editing out of the docked form and **into the 3D world, attached to the selected light**: a 3-axis move gizmo, an aim handle for directionality, direct shape handles, and a Verse/lobby-themed control card. Heavy, explicit UI/UX section; covers X/Y/Z, aim, and every other adjustable parameter. |
| [`IMPL_IN_WORLD_LIGHT_EDITOR.md`](./IMPL_IN_WORLD_LIGHT_EDITOR.md) | The phased, file-by-file plan for the in-world editor (math/plumbing → control card → move gizmo → aim gizmo → shape gizmo + helpers → polish/a11y → validation). Web/UX-only; reuses the shipped lighting stack and flag — no contracts/API/realtime changes. |

## One-paragraph pitch

Today the World Builder has a single fixed-warmth `light` build piece (a lamp
GLB with a budgeted point light) and the room's global lighting is baked into
the active World Skin. The Lighting system promotes lighting to a first-class,
fully configurable layer: a **Lighting** tab where you add **Point**, **Spot**,
and **Soft Panel (area)** lights, drop them anywhere, and tune exact position,
direction/aim, color, intensity, range, falloff, cone angle, softness, and
shadow casting — plus a global **Sun & Sky / Environment** sub-panel for the
directional sun, hemisphere/ambient fill, HDRI image-based lighting, fog, and
filmic tone-mapping exposure. Lights are a new server-authoritative `RoomLight`
entity layer (mirroring `PlacedWorldAsset`); the environment is a per-room
`RoomEnvironment` settings object. The whole feature ships behind
`ENABLE_WORLD_BUILDER_LIGHTING` (default off).

## Status

- **Lighting system: implemented** behind `ENABLE_WORLD_BUILDER_LIGHTING`
  (placeable point/spot/area lights + per-room environment).
- **In-World Light Editor: implemented (Phases 0–6).** Per-light adjustment lives in the
  3D scene on the selected light (Move/Aim/Shape gizmos + tethered Verse/lobby-themed
  control card). The dock keeps Add/list/Environment only. Reuses the shipped lighting
  stack and the same feature flag — no new persistence or API surface.
- Branch target: `feature/world-building` (active building branch).
