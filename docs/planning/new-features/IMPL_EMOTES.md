# Implementation Plan — Avatar Reactions ("Emotes")

Source idea: `LEARNING_FEATURE_IDEAS.md` § Small 1.
Branch target: `mvp-plus-one` (or a feature branch off it).
Effort estimate: ~2 days.

## Status / Scope

A small palette of avatar reactions (👍 got it, 😕 confused, ❓ question, 🙋 me!, 🤚 pause please, 🎉 done) fired from a HUD button. Reactions appear as a floating sprite above the avatar in 3D and a small badge in 2D for 2–3 seconds.

**In scope (v1):**

- Six fixed reactions, client-side only.
- Reliable LiveKit broadcast.
- Teacher kill-switch via classroom state.
- Teacher rollup in `ClassroomPanel` showing counts over the last 60s (client-side aggregate; no persistence).

**Out of scope:**

- Persistence, export, or analytics on reactions.
- "Raise hand" replacement (existing help queue stays authoritative).
- Per-class or per-grade configurable palettes.

## Feature flag

- `NEXT_PUBLIC_ENABLE_AVATAR_REACTIONS` (web only — server does not touch reactions; the classroom action below uses it just to gate the teacher toggle UI).
- Default: `false`. Flip to `true` once Phase 4 ships.

---

## Phase 1 — Contracts

**Goal:** Reaction message and "reactions locked" classroom action exist in `@3dspace/contracts` and typecheck.

**Files to change:**

- `packages/contracts/src/index.ts`

**Steps:**

1. Add reaction slug enum and message schema near the other avatar schemas:

   ```ts
   export const AvatarReactionSlugSchema = z.enum([
     "thumbs-up", "confused", "question", "me", "pause", "celebrate"
   ]);

   export const AvatarReactionMessageSchema = z.object({
     type: z.literal("avatar.reaction.v1"),
     participantId: z.string(),
     reaction: AvatarReactionSlugSchema,
     expiresAt: z.string()
   });
   export type AvatarReactionMessage = z.infer<typeof AvatarReactionMessageSchema>;
   ```

2. Add classroom action + state field:

   ```ts
   export const ClassroomSetReactionsLockedActionSchema = ClassroomActionBaseSchema.extend({
     type: z.literal("set-reactions-locked"),
     locked: z.boolean()
   });
   ```

   Add `reactionsLocked: z.boolean().default(false).optional()` to `ClassroomStateSchema`, and add `ClassroomSetReactionsLockedActionSchema` to the `ClassroomActionSchema` discriminated union.

**Checkpoint:** `npm run typecheck -w @3dspace/contracts` passes.

---

## Phase 2 — Server action

**Goal:** Teacher can lock/unlock reactions for the room. Persisted in `ClassroomState`.

**Files to change:**

- `apps/api/src/app.ts` — extend the classroom action switch:

  ```ts
  case "set-reactions-locked": {
    requireTeacher(input.actor);
    state.reactionsLocked = input.action.locked;
    break;
  }
  ```

- `apps/api/src/repository.ts` (in-memory default) and `apps/api/src/models/mongoose.ts` — confirm `reactionsLocked` round-trips via `Schema.Types.Mixed` (no schema change needed if classroom state already stores via `Mixed` / JSON; otherwise add the field).

**Tests:**

- `apps/api/tests/api.test.ts` — add a small case: teacher sets `reactionsLocked: true`, GET classroom returns same value. Student attempting `set-reactions-locked` gets 403.

**Checkpoint:** `npm test -- apps/api/tests/api.test.ts` passes.

---

## Phase 3 — Realtime + client hook

**Goal:** Local user can fire a reaction; remote users receive and store it.

**Files to change:**

- `apps/web/lib/realtime.ts` — add `AvatarReactionMessage` to the `RealtimeMessage` union. Reactions are sent reliable automatically (anything that isn't `avatar.state.v1` is reliable).
- `apps/web/lib/useAvatarReactions.ts` — **new file**, mirror `useAvatarAppearance` shape:

  ```ts
  export function useAvatarReactions() {
    const [reactions, setReactions] = useState<Map<string, AvatarReactionMessage>>(new Map());

    const receive = useCallback((msg: AvatarReactionMessage) => {
      setReactions((prev) => new Map(prev).set(msg.participantId, msg));
      const ms = Math.max(0, Date.parse(msg.expiresAt) - Date.now());
      setTimeout(() => {
        setReactions((prev) => {
          const next = new Map(prev);
          if (next.get(msg.participantId) === msg) next.delete(msg.participantId);
          return next;
        });
      }, ms);
    }, []);

    const get = useCallback((id: string) => reactions.get(id), [reactions]);
    return { receive, get, all: reactions };
  }
  ```

- `apps/web/components/RoomClient.tsx`:
  - Instantiate the hook.
  - In `handleMessage`, route `avatar.reaction.v1` → `reactions.receive(parsed)` via `AvatarReactionMessageSchema.safeParse`.
  - Expose `fireReaction(slug)` that publishes the message and applies it locally.

**Checkpoint:** In two browser windows, calling `fireReaction("confused")` from the console of window A causes window B to log a parsed reaction. Sprite UI follows in Phase 4.

---

## Phase 4 — 3D + 2D UI

**Goal:** Reactions render in 3D over the head and in 2D next to the participant dot. HUD has six buttons.

**Files to change:**

- `apps/web/components/BlockyAvatar.tsx` — new prop `reaction?: AvatarReactionSlug`. Render an additional `<Html center distanceFactor={3}>` block above the head (same fade pattern as the nameplate). Map slug → emoji.
- `apps/web/components/RoomView3D.tsx` — pass `reaction={getReaction(participant.id)}` to each `<BlockyAvatar>`. The `getReaction` resolver comes from `RoomClient` like `getAppearance` does today.
- `apps/web/components/RoomView2D.tsx` — render a small emoji badge next to the participant dot when a reaction is active.
- `apps/web/components/RoomClient.tsx`:
  - Add a HUD strip "Reactions" with six emoji buttons. Disabled when `classroom.state?.reactionsLocked === true`.
  - Buttons call `fireReaction(slug)`; default `expiresAt = now + 2500ms`.
- `apps/web/app/globals.css` — `.avatar-reaction` sprite styles + `.hud-reactions` strip styles.

**Checkpoint:** Open two windows. Click 👍 in window A. Window B shows the sprite above A's avatar for ~2.5s, then it disappears. Teacher in window A toggles "Mute reactions" → student buttons in window B disable.

---

## Phase 5 — Teacher rollup + lock control

**Goal:** Teacher sees a 60-second emoji heat strip in `ClassroomPanel` and can toggle the room-wide lock.

**Files to change:**

- `apps/web/components/ClassroomPanel.tsx`:
  - Keep a ring buffer of reactions received in the last 60s (client-side only; no persistence).
  - Render: `12 ✅  ·  4 😕  ·  1 ❓  · 0 🙋 · 0 🤚 · 0 🎉  (last 60s)`.
  - "Mute reactions" button calls `classroom.runAction({ type: "set-reactions-locked", locked: !current })`.

**Checkpoint:** With teacher + 2 students in a room, fire 3 confused emotes in 30s; the teacher panel shows `3 😕 (last 60s)`. Toggle Mute → student HUD buttons disable; existing in-flight sprites still finish their fade-out.

---

## Acceptance criteria

- Reactions fire and render in both windows within ~250 ms (LiveKit reliable RTT).
- Sprite is readable from the back tier without obscuring the nameplate.
- Teacher mute disables student HUD buttons across the room within 1 s.
- Reactions never appear in `RoomEvents`, classroom state response, or Mongo.
- `npm run typecheck` and `npm test` pass.

## Validation evidence (fill in)

- [ ] `npm run typecheck`
- [ ] `npm test -- apps/api/tests/api.test.ts`
- [ ] Manual: two-tab smoke (reaction visible across; mute toggle works)
- [ ] Manual: 3D nameplate + reaction overlap is readable at front-row and back-tier distances

## Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Reaction spam | Rate-limit local fire to 1/sec; teacher can mute room. |
| Sprite obscures nameplate | Stack vertically; nameplate stays primary. |
| Stale reactions on participant leave | `useAvatarReactions` drops entries when `participant.leave.v1` arrives. |

## Files summary

**New:**

- `apps/web/lib/useAvatarReactions.ts`

**Modified:**

- `packages/contracts/src/index.ts`
- `apps/api/src/app.ts`
- `apps/api/src/models/mongoose.ts` (only if `reactionsLocked` needs explicit storage)
- `apps/web/lib/realtime.ts`
- `apps/web/components/RoomClient.tsx`
- `apps/web/components/RoomView3D.tsx`
- `apps/web/components/RoomView2D.tsx`
- `apps/web/components/BlockyAvatar.tsx`
- `apps/web/components/ClassroomPanel.tsx`
- `apps/web/app/globals.css`
