# Data Model & Networking

## 1. TypeScript type — AvatarAppearance

Define in `packages/contracts/src/index.ts`.

```typescript
export const AvatarAppearanceSchema = z.object({
  hairTop:     z.string(),
  hairFront:   z.string(),
  headSide:    z.string(),
  hairBack:    z.string(),
  faceSkin:    z.string(),
  faceAccent:  z.string(),
  collar:      z.string(),
  shirtFront:  z.string(),
  shirtBelly:  z.string(),
  shirtBack:   z.string(),
  shirtSide:   z.string(),
  shoulderTop: z.string(),
  shoulderCap: z.string(),
  sleeve:      z.string(),
  hand:        z.string(),
  thigh:       z.string(),
  shin:        z.string(),
  legSide:     z.string(),
  legBack:     z.string(),
  shoeTop:     z.string(),
  shoeToe:     z.string(),
  shoeSide:    z.string(),
  shoeSole:    z.string(),
});

export type AvatarAppearance = z.infer<typeof AvatarAppearanceSchema>;
```

All values are CSS hex color strings (`"#rrggbb"`). No validation beyond string — the UI enforces valid hex via `<input type="color">`.

## 2. LiveKit message — avatar.appearance.v1

Add to `packages/contracts/src/index.ts`:

```typescript
export const AvatarAppearanceMessageSchema = z.object({
  type:          z.literal("avatar.appearance.v1"),
  participantId: z.string(),
  appearance:    AvatarAppearanceSchema,
});

export type AvatarAppearanceMessage = z.infer<typeof AvatarAppearanceMessageSchema>;
```

This message is sent:
- **On room join** — the local participant broadcasts their stored appearance to everyone already in the room.
- **On save** — whenever the user saves changes in the editor.

It is NOT sent on every state tick. It is sent with `reliable: true` (guaranteed delivery, TCP-backed).

Serialized size: 23 keys × ~16 chars average = ~370 bytes. Well within LiveKit message limits.

## 3. Database schema change

File: `apps/api/src/models/mongoose.ts`

Extend the `userSchema` `avatar` sub-document:

```typescript
// Before:
avatar: { color: String, initials: String }

// After:
avatar: {
  color:      String,
  initials:   String,
  appearance: {
    hairTop:     String, hairFront:   String, headSide:    String,
    hairBack:    String, faceSkin:    String, faceAccent:  String,
    collar:      String, shirtFront:  String, shirtBelly:  String,
    shirtBack:   String, shirtSide:   String, shoulderTop: String,
    shoulderCap: String, sleeve:      String, hand:        String,
    thigh:       String, shin:        String, legSide:     String,
    legBack:     String, shoeTop:     String, shoeToe:     String,
    shoeSide:    String, shoeSole:    String,
  }
}
```

All appearance fields are optional at the schema level. If `appearance` is null/undefined when a user joins, the server returns null and the client derives defaults from the role color (see `03-zone-system.md`).

No migration is required — MongoDB is schemaless and existing documents without the `appearance` field are valid.

## 4. API endpoints

### GET /v1/users/me

Already exists. Extend the response type to include `avatar.appearance`:

```typescript
// Response shape addition:
{
  avatar: {
    color: string;
    initials: string;
    appearance: AvatarAppearance | null;
  }
}
```

The client calls this on auth load to initialize the local user's appearance before entering any room.

### PATCH /v1/users/me/avatar

New endpoint. Persists avatar appearance changes.

**Request body:**
```typescript
{ appearance: AvatarAppearance }
```

**Handler:**
```typescript
router.patch("/users/me/avatar", requireAuth, async (req, res) => {
  const parsed = z.object({ appearance: AvatarAppearanceSchema }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid appearance" });

  await models.User.updateOne(
    { id: req.user.id },
    { $set: { "avatar.appearance": parsed.data.appearance, updatedAt: new Date().toISOString() } }
  );

  res.json({ ok: true });
});
```

**Response:** `{ ok: true }` on success, `400` on invalid body, `401` if not authenticated.

### Room join response — include appearance

When a participant joins a room, the join response (or a separate fetch) should include the appearances of all current participants so new joiners render everyone correctly immediately, without waiting for each participant to re-broadcast.

Options:
- **Option A (simpler):** Each participant re-broadcasts `avatar.appearance.v1` when they receive a `participant.joined` LiveKit event (someone new enters the room). This means new joiners get everyone's appearance within ~100ms via the existing message flow.
- **Option B (cleaner):** The API's room join endpoint returns an array of `{ participantId, appearance }` for current participants.

**Recommendation: Option A.** It requires no API change. When the local client sees a `participantJoined` LiveKit event, it immediately re-sends its own `avatar.appearance.v1`.

## 5. Client-side appearance state — useAvatarAppearance hook

File: `apps/web/lib/useAvatarAppearance.ts`

This hook manages the in-memory appearance map for all participants in the room.

```typescript
type AppearanceMap = Map<string, AvatarAppearance>;  // key = participantId

export function useAvatarAppearance() {
  const [appearances, setAppearances] = useState<AppearanceMap>(new Map());

  // Called by RoomClient when an avatar.appearance.v1 message arrives
  function receiveAppearance(participantId: string, appearance: AvatarAppearance) {
    setAppearances(prev => new Map(prev).set(participantId, appearance));
  }

  // Called when local user saves
  function setLocalAppearance(participantId: string, appearance: AvatarAppearance) {
    setAppearances(prev => new Map(prev).set(participantId, appearance));
  }

  function getAppearance(participantId: string, roleColor: string): AvatarAppearance {
    return appearances.get(participantId) ?? defaultAppearance(roleColor);
  }

  return { appearances, receiveAppearance, setLocalAppearance, getAppearance };
}
```

This hook lives in `RoomClient` and is passed down (or via context) to wherever `BlockyAvatar` is rendered.

## 6. Integrating the message listener in RoomClient

In `apps/web/components/RoomClient.tsx`, inside the LiveKit message handler (look for the `switch` on `msg.type` or similar dispatch pattern), add:

```typescript
case "avatar.appearance.v1": {
  const parsed = AvatarAppearanceMessageSchema.safeParse(msg);
  if (parsed.success) {
    receiveAppearance(parsed.data.participantId, parsed.data.appearance);
  }
  break;
}
```

Also add the re-broadcast on new participant join:

```typescript
// When a new participant joins the room:
onParticipantJoined(() => {
  if (localAppearance) {
    sendReliableMessage({
      type: "avatar.appearance.v1",
      participantId: localParticipantId,
      appearance: localAppearance,
    });
  }
});
```

And on initial room join:

```typescript
// After joining the room and receiving a token:
sendReliableMessage({
  type: "avatar.appearance.v1",
  participantId: localParticipantId,
  appearance: localAppearance,
});
```

## 7. Lesson lock — classroom action

Add a new classroom action type to `packages/contracts/src/index.ts`:

```typescript
// Add to the ClassroomActionSchema union:
z.object({ type: z.literal("set-avatar-editor-locked"), locked: z.boolean() })
```

Add an `avatarEditorLocked` field to `ClassroomStateSchema`:

```typescript
avatarEditorLocked: z.boolean().default(false).optional()
```

The API handler for classroom actions sets this field on the classroom state document when the action is received.

On the client, derive the lock state:

```typescript
const avatarEditorLocked =
  (classroom.state?.lessonRun?.status === "running") &&
  (classroom.state?.avatarEditorLocked === true);
```

The teacher UI for toggling this lock is a simple checkbox in the lesson control panel (wherever existing teacher lesson controls live — likely in `ClassroomPanel.tsx` or `LessonTimerHud`).

## 8. ParticipantView extension

The `ParticipantView` type (wherever it's defined — likely in `RoomClient.tsx` or a types file) should be extended to carry the resolved appearance:

```typescript
type ParticipantView = {
  // existing fields...
  avatarAppearance: AvatarAppearance;  // resolved, never null
};
```

This keeps `BlockyAvatar` simple — it just reads `participant.avatarAppearance` without needing to call the hook or know anything about defaults.
