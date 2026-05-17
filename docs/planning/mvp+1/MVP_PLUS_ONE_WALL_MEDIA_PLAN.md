# 3DSpace MVP+1 Wall Media Plan

Last updated: 2026-05-17

## Purpose

MVP+1 extends the MVP classroom from "people moving and talking in a shared room" to "people teaching and learning with durable and live materials placed on the room walls."

The primary goal is to let authorized users put useful things on wall surfaces:

- Live webcam video.
- Live microphone audio.
- Images.
- A web browser or browser-tab share.
- Uploaded image, video, and audio files.
- Additional education-first wall objects such as documents, slides, whiteboards, notes, polls, timers, and resource cards.

The planning assumption is that the MVP intentionally prepared for this work. This document confirms that preparation from the existing docs and code, then defines the MVP+1 product, architecture, contracts, data model, user experience, security model, rollout phases, and acceptance criteria in implementation-ready detail.

## Executive Summary

The MVP is correctly shaped for MVP+1. The app already has a shared room manifest, versioned API contracts, wall anchors, attachment records, signed storage targets, room events, LiveKit media and data channels, 3D and 2D renderers, membership authorization, feature flags, and local tests around the core flows.

MVP+1 should not treat every wall thing as a file attachment. Files are one source type. Live camera, live audio, screen share, browser/tab share, whiteboards, polls, and timers need a broader entity: a `WallObject` placed on a `WallAnchor`. Existing `WallAttachment` records can become the asset layer for file-backed wall objects.

The first shipped slice should be:

- Teacher can add image, video, and audio files to a wall anchor.
- Teacher can pin their camera or screen/browser tab to a wall anchor.
- Everyone in the room sees the wall object in 3D and the 2D analog.
- Playback and wall-object changes synchronize over room realtime channels.
- Teacher can remove, lock, and moderate wall objects.
- Student creation is configurable and defaults to off unless a teacher enables it.

Then the same system can support richer classroom tools: whiteboards, slide decks, PDFs, sticky notes, web resource cards, embedded allowlisted web pages, polls, timers, and collaborative annotations.

## MVP Readiness Review

### Documentation Confirmation

The MVP docs explicitly prepared the app for wall media:

- `docs/planning/mvp/MVP_IMPLEMENTATION_PLAN.md` states that wall planes and anchor points should exist from MVP day one, attachment metadata should support image/video/audio/future kinds, and media track handling should be abstracted for screen share and computer audio.
- `docs/planning/mvp/MVP_STATUS.md` marks "wall attachment upload/download readiness" complete locally, including manifest anchors, attachment records, signed upload/download target services, and placeholder UI.
- The MVP backlog includes screen sharing, computer audio sharing, rich wall-mounted image/video/audio placement, whiteboards, collaborative objects, analytics, recording, replay, and transcripts.

### Code Confirmation

The current code supports MVP+1 in several important places:

- `packages/contracts/src/index.ts`
  - `WallAnchorSchema` defines anchor id, label, position, normal, width, height, and metadata.
  - `WallPlaneSchema` links wall planes to anchor ids.
  - `AttachmentKindSchema` already includes `image`, `video`, `audio`, and `future`.
  - `WallAttachmentSchema` stores room id, anchor id, kind, file name, content type, storage key, status, public URL, metadata, creator, and timestamps.
  - `RoomCapabilitiesSchema` advertises `wallAttachments` and `roomEvents`.
  - `RoomFeatureSchema` provides typed extension points through `key`, `enabled`, and `config`.
  - `RoomEventRequestSchema` provides a durable event intake path.

- `packages/room-engine/src/index.ts`
  - `createDefaultRoomManifest` creates front/back/left/right wall planes and five anchors.
  - Anchors already include size, position, normal, labels, and `metadata.accepts`.
  - Feature seeds exist for `screen-share`, `computer-audio`, and `wall-attachments`.
  - The manifest is shared by 3D and 2D renderers.

- `apps/api/src/app.ts`
  - `POST /v1/rooms/:roomId/attachments` creates attachment records and signed upload targets.
  - `GET /v1/rooms/:roomId/attachments` lists attachments.
  - `GET /v1/rooms/:roomId/attachments/:attachmentId/download` creates download targets.
  - Attachment creation validates that the requested anchor exists in the active manifest.
  - Room access and teacher-only class/room operations are enforced server-side.
  - `POST /v1/rooms/:roomId/events` already persists durable room events.
  - `POST /v1/rooms/:roomId/session` returns room capabilities and tuning.

- `apps/api/src/services/storage.ts`
  - S3-compatible signed PUT and GET targets are implemented.
  - Local development fallback URLs exist for upload/download readiness.
  - Storage keys already organize assets under room and anchor prefixes.

- `apps/api/src/models/mongoose.ts`
  - Mongo schemas exist for rooms, manifests, wall attachments, room events, and room sessions.
  - `WallAttachment` is indexed by `roomId` and `wallAnchorId`.
  - Room manifests are versioned by `roomId` and `version`.

- `apps/web/components/AnchorPanel.tsx`
  - The MVP UI lists anchors and their accepted kinds.
  - It can create image/video/audio attachment metadata and request signed uploads/downloads.
  - This is intentionally a readiness panel, not yet a full wall placement workflow.

- `apps/web/components/RoomView3D.tsx`
  - 3D walls and anchors are rendered from the shared manifest.
  - Anchors are already placed with correct position, normal, width, and height.
  - Remote camera streams are already rendered as avatar-adjacent video cards.

- `apps/web/components/RoomView2D.tsx`
  - 2D analog renders walls, anchors, participants, speaking state, and camera state from the same manifest.

- `apps/web/lib/realtime.ts`
  - LiveKit data channels already carry versioned realtime state.
  - LiveKit camera and microphone track publish/subscribe are implemented.
  - The adapter already separates realtime messages from remote media updates.
  - `BroadcastChannel` fallback supports local multi-tab validation.

- `apps/web/lib/useLocalMedia.ts` and `apps/web/components/MediaControls.tsx`
  - Camera, microphone, permission text, local preview, and speaking detection already exist.

- Tests
  - API tests cover class/room/invite/session flows, attachment upload/download target creation, OpenAPI exposure, 30-participant capacity, and session join rate limiting.
  - Room engine tests cover manifest creation, wall anchors, 2D projection, movement bounds, interpolation, and spatial audio math.

### Readiness Verdict

The MVP did prepare the app for MVP+1. The strongest existing foundations are the shared manifest and anchor geometry, typed contracts, signed storage, LiveKit media/data abstraction, and dual 3D/2D renderers.

The main gap is conceptual: the current `WallAttachment` model represents uploaded file metadata, not the complete set of things that can be placed on walls. MVP+1 should introduce a `WallObject` layer and use `WallAttachment` or a successor `WallAsset` as a file source.

## Product Goals

### Primary User Outcomes

Teachers can:

- Add a file-backed image, video, or audio object to a wall.
- Pin their live webcam to a wall.
- Pin a browser tab or screen share to a wall.
- Add a web resource card or allowlisted embed.
- Arrange, resize, replace, lock, and remove wall objects.
- Decide whether students may create wall objects.
- Moderate student-created objects before or after they appear.
- Keep the class usable in 2D mode when 3D is unavailable.

Students can:

- View and hear wall objects in the shared room.
- Open accessible details for wall objects.
- Interact with teacher-enabled objects such as polls, whiteboards, notes, or links.
- Share their camera, mic, files, or browser tab only when room policy allows it.
- Understand when their live media is visible or audible to others.

Everyone can:

- See the same wall state after joining or reconnecting.
- Receive clear feedback for loading, permission, unsupported content, blocked embeds, and network failures.
- Continue moving, speaking, and switching 3D/2D mode while wall objects exist.

### Non-Goals For The First MVP+1 Slice

- Arbitrary remote browser rendering hosted by 3DSpace infrastructure.
- Full LMS integration.
- Persistent recording/replay of wall sessions.
- Advanced room builder.
- Full asset library across classes.
- Multi-room breakout orchestration.
- Complex 3D physics, occlusion, or lighting for media surfaces.

These should remain planned extension points, not blockers for the first MVP+1 release.

## Core Product Model

MVP+1 should model walls as classroom display surfaces. A wall surface is not just a static upload slot. It can show durable content, live streams, interactive tools, or links to external resources.

### Anchor

An anchor is a manifest-defined placement target.

Existing fields:

- `id`
- `label`
- `position`
- `normal`
- `width`
- `height`
- `metadata`

MVP+1 should keep this structure and add optional metadata conventions:

- `accepts`: allowed wall object types for this anchor.
- `capacity`: maximum number of concurrent wall objects.
- `layout`: `single`, `grid`, `stack`, `rail`, or `freeform`.
- `defaultRole`: `primary-display`, `resource-rail`, `back-channel`, or `student-share`.
- `minObjectSize` and `maxObjectSize`.
- `supportsInteraction`: boolean.
- `moderationPolicy`: `teacher-only`, `student-request`, `student-direct`, or `locked`.

These can remain metadata initially, then become typed contract fields when stable.

### Wall Object

A `WallObject` is the primary MVP+1 entity. It represents something placed on a wall anchor.

Required fields:

- `id`: stable object id.
- `roomId`: room id.
- `wallAnchorId`: anchor id from the active manifest.
- `type`: specific object type.
- `title`: user-visible title.
- `description`: optional user-visible description.
- `source`: object source details.
- `placement`: position and size within the anchor.
- `state`: runtime or persisted state for the object.
- `permissions`: who may view, edit, control, or remove it.
- `status`: lifecycle state.
- `moderation`: moderation metadata.
- `createdByUserId`
- `updatedByUserId`
- `createdAt`
- `updatedAt`
- `version`: optimistic concurrency version.

Recommended `type` values:

- `image.file`
- `video.file`
- `audio.file`
- `camera.live`
- `microphone.live`
- `screen.live`
- `browser-tab.live`
- `web.embed`
- `web.link`
- `document.file`
- `slides.file`
- `whiteboard`
- `note`
- `poll`
- `timer`
- `future`

### Wall Asset

A `WallAsset` is a stored file. The current `WallAttachment` can be used as the first asset record, but MVP+1 should avoid using "attachment" as the only wall-object abstraction.

Suggested evolution:

- Keep existing `WallAttachment` APIs for compatibility during the first slice.
- Add new `WallObject` APIs that may reference an existing `attachmentId`.
- Optionally rename internally later to `WallAsset`, while preserving API compatibility.

File-backed wall object example:

```json
{
  "id": "wallobj_abc",
  "roomId": "room_123",
  "wallAnchorId": "anchor-board",
  "type": "image.file",
  "title": "Lesson diagram",
  "source": {
    "kind": "asset",
    "attachmentId": "attachment_123"
  },
  "placement": {
    "x": 0,
    "y": 0,
    "width": 1,
    "height": 1,
    "zIndex": 1
  },
  "state": {
    "loaded": false
  },
  "status": "active",
  "version": 1
}
```

Live wall object example:

```json
{
  "id": "wallobj_live",
  "roomId": "room_123",
  "wallAnchorId": "anchor-board",
  "type": "browser-tab.live",
  "title": "Teacher browser",
  "source": {
    "kind": "livekit-track",
    "participantIdentity": "user_1:room_123",
    "trackSource": "screen_share",
    "publicationName": "wall:wallobj_live"
  },
  "placement": {
    "x": 0,
    "y": 0,
    "width": 1,
    "height": 1,
    "zIndex": 1
  },
  "state": {
    "live": true,
    "muted": false
  },
  "status": "active",
  "version": 1
}
```

## Object Types And Behavior

### Images

Use cases:

- Lesson diagrams.
- Student work samples.
- Maps.
- Photos.
- Screenshots.
- Anchor charts.

Behavior:

- Upload through signed storage.
- Create a `WallObject` after upload finalization.
- Render on a 3D wall plane and in the 2D analog.
- Support title, alt text, fit mode, and optional caption.
- Support teacher-controlled remove/replace.

Required metadata:

- `altText`
- `caption`
- `fit`: `contain`, `cover`, or `stretch`
- `naturalWidth`
- `naturalHeight`
- `contentType`
- `sizeBytes`

### Video Files

Use cases:

- Short demonstrations.
- Recorded experiments.
- Class clips.
- Student presentations.

Behavior:

- Upload through signed storage.
- Render with play/pause, seek, mute, captions if available, and full detail view.
- Playback state may be teacher-synchronized or local-only.
- Default should be teacher-synchronized for primary board videos.
- Autoplay with sound must not be assumed because browsers restrict it.

Required metadata:

- `durationSeconds`
- `posterAttachmentId`
- `captionAttachmentId`
- `transcriptAttachmentId`
- `fit`
- `sizeBytes`

Synchronized state shape:

```json
{
  "type": "wall.playback.state.v1",
  "roomId": "room_123",
  "objectId": "wallobj_video",
  "status": "playing",
  "positionSeconds": 42.4,
  "rate": 1,
  "muted": false,
  "sentAt": 1710000000000,
  "controlledByUserId": "teacher_1"
}
```

### Audio Files

Use cases:

- Language listening exercises.
- Music examples.
- Pronunciation samples.
- Sound effects for lessons.

Behavior:

- Upload through signed storage.
- Render as a compact wall player.
- Spatialize from the anchor position when enabled.
- Support synchronized teacher playback and local volume controls.
- Show waveform or progress if metadata is available.

Required metadata:

- `durationSeconds`
- `transcriptAttachmentId`
- `caption`
- `sizeBytes`

### Live Webcam On Wall

Use cases:

- Teacher demonstration camera.
- Student presentation.
- Guest speaker spotlight.
- Small group "presenter" feed.

Behavior:

- Reuse existing camera capture and LiveKit publication where possible.
- Creating a wall object should reference a LiveKit participant and track source.
- Do not require a second camera capture if the user already has camera enabled.
- If camera is off, wall object enters `waiting_for_source`.
- Everyone sees a visible "live" badge.
- The sharer sees an always-visible indicator that their camera is pinned to the wall.

Recommended initial implementation:

- `camera.live` wall object references participant identity and `Track.Source.Camera`.
- Renderer attaches the same `MediaStream` already delivered through `onRemoteMedia`.
- Local renderer can use local `cameraStream`.
- If multiple camera tracks become possible later, match by publication name or SID.

### Live Microphone On Wall

Use cases:

- Announcement source.
- Language pronunciation spotlight.
- Guest speaker audio.
- Audio source pinned to a specific location.

Behavior:

- Reuse existing microphone capture and LiveKit publication where possible.
- `microphone.live` wall object references participant identity and `Track.Source.Microphone`.
- Audio is spatialized from anchor position instead of avatar position while pinned.
- Teacher can force object-level mute if the user has permission.
- UI must distinguish avatar mic from wall-pinned mic source.

Important design point:

- A participant's microphone should not be double-audible through both avatar spatial audio and wall spatial audio at full volume.
- When a mic is pinned to a wall, clients should either move that participant's audio panner source to the wall anchor or apply an attenuation rule to avoid duplication.

### Browser Or Browser-Tab Share

Users asked for "a web browser" on the wall. There are three practical levels:

1. Browser-tab live share.
   - Use `navigator.mediaDevices.getDisplayMedia`.
   - Publish screen video through LiveKit with `Track.Source.ScreenShare`.
   - Publish browser/system audio when supported by browser and OS.
   - This is the most reliable MVP+1 interpretation of "web browser on the wall."

2. Allowlisted web embed.
   - Render an iframe for safe, embeddable resources.
   - Many sites block iframe embedding with `X-Frame-Options` or CSP.
   - Some education tools require auth and should not be embedded blindly.
   - Use a sandboxed iframe and an explicit allowlist.

3. Web resource card.
   - Show title, URL, description, favicon, and "open in new tab."
   - This is the fallback for blocked or unsafe embeds.

MVP+1 should ship browser-tab live share first, plus web resource cards. Allowlisted embeds can follow once CSP, moderation, and school policy requirements are clear.

Browser-tab live share behavior:

- Teacher selects "Share browser tab or screen."
- Browser permission picker opens.
- App creates `browser-tab.live` or `screen.live` wall object.
- LiveKit publishes screen video under `publicationName: wall:<objectId>`.
- If tab audio is available, publish associated audio under `publicationName: wall:<objectId>:audio`.
- Stopping the share marks the object `source_ended`.

Allowlisted embed behavior:

- Teacher enters URL.
- API validates scheme and host.
- API creates `web.embed` only if host is allowlisted.
- Client renders iframe with restrictive sandbox flags.
- If embed fails, object downgrades to `web.link`.

Web link behavior:

- API creates `web.link` for any safe `https://` URL allowed by room policy.
- Client renders a card with a launch button.
- Use `rel="noopener noreferrer"` and no credential capture.

### Documents And Slides

Use cases:

- PDFs.
- Slide decks.
- Worksheets.
- Reading passages.
- Rubrics.

Recommended MVP+1 treatment:

- Start with `document.file` rendered as a resource card plus download/open action.
- Add PDF page rendering only after performance testing.
- Treat slide decks as either file resources or browser-tab live share at first.
- Later, add `slides.file` with page navigation and synchronized presenter state.

### Whiteboards

Use cases:

- Teacher explanations.
- Student collaboration.
- Brainstorming.
- Annotation over images.

Recommended phase:

- Do not include full whiteboard editing in the first wall-media slice.
- Reserve `whiteboard` object type and API shape.
- First implementation can support simple notes and drawing-free pinned text.
- Full whiteboard should add CRDT or event-sourced collaboration after wall-object basics are stable.

### Notes, Polls, Timers, And Resource Cards

These are high-value education objects with lower media complexity:

- `note`: rich text or plain text pinned to a wall.
- `poll`: question, choices, anonymous/non-anonymous setting, result visibility.
- `timer`: countdown/count-up with teacher controls.
- `web.link`: safe resource card.
- `assignment.card`: external or internal activity link.

These should use the same `WallObject` contract so they can be placed, moved, locked, moderated, and rendered consistently.

## Data Model

### WallObject Contract

Add shared schemas in `packages/contracts/src/index.ts`.

Recommended Zod enum:

```ts
export const WallObjectTypeSchema = z.enum([
  "image.file",
  "video.file",
  "audio.file",
  "camera.live",
  "microphone.live",
  "screen.live",
  "browser-tab.live",
  "web.embed",
  "web.link",
  "document.file",
  "slides.file",
  "whiteboard",
  "note",
  "poll",
  "timer",
  "future"
]);
```

Recommended source schema:

```ts
export const WallObjectSourceSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("asset"),
    attachmentId: z.string(),
    url: z.string().optional()
  }),
  z.object({
    kind: z.literal("livekit-track"),
    participantIdentity: z.string(),
    participantId: z.string(),
    trackSource: z.enum(["camera", "microphone", "screen_share", "screen_share_audio"]),
    publicationSid: z.string().optional(),
    publicationName: z.string().optional()
  }),
  z.object({
    kind: z.literal("web-url"),
    url: z.string().url(),
    embedMode: z.enum(["link", "iframe"])
  }),
  z.object({
    kind: z.literal("inline"),
    data: z.record(z.unknown()).default({})
  })
]);
```

Recommended placement schema:

```ts
export const WallObjectPlacementSchema = z.object({
  x: z.number().min(0).max(1).default(0),
  y: z.number().min(0).max(1).default(0),
  width: z.number().positive().max(1).default(1),
  height: z.number().positive().max(1).default(1),
  zIndex: z.number().int().default(0),
  fit: z.enum(["contain", "cover", "stretch"]).default("contain")
});
```

Recommended wall object schema:

```ts
export const WallObjectSchema = z.object({
  id: z.string(),
  roomId: z.string(),
  wallAnchorId: z.string(),
  type: WallObjectTypeSchema,
  title: z.string().min(1).max(160),
  description: z.string().max(1000).optional(),
  source: WallObjectSourceSchema,
  placement: WallObjectPlacementSchema,
  state: z.record(z.unknown()).default({}),
  permissions: z.record(z.unknown()).default({}),
  status: z.enum([
    "draft",
    "pending_upload",
    "pending_moderation",
    "active",
    "paused",
    "source_ended",
    "failed",
    "removed",
    "rejected"
  ]),
  moderation: z.record(z.unknown()).default({}),
  createdByUserId: z.string(),
  updatedByUserId: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  version: z.number().int().positive()
});
```

### Persistence

Add a `WallObject` collection.

Indexes:

- Unique `id`.
- `{ roomId: 1, status: 1 }`.
- `{ roomId: 1, wallAnchorId: 1 }`.
- `{ roomId: 1, updatedAt: -1 }`.
- Optional `{ roomId: 1, type: 1, status: 1 }`.

Do not embed wall objects in the manifest. The manifest defines stable geometry and anchors. Wall objects are room content that changes frequently and should be queried independently.

### Relationship To Existing WallAttachment

Use this split:

- `WallAttachment`: uploaded file metadata and signed access.
- `WallObject`: visible thing placed on the wall.

For the first slice, a file upload flow can be:

1. Create `WallAttachment` with `pending_upload`.
2. Upload file to signed URL.
3. Finalize attachment and mark `ready`.
4. Create `WallObject` referencing `attachmentId`.

The current API lacks finalize semantics and leaves records in `pending_upload`. MVP+1 should add explicit finalize or callback handling before files appear as active wall objects.

### Room Events

Persist durable changes through `RoomEvent` for audit and replay diagnostics.

Recommended event types:

- `wall.object.created.v1`
- `wall.object.updated.v1`
- `wall.object.removed.v1`
- `wall.object.moderated.v1`
- `wall.object.locked.v1`
- `wall.asset.finalized.v1`
- `wall.playback.controlled.v1`
- `wall.share.started.v1`
- `wall.share.ended.v1`
- `wall.embed.failed.v1`

Room events should not replace primary wall-object persistence. They should record significant actions.

## API Plan

### New Wall Object Endpoints

Add these typed routes:

- `GET /v1/rooms/:roomId/wall-objects`
  - Lists active and visible wall objects for the current user.
  - Query params: `status`, `anchorId`, `includeRemoved`.
  - Requires room membership.

- `POST /v1/rooms/:roomId/wall-objects`
  - Creates a wall object.
  - Requires teacher role by default.
  - Allows students only when room settings permit.
  - Validates anchor exists and type is accepted by anchor/room policy.

- `GET /v1/rooms/:roomId/wall-objects/:objectId`
  - Fetches one wall object.
  - Requires room membership.

- `PATCH /v1/rooms/:roomId/wall-objects/:objectId`
  - Updates title, placement, state, permissions, or moderation fields.
  - Uses optimistic concurrency through `version`.
  - Requires teacher or object owner plus policy.

- `DELETE /v1/rooms/:roomId/wall-objects/:objectId`
  - Soft-removes wall object.
  - Requires teacher or allowed owner action.

- `POST /v1/rooms/:roomId/wall-objects/:objectId/control`
  - Controls playback or live source state.
  - Request body is a typed action: play, pause, seek, mute, unmute, stop-share, spotlight, lock.

### Asset Finalization Endpoints

Extend the existing attachment API:

- `POST /v1/rooms/:roomId/attachments/:attachmentId/finalize`
  - Client calls after successful signed upload.
  - API verifies attachment belongs to room and caller has access.
  - Optional: API performs a HEAD request against object storage to confirm existence, size, and content type.
  - Marks attachment `ready`.

- `PATCH /v1/rooms/:roomId/attachments/:attachmentId`
  - Teacher moderation status update: ready, rejected.
  - Optional metadata update: alt text, duration, caption ids, thumbnails.

In production, direct storage callbacks or object notifications can replace or supplement client finalize later.

### Live Share Endpoints

Live shares are mostly LiveKit-mediated, but API should create durable intent:

- `POST /v1/rooms/:roomId/wall-shares`
  - Creates a `WallObject` for a live source.
  - Returns `objectId`, `publicationName`, recommended LiveKit source, and feature limits.
  - Requires teacher by default.

- `POST /v1/rooms/:roomId/wall-shares/:objectId/end`
  - Marks live object `source_ended`.
  - Broadcasts reliable realtime message.
  - Does not need to control LiveKit directly for MVP+1 if the local client stops its track.

This avoids clients inventing publication names and creates a stable object before the LiveKit track starts.

### Web Resource Endpoints

- `POST /v1/rooms/:roomId/web-resources`
  - Validates a URL and creates `web.link` or `web.embed`.
  - Enforces allowlist for iframe embeds.
  - Stores normalized URL and display metadata if available.

- `POST /v1/rooms/:roomId/web-resources/preview`
  - Optional: returns title, icon, description, and embed support without creating an object.

For MVP+1, avoid server-side scraping unless explicitly needed. A simple URL card is safer and sufficient.

## Realtime Plan

### Realtime Message Types

Add wall object messages to `RealtimeMessage`.

Reliable messages:

- `wall.object.upsert.v1`
- `wall.object.remove.v1`
- `wall.playback.state.v1`
- `wall.share.ended.v1`
- `wall.moderation.state.v1`

Unreliable messages:

- `wall.pointer.v1`
- `wall.drag.preview.v1`
- `wall.scrub.preview.v1`

Reliable upsert shape:

```json
{
  "type": "wall.object.upsert.v1",
  "roomId": "room_123",
  "object": {
    "id": "wallobj_123"
  },
  "sentAt": 1710000000000,
  "senderId": "teacher_1"
}
```

Clients should treat realtime as invalidation plus fast UI update:

- Apply valid messages immediately.
- Re-fetch wall objects on join, reconnect, and version conflict.
- If message validation fails, ignore and request a refresh.

### Initial State Hydration

On room join:

1. Client calls `/session` and receives manifest/capabilities.
2. Client opens LiveKit/data connection.
3. Client fetches `/wall-objects`.
4. Client renders wall objects after manifest and objects are both available.
5. Client listens for realtime wall updates.

This keeps wall objects out of `/session` initially. If object count remains low, `/session` can include an initial wall-object snapshot later.

### Conflict Strategy

Use optimistic concurrency:

- Every wall object has `version`.
- PATCH requests include `expectedVersion`.
- API returns `409 version_conflict` if stale.
- Client re-fetches and lets the user retry.

Teacher actions can optionally override conflicts with `force: true`.

## LiveKit Media Plan

### Track Sources

Use LiveKit's existing source semantics:

- Camera wall object: `Track.Source.Camera`.
- Microphone wall object: `Track.Source.Microphone`.
- Screen/browser video: `Track.Source.ScreenShare`.
- Browser/system audio: `Track.Source.ScreenShareAudio` when available.

Publication naming:

- `wall:<objectId>` for primary video or audio.
- `wall:<objectId>:audio` for companion screen-share audio.
- Existing avatar media can keep `camera` and `microphone`.

### Reusing Existing Camera And Mic

For `camera.live` and `microphone.live`, avoid duplicate device prompts and duplicate track capture:

- If camera/mic is already on, wall object references the existing track.
- If off, UI asks to turn it on and then creates or activates the wall object.
- Renderer chooses wall spatial source for pinned audio when appropriate.

### Screen And Browser Tab Capture

Add a `useDisplayMedia` hook:

- Calls `navigator.mediaDevices.getDisplayMedia`.
- Supports browser-specific audio availability.
- Tracks permission denial and share end events.
- Publishes video and optional audio through `RealtimeClient.setLocalWallShare`.
- Stops tracks on leave, object removal, or share end.

Extend `RealtimeClient`:

```ts
setLocalWallShare(input: {
  objectId: string;
  screenStream: MediaStream | null;
  audioStream?: MediaStream | null;
}): Promise<void>;
```

Remote media updates should include wall track identity:

```ts
export type RemoteMediaUpdate = {
  participantId: string;
  cameraStream?: MediaStream | null;
  microphoneStream?: MediaStream | null;
  wallObjectId?: string;
  wallVideoStream?: MediaStream | null;
  wallAudioStream?: MediaStream | null;
};
```

### Audio Spatialization

Current spatial audio follows participant avatar positions. MVP+1 needs source positions:

- Avatar microphone: source is participant avatar.
- Wall-pinned microphone: source is wall anchor.
- Audio file: source is wall anchor.
- Screen/browser tab audio: source is wall anchor.
- Non-spatial mode: source is stereo/centered and user-controlled.

Add a shared helper:

```ts
getWallAnchorAudioPosition(manifest, wallAnchorId): Vector3
```

Add audio routing policy:

- `avatar`: follow participant.
- `wall`: follow wall anchor.
- `global`: no spatial falloff.

Default:

- Wall files and screen shares use `wall`.
- Teacher can switch primary board audio to `global` for clarity if needed.

## Frontend Architecture Plan

### State Ownership

Add a wall state hook:

```ts
useWallObjects({
  roomId,
  identity,
  manifest,
  realtimeClient,
  capabilities
})
```

Responsibilities:

- Fetch initial wall objects.
- Validate and store objects by id.
- Provide create/update/remove/control actions.
- Apply realtime updates.
- Handle version conflicts.
- Expose loading/error states.

Do not overload `RoomClient` with all wall logic. `RoomClient` should compose the wall hook and pass wall objects to 3D/2D renderers.

### 3D Rendering

Add `WallObjectLayer` inside `RoomView3D`.

Inputs:

- `manifest`
- `wallObjects`
- `wallMediaStreams`
- `localParticipantId`
- `onSelectObject`
- `quality`

Implementation approach:

- Phase 1: use Drei `Html` surfaces for file video/audio controls, iframes, and interactive objects.
- Use simple textured planes for static images once image loading is stable.
- Place surfaces relative to anchor position and normal.
- Use anchor width/height plus object placement percentages.
- Preserve existing wall fading behavior, but keep selected/primary wall objects readable.

Wall object transform:

- Convert anchor local placement into world position.
- Anchor `x/y` and `width/height` are normalized to anchor dimensions.
- Plane sits slightly in front of wall using anchor normal to avoid z-fighting.
- `zIndex` offsets along normal by tiny increments.

Selection:

- Click wall object to open detail/control panel.
- Click empty anchor to open "Add to wall" if permitted.
- Keyboard users can select objects from the side panel and focus controls.

### 2D Rendering

Extend `RoomView2D` to render wall object indicators:

- Show each anchor with a count and icons for object types.
- Highlight live objects.
- Selecting an anchor opens the same detail/control panel.
- Provide a list mode for screen readers and low-end devices.

2D mode must not be second-class. Users should be able to:

- See what is on each wall.
- Start and stop their own allowed shares.
- Play/pause accessible media controls.
- Open resource cards.
- Read notes and poll content.

### Control Panels

Replace or extend `AnchorPanel` with:

- `WallObjectPanel`: list wall objects grouped by anchor.
- `AddWallObjectDialog`: choose object type and source.
- `WallObjectInspector`: details, controls, moderation, remove.
- `UploadWallAssetForm`: signed upload and finalize flow.
- `LiveShareControls`: camera, mic, browser/screen share controls.

Keep `AnchorPanel` only as a debug/readiness panel or refactor it into the new panels.

### User Flow: Upload Image

1. Teacher opens wall panel.
2. Selects "Add to wall."
3. Chooses anchor.
4. Chooses image file.
5. Enters title and alt text.
6. Client creates attachment record and signed upload.
7. Client uploads file directly to storage.
8. Client finalizes attachment.
9. Client creates `image.file` wall object.
10. API persists event and broadcasts `wall.object.upsert.v1`.
11. All clients render image object.

### User Flow: Share Browser Tab

1. Teacher opens wall panel.
2. Selects "Share browser tab or screen."
3. Chooses anchor and title.
4. API creates live wall share object and returns `publicationName`.
5. Browser prompts through `getDisplayMedia`.
6. Client publishes screen video and optional audio to LiveKit.
7. Client broadcasts `wall.object.upsert.v1`.
8. All clients render stream on anchor.
9. When teacher stops sharing, local track ends.
10. Client marks wall share ended.
11. All clients show ended state or remove object depending room setting.

### User Flow: Student Share Request

1. Teacher enables "Students can request wall shares."
2. Student chooses a file/camera/browser share.
3. API creates object with `pending_moderation`.
4. Teacher sees request in panel.
5. Teacher approves, rejects, or edits anchor/placement.
6. Approved object becomes active and broadcasts to the room.

## Security, Privacy, And Moderation

### Role-Based Permissions

Default policy:

- Teachers can create, update, control, approve, reject, lock, and remove all wall objects in their rooms.
- Students can view active wall objects.
- Students can interact with objects that explicitly allow interaction.
- Students cannot create wall objects unless room settings allow it.
- Students can remove their own draft or pending objects.
- Teacher actions always override student object ownership.

Room settings additions:

- `wallObjectCreation`: `teacher-only`, `student-request`, `student-direct`.
- `wallObjectModeration`: `pre`, `post`, `off`.
- `allowLiveStudentShares`: boolean.
- `allowStudentUploads`: boolean.
- `allowWebLinks`: boolean.
- `allowEmbeds`: boolean.
- `maxActiveWallObjects`.
- `maxActiveLiveShares`.

### Upload Safety

Enforce at API boundary:

- Allowed MIME types.
- Maximum file size by kind.
- Maximum files per room/anchor.
- Filename sanitization.
- Storage key isolation by room and anchor.
- Attachment ownership and room membership checks.
- Status must be `ready` before an asset-backed wall object can become active.

Recommended defaults:

- Images: `image/png`, `image/jpeg`, `image/webp`, max 10 MB.
- Video: `video/mp4`, `video/webm`, max 250 MB for MVP+1 unless storage/bandwidth policy says otherwise.
- Audio: `audio/mpeg`, `audio/mp4`, `audio/wav`, `audio/webm`, max 50 MB.
- Documents: `application/pdf`, max 50 MB when document support ships.

Virus scanning and content moderation are not currently implemented. For education deployments, production rollout should decide whether to add storage scanning before enabling student uploads.

### Live Media Privacy

Requirements:

- Visible active-share indicator for the sharer.
- Visible "live" badge for all viewers.
- One-click stop share.
- Stop all live wall shares on room leave.
- Stop all live wall shares when browser track ends.
- Do not auto-enable camera, microphone, screen, or tab share.
- Do not record live wall media in MVP+1.

### Web Embed Safety

For `web.embed`:

- Only `https://` URLs.
- Host allowlist required.
- Sandbox iframe.
- No same-origin permission unless specifically needed and reviewed.
- No camera/mic/geolocation permissions in iframe by default.
- Clear fallback when embed is blocked.

Suggested iframe attributes:

```html
<iframe
  sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
  referrerpolicy="no-referrer"
  allow="fullscreen"
/>
```

Avoid broad permissions such as camera, microphone, geolocation, clipboard, or unsandboxed same-origin in MVP+1.

### Audit Trail

Persist events for:

- Object created.
- Object edited.
- Object removed.
- Upload finalized.
- Share started.
- Share stopped.
- Student object approved/rejected.
- Embed failed or downgraded.

These events support teacher accountability and future analytics without recording private media.

## Performance Plan

### Rendering Limits

Default limits:

- Max active wall objects per room: 20.
- Max visible rich wall objects in 3D: 8.
- Max active live video wall objects: 4.
- Max active file video wall objects playing synchronously: 2.
- Max active audio wall objects playing synchronously: 3.
- Max iframes in 3D view: 1 active, others collapsed to cards.

These should be environment-configurable and room-overridable by teacher only within safe bounds.

### Media Quality

Defaults:

- Camera wall share: reuse existing camera constraints, currently 640x360 at 15 fps.
- Screen/browser share: start at 1280x720 at 15 fps.
- Video files: browser adaptive behavior initially; future transcoding if needed.
- Audio files: stream from signed/public URL, do not eagerly preload all.

Future storage/transcoding:

- Generate image thumbnails.
- Generate video poster frames.
- Consider media transcode pipeline only after usage proves the need.

### 3D Strategy

Use progressive rendering:

- Static images can become textures.
- Interactive media can stay DOM-overlaid with `Html`.
- Offscreen or distant objects can collapse to placeholders.
- 2D mode uses regular DOM/SVG controls and should remain cheaper than 3D.

Avoid:

- 30 simultaneous high-resolution videos in the scene.
- Autoplaying every wall video.
- Dynamic shadows or post-processing for media surfaces.
- Loading heavy document/PDF renderers in initial room bundle.

### Network Strategy

- Lazy-load signed download URLs when object becomes visible or selected.
- Refresh signed URLs before expiry for long sessions.
- Cache public URLs when `OBJECT_STORAGE_PUBLIC_BASE_URL` is configured.
- Do not include large wall-object payloads in frequent avatar messages.
- Use reliable data messages for wall state and persisted API as source of truth.

## Accessibility Plan

Requirements:

- Every wall object has a title.
- Image objects require alt text or an explicit "decorative" flag.
- Video/audio objects expose native controls or equivalent keyboard controls.
- Live objects expose status text: live, waiting, ended, muted.
- 2D/list mode provides access to every wall object without 3D.
- Focus order supports opening wall panels, selecting anchors, and controlling objects.
- Captions/transcripts are supported as metadata and rendered when available.
- Reduced motion mode avoids animated wall effects.
- Color is never the only indicator for live/moderation/error states.

Screen-reader list model:

- Room wall objects grouped by wall/anchor.
- Each object reads title, type, creator, status, and available actions.
- Live media state changes should announce politely, not disruptively.

## Configuration Plan

Add backend env vars:

- `ENABLE_WALL_OBJECTS` default `true`.
- `WALL_OBJECT_CREATION_DEFAULT` default `teacher-only`.
- `WALL_OBJECT_MAX_ACTIVE_PER_ROOM` default `20`.
- `WALL_OBJECT_MAX_ACTIVE_LIVE_SHARES` default `4`.
- `WALL_OBJECT_MAX_IMAGE_BYTES` default `10485760`.
- `WALL_OBJECT_MAX_VIDEO_BYTES` default `262144000`.
- `WALL_OBJECT_MAX_AUDIO_BYTES` default `52428800`.
- `WALL_OBJECT_ALLOWED_IMAGE_TYPES` default `image/png,image/jpeg,image/webp`.
- `WALL_OBJECT_ALLOWED_VIDEO_TYPES` default `video/mp4,video/webm`.
- `WALL_OBJECT_ALLOWED_AUDIO_TYPES` default `audio/mpeg,audio/mp4,audio/wav,audio/webm`.
- `ENABLE_WALL_WEB_LINKS` default `true`.
- `ENABLE_WALL_WEB_EMBEDS` default `false`.
- `WALL_WEB_EMBED_ALLOWLIST` default empty.
- `ENABLE_WALL_SCREEN_SHARE` default `true`.
- `ENABLE_WALL_STUDENT_UPLOADS` default `false`.
- `ENABLE_WALL_STUDENT_LIVE_SHARES` default `false`.

Add frontend env vars only when the value must be public:

- `NEXT_PUBLIC_ENABLE_WALL_OBJECTS`.
- `NEXT_PUBLIC_ENABLE_WALL_WEB_LINKS`.
- `NEXT_PUBLIC_ENABLE_WALL_WEB_EMBEDS`.
- `NEXT_PUBLIC_ENABLE_WALL_SCREEN_SHARE`.

Server responses should remain authoritative. The frontend env vars are for hiding unavailable UI early, not for authorization.

## Implementation Phases

### Phase 0: Confirm MVP Baseline

Exit criteria:

- Existing MVP docs remain accurate.
- `MVP_STATUS.md` notes MVP+1 planning start if implementation begins.
- Production deployment blockers are understood.
- Existing typecheck, tests, build, and e2e status is known before changes.

### Phase 1: Contracts And Persistence

Scope:

- Add `WallObject` schemas and API routes.
- Add repository methods and Mongo model.
- Add attachment finalization.
- Add wall-object room events.
- Add config limits and feature flags.
- Generate OpenAPI.

Exit criteria:

- API can create/list/update/delete wall objects.
- API validates anchor existence and policy.
- Attachment cannot become visible until finalized or marked ready.
- Tests cover teacher create, student forbidden, student request mode, anchor validation, and version conflict.

### Phase 2: File-Backed Wall Objects

Scope:

- Replace MVP `AnchorPanel` readiness flow with add-object workflow.
- Support image, video, and audio file upload to wall.
- Render file-backed wall objects in 3D and 2D.
- Add object inspector and remove controls.
- Add signed URL refresh/download behavior.

Exit criteria:

- Teacher can upload image/video/audio and place it on a wall.
- All participants see object after realtime update.
- New joiners hydrate existing objects.
- 2D analog shows and controls objects.
- Playwright covers teacher upload using a mocked/dev upload path.

### Phase 3: Live Camera, Mic, And Screen/Browser Tab

Scope:

- Add live wall share API intent.
- Extend realtime media adapter for wall share tracks.
- Add `useDisplayMedia`.
- Support camera and mic pinning to wall.
- Support browser tab or screen share on wall.
- Route wall-pinned audio from anchor position.

Exit criteria:

- Teacher can pin camera to wall.
- Teacher can pin microphone source to wall without double full-volume playback.
- Teacher can share browser tab/screen to wall.
- Share ending updates all clients.
- UI shows clear live indicators and stop-share controls.

### Phase 4: Web Links And Allowlisted Embeds

Scope:

- Add web resource APIs.
- Add `web.link` object cards.
- Add optional allowlisted `web.embed`.
- Add blocked-embed fallback state.
- Add CSP/sandbox review.

Exit criteria:

- Teacher can add safe web resource card.
- Optional embeds work only for allowlisted hosts.
- Blocked or unsafe URLs become readable errors or link cards.
- Student cannot use links to bypass room policy.

### Phase 5: Education Objects

Scope:

- Add notes, timers, and simple polls.
- Reserve whiteboard and slides interfaces.
- Add student interaction permissions.

Exit criteria:

- Teacher can pin a note.
- Teacher can run a timer.
- Teacher can create a simple poll and view results.
- Students can respond when allowed.

### Phase 6: Moderation, Accessibility, And Performance Hardening

Scope:

- Student request queue.
- Teacher lock/remove/approve/reject flows.
- Object limits and user-readable limit errors.
- 3D degradation for too many rich objects.
- Accessibility audit.
- Low-end/browser throttling validation.

Exit criteria:

- Teacher can safely run a class with student wall contributions enabled.
- 2D/list mode supports all wall object actions needed for accessibility.
- Performance remains acceptable with documented object limits.

### Phase 7: Deployment And Live Provider Validation

Scope:

- Configure production env vars.
- Validate LiveKit screen share/camera/mic wall tracks.
- Validate object storage upload/download/finalize.
- Validate Clerk-backed auth and teacher/student policy.
- Run deployed smoke tests.

Exit criteria:

- Deployed teacher can add file and live wall objects.
- Deployed student sees and interacts according to policy.
- LiveKit-backed multi-browser validation passes.
- Storage-backed upload/download works without dev fallback.

## Testing Plan

### Unit And Contract Tests

Add tests for:

- `WallObjectSchema` validation.
- Anchor placement math.
- Anchor accepts/type policy.
- Wall audio source position.
- Playback state reducer.
- Config parsing and production validation.

### API Tests

Add tests for:

- Teacher creates wall object.
- Student blocked by default.
- Student request mode creates `pending_moderation`.
- Invalid anchor rejected.
- Disallowed type rejected.
- Attachment finalize required before active file object.
- Version conflict on stale update.
- Delete is soft remove.
- Room delete cascades wall objects.
- OpenAPI includes new routes.

### Frontend Tests

Add Playwright tests for:

- Teacher adds image object to wall in dev upload mode.
- New student tab sees existing wall object.
- Realtime update appears without reload.
- Teacher removes object and both tabs update.
- 2D analog exposes wall object.
- Permission UI blocks student create by default.

For live media:

- Mock or use browser fake media for camera.
- Use browser-supported screen-share test only where stable.
- Add manual LiveKit validation checklist for actual browser-tab audio.

### Performance Tests

Validate:

- Room with 20 wall object cards.
- Room with 4 active live video wall objects.
- Room with 2 playing videos plus normal avatar media.
- Low-quality 3D profile.
- 2D fallback under throttled CPU.

### Manual Acceptance Tests

Run with at least two browsers:

- Teacher + student file wall object.
- Teacher browser tab share.
- Student request approval.
- Reconnect while wall objects exist.
- Leave/rejoin after share ended.
- Denied camera/screen permissions.
- Blocked web embed fallback.

## Acceptance Criteria

MVP+1 is complete when:

- The app has a typed `WallObject` model separate from file attachment metadata.
- Teachers can place image, video, and audio files on manifest wall anchors.
- Teachers can pin live camera and browser-tab/screen share to wall anchors.
- Wall state hydrates for new joiners and synchronizes for active participants.
- 3D and 2D modes both expose wall objects.
- Teacher moderation and removal controls exist.
- Student wall creation is policy-controlled and defaults to safe settings.
- File uploads use signed storage and explicit ready/finalized status.
- Browser/web support avoids unsafe arbitrary iframe behavior.
- Live media sharing has visible privacy indicators and stop controls.
- Performance limits prevent wall media from making the room unusable.
- Tests cover contracts, API authorization, wall-object persistence, and browser flows.
- Deployment docs/env templates are updated for new feature flags and limits.

## Key Risks And Decisions

### Arbitrary Web Browser On Wall

Risk:

- Embedding arbitrary websites is unreliable and unsafe because many sites block iframes, require login, or can create privacy/security issues.

Decision:

- Treat browser-tab/screen share as the primary "browser on wall" feature for MVP+1.
- Treat `web.link` cards as safe persistent resources.
- Add `web.embed` only behind an allowlist.

### Attachment Model Overload

Risk:

- Extending `WallAttachment` to represent live streams, web links, whiteboards, and polls would make contracts confusing and brittle.

Decision:

- Introduce `WallObject`.
- Keep `WallAttachment` for uploaded file assets.

### Live Audio Duplication

Risk:

- A pinned microphone could be heard both from the avatar and from the wall.

Decision:

- Add explicit audio routing policy.
- When a live mic is pinned, route or attenuate the existing participant mic source rather than duplicating full-volume playback.

### Performance

Risk:

- Multiple videos, iframes, and live shares can overwhelm school devices.

Decision:

- Ship strict limits and progressive rendering.
- Keep 2D/list mode feature-complete.
- Do not autoplay rich media by default.

### Moderation And Student Privacy

Risk:

- Student uploads/live shares introduce classroom safety and privacy concerns.

Decision:

- Default to teacher-only creation.
- Add student request mode before student-direct mode.
- Add visible live indicators and teacher removal.

## Recommended First Implementation Slice

The most valuable and lowest-risk MVP+1 slice is:

1. Add `WallObject` contracts, repository, routes, and OpenAPI.
2. Add attachment finalization.
3. Build wall-object hydration and realtime upsert/remove.
4. Render image file wall objects in 3D and 2D.
5. Add teacher add/remove UI.
6. Add video/audio file rendering and synchronized playback.
7. Add teacher camera pinning.
8. Add browser-tab/screen share.

This sequence keeps the foundation honest: durable wall state first, file-backed objects second, live media third, then web and education tools.

## Open Questions

- Should student wall-object creation be enabled for MVP+1, or only planned and implemented behind flags?
- Should video/audio playback be teacher-synchronized by default on all anchors, or only on primary display anchors?
- What file size limits match expected storage and school network constraints?
- Is production deployment required before MVP+1 begins, or can MVP+1 continue against local provider fallbacks?
- Which web domains, if any, should be allowlisted for iframe embeds?
- Should wall objects persist across class sessions forever, until removed, or per-room-session by default?
- Should live wall shares leave an ended placeholder or disappear automatically?

## Implementation Notes For Future Agents

- Start with contracts and persistence before UI. The MVP already has OpenAPI generation and tests; keep that pattern.
- Do not put mutable wall content into the room manifest. Keep anchors in the manifest and wall objects in their own collection.
- Keep 3D and 2D renderers fed from the same wall-object state.
- Preserve the existing local dev fallbacks, but do not mistake them for production validation.
- Update `.env.example`, `apps/api/.env.example`, `apps/web/.env.example`, and `docs/planning/mvp/MVP_STATUS.md` when implementation adds env vars or changes current status.
- Add tests as each phase lands; wall media touches auth, storage, realtime, rendering, and privacy.
