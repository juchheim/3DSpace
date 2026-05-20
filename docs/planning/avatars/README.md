# Avatar Customization System — Planning Index

This directory contains the complete design and implementation specification for the 3DSpace avatar overhaul. The existing avatar (capsule body + sphere head, group-color only) is replaced with a Minecraft-inspired blocky box rig with per-zone color customization and a full animation system.

## Documents

| # | File | Contents |
|---|---|---|
| 1 | [01-overview.md](01-overview.md) | Goals, non-goals, architecture decisions, integration points |
| 2 | [02-avatar-rig.md](02-avatar-rig.md) | Three.js box rig hierarchy, exact dimensions, pivot points, coordinate math |
| 3 | [03-zone-system.md](03-zone-system.md) | All 23 named color zones, face-to-zone mapping, canvas texture approach |
| 4 | [04-animation.md](04-animation.md) | Walk, idle bob, speaking bob, raise hand, wave emote — math and state machine |
| 5 | [05-editor-ui.md](05-editor-ui.md) | In-room editor panel, entry points, component tree, lesson lock behavior |
| 6 | [06-data-and-networking.md](06-data-and-networking.md) | DB schema, new contracts, API endpoints, LiveKit appearance broadcast |
| 7 | [07-implementation-order.md](07-implementation-order.md) | Ordered phases, dependencies, what to test at each checkpoint |

## Quick-reference: what already exists

| Thing | Location |
|---|---|
| Current avatar render | `apps/web/components/RoomView3D.tsx:650-683` |
| Avatar state message schema | `packages/contracts/src/index.ts:275-288` |
| Avatar state broadcast | `apps/web/components/RoomClient.tsx` (sends at 12 Hz, unreliable) |
| User DB schema | `apps/api/src/models/mongoose.ts:35-42` |
| HUD panel pattern | `apps/web/components/HudCard.tsx` |
| Lesson run state | `apps/web/lib/useLessonRun.ts` |
| Raise hand implementation | `apps/web/components/ClassroomPanel.tsx:122-181` |
| Animation loop pattern | `apps/web/components/RoomView3D.tsx` — `useFrame` from React Three Fiber |

## Key decisions (rationale in 01-overview.md)

- **Zone-based color picker**, not pixel painting or skin file upload
- **23 named zones** covering hair, face, shirt (front/back/sides), arms, legs, feet
- **Canvas textures** per face where sub-zone detail is needed; material array elsewhere
- **Separate `avatar.appearance.v1` LiveKit message** — sent reliable, on change only — keeps the 12 Hz state message small
- **Avatar appearance stored in user DB record** — follows user across devices/rooms
- **Editor opens from HUD button AND clicking own avatar** in the 3D scene
- **Lesson lock**: editor is open by default; teacher can lock it when a lesson is running
- **Animations**: walk cycle, idle bob, speaking bob, raise hand, wave emote
