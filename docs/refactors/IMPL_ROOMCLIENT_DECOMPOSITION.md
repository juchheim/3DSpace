# RoomClient Decomposition Implementation Log

Tracks execution of the `apps/web/components/RoomClient.tsx` refactor plan as sequential, behavior-preserving tranches.

## Status

- [x] PR1: Safety Net + Shared Room Types
- [x] PR2: Extract Pure Local-State Utilities
- [x] PR3: Extract Stage Shell
- [x] PR4: Extract HUD Shells
- [x] PR5: Extract Overlay Shell
- [x] PR6: Extract Action Adapters
- [x] PR7: Extract Realtime Router
- [x] PR8: Extract Session Lifecycle

## Completion Notes

### PR1: Safety Net + Shared Room Types

- Added focused room helper coverage and shared room modules under `apps/web/lib/room/`.
- Moved shared participant typing out of `RoomClient.tsx`.

### PR2: Extract Pure Local-State Utilities

- Moved room-local storage and pure selector logic into dedicated modules under `apps/web/lib/room/`.
- Reduced inline derivation logic in `RoomClient.tsx` without changing effect ownership.

### PR3: Extract Stage Shell

- Added `apps/web/components/room/RoomStage.tsx`.
- Moved stage composition and 2D/3D view selection out of `RoomClient.tsx`.

### PR4: Extract HUD Shells

- Added `RoomHudTop.tsx`, `RoomLeftHud.tsx`, and `RoomRightRail.tsx`.
- Moved large HUD render branches out of `RoomClient.tsx` while keeping state and mutations in the parent.

### PR5: Extract Overlay Shell

- Added `apps/web/components/room/RoomOverlayStack.tsx`.
- Moved modal, dock, and overlay composition out of `RoomClient.tsx`.

### PR6: Extract Action Adapters

- Added bounded action modules for wall objects, avatar persistence, floor textures, and environment updates.
- Kept dependency injection at the `RoomClient` layer.

### PR7: Extract Realtime Router

- Added `apps/web/lib/room/useRoomRealtime.ts`.
- Moved realtime client setup/teardown, message routing, sync intervals, local media publishing, participant hydration, and remote media wiring out of `RoomClient.tsx`.
- Preserved feature-handler-first dispatch order via the injected handler registry.

### PR8: Extract Session Lifecycle

- Expanded `apps/web/lib/room/useRoomSession.ts` to own join/auth gating, heartbeat lifecycle, `leaving` state, and `leaveForLobby`.
- `RoomClient.tsx` now delegates leave cleanup and navigation through the session hook.
- Added leave-flow coverage in `apps/web/tests/useRoomSession.test.ts`.

## Verification

- `npm run typecheck --workspace @3dspace/web`
- `npx vitest run apps/web/tests/useRoomSession.test.ts apps/web/tests/roomStorage.test.ts apps/web/tests/roomSelectors.test.ts`

## Current Target Shape

- `RoomClient.tsx` is now a thinner orchestration layer for hook composition, dependency wiring, and top-level state ownership.
- Shared room state and side-effect seams live under `apps/web/lib/room/`.
- Stage, HUD, and overlay composition live under `apps/web/components/room/`.
