# RoomObject hero — district demo script (60–90 s)

Use on staging with `ENABLE_ROOM_OBJECTS=true`, `NEXT_PUBLIC_ENABLE_ROOM_OBJECTS=true`, and `room.settings.roomObjects.enabled` on the pilot room.

Visual sign-off lineage: Phase 0 harness at `/dev/room-object-hero` (dev only). In-room screenshots for PR: 3D + 2D.

## Script

1. **Teacher** opens the room → expands **Objects** in the right HUD → **Place** on **Water molecule (H₂O)** (spawns ~0.5 m ahead).
2. **Teacher** opens the inspector → toggles **Model style** to **Space-filling** (class should see the change within ~200 ms).
3. **Teacher** sets touch policy to **Granted** → selects a student → **Apply touch policy**.
4. **Student** grabs the object (3D drag or 2D icon) → rotates / scales; **teacher** observes sync in a second tab.
5. **Teacher** clicks **Reset** → student sees default pose, parameters, and scale.
6. **Teacher** clicks **Remove** → object disappears for all viewers.

## Regression harness

- `/dev/room-object-hero` — orbit + parameter widgets + triangle count (not linked from teacher UI).
- Regenerate catalog thumbnail: `node packages/room-objects/scripts/render-hero-thumbnail.mjs`

## Quality gates (Phase 7)

- [ ] Interactive 3D flow (two tabs, grab sync)
- [ ] Interactive 2D flow (no 3D canvas required)
- [ ] Inspector parameters driven by catalog `parameterSchemaJson`
- [ ] Hero loads in ≤ 5 s on baseline Chromebook
- [ ] Toolbar shows hero only as **Place**; other templates **Coming soon**
