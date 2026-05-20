# Avatar System — Overview & Architecture Decisions

## Goals

1. Replace the capsule+sphere avatar with a blocky humanoid rig that reads as a character, not a placeholder.
2. Give each user 23 named color zones they can customize (hair color, skin tone, shirt, pants, shoes, etc.).
3. Broadcast each user's appearance to all room participants so everyone sees the same avatar.
4. Persist appearance in the user's DB record so it follows them across sessions and devices.
5. Provide a simple, discoverable in-room editor that requires no instructions to use.
6. Animate the avatar: walk cycle, idle bob, speaking bob, raise hand, wave emote.
7. Integrate with the existing raise-hand system (right arm raises when a help request is active).
8. Allow teachers to lock the editor during a lesson run.

## Non-goals

- Pixel-by-pixel skin painting (future addition — the zone system is compatible with this later)
- Minecraft skin file import (future addition — same reason)
- Per-user asymmetric arm/leg colors (left arm always matches right arm)
- Facial feature geometry (eyes, nose, etc. are implied by face zone colors, not separate meshes)
- Avatar physics or ragdoll
- Custom animations beyond the five listed above

## Architecture decisions

### Why zone-based color picker instead of skin upload

Skin upload requires file storage, upload endpoints, transmitting image data to participants (large), and careful UV atlas implementation. The zone approach stores ~23 hex strings, broadcasts trivially, and still achieves hair-vs-face, shirt-vs-pants, collar-vs-chest expressiveness. The two aren't mutually exclusive — the box geometry and UV layout required here is 100% reusable if skin upload is added later.

### Why a separate `avatar.appearance.v1` LiveKit message

The existing `avatar.state.v1` is sent 12 times per second, unreliably, and must stay small. Appearance data (23 hex strings, ~700 bytes) doesn't change on movement — it only changes when the user edits their avatar. Bundling it into the state message would transmit ~8 kB/sec of static data per participant for no reason. Instead, appearance is sent once on join and again whenever the user saves changes, using a `reliable: true` message.

### Why appearance is stored in the user DB record (not room state)

Appearance is a user-level property, not a room-level one. Storing it in the user record means it loads before the user even joins a room, eliminating any "avatar pops in with wrong colors" flash on join.

### Why the editor is accessible mid-lesson by default (teacher can lock)

Forcing students to customize before entering a room creates friction. Allowing mid-session edits is low-cost (the avatar updates for all participants instantly). The teacher lock gives classrooms that need focus the ability to restrict it.

## Integration points with existing code

### `RoomView3D.tsx:650-683` — Avatar component

This is the component to replace. The entire `Avatar` function is swapped for the new `BlockyAvatar` component. The surrounding call site in `RoomView3D` doesn't change — it still receives a `ParticipantView` prop. The `BlockyAvatar` pulls appearance data from a new `useAvatarAppearance(participantId)` hook.

### `packages/contracts/src/index.ts`

Add two new schemas:
- `AvatarAppearanceSchema` — the 23-zone color object
- `AvatarAppearanceMessageSchema` — the LiveKit message envelope

### `apps/api/src/models/mongoose.ts:35-42`

Extend the `userSchema.avatar` sub-document to include an `appearance` field holding the serialized zone colors.

### `apps/web/components/RoomClient.tsx`

- Add a new LiveKit message listener for `avatar.appearance.v1`
- Maintain a `Map<participantId, AvatarAppearance>` in state
- Broadcast local user's appearance on room join and on save
- Pass appearance data down through `ParticipantView` (or via a context/hook)
- Add the avatar editor open/close state and the HUD button

### `apps/web/components/ClassroomPanel.tsx`

The raise-hand status is already available. The `BlockyAvatar` component reads `helpRequests` from classroom state (already in scope via context) to determine if the right arm should be raised.

### Lesson lock mechanism

Follow the same pattern as spotlight force-mode lock (`RoomClient.tsx:146`). Add a flag `avatarEditorLocked` derived from classroom state. When `lessonRun.status === "running"` and the teacher has set the lock, the editor button is disabled and the panel cannot open. The lock toggle is a new teacher action: `{ type: "set-avatar-editor-locked", locked: boolean }`.

## Data flow summary

```
User changes color in editor
  → useAvatarAppearance hook updates local state
  → API PATCH /v1/users/me/avatar (saves to DB)
  → Sends avatar.appearance.v1 via LiveKit (reliable)
    → All participants receive it
    → Their useAvatarAppearance(participantId) stores it
    → BlockyAvatar re-renders with new colors
```

```
User joins room
  → API GET /v1/rooms/:id/join returns user's stored appearance
  → Local appearance initialized from DB record
  → Sends avatar.appearance.v1 to room on join
  → Remote participants receive and apply
```
