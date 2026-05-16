# 3DSpace MVP Implementation Plan

## Purpose

This document defines the complete MVP for 3DSpace: a browser-based, multi-user, immersive 3D educational space with a functional 2D analog. It is written for an implementation run by GPT-5.5 Extra High using the `/goal` instruction, meaning implementation should continue until the MVP and the status document are fully complete.

The implementation deliverables are:

1. A fully functional MVP deployed with the frontend on Vercel and the backend on Koyeb.
2. `docs/planning/mvp/MVP_STATUS.md`, updated throughout implementation with stack decisions, environment variables, progress, validation evidence, blockers, and deployment state.

## MVP Outcome

Teachers can create or open a class space, share an invite, and have up to 30 students join from a browser. Every participant can move through the space, see other avatars, publish camera output on or near their avatar, speak through spatial audio, and use a 2D analog of the same space when 3D is unavailable, distracting, inaccessible, or too expensive for the device.

The MVP must keep the core engine light enough that post-MVP features such as screen sharing, computer audio sharing, richer assets, whiteboards, learning tools, analytics, and wall-mounted media do not make the baseline experience unusable.

## Chosen MVP Stack

The implementation should use this stack unless a status-doc entry records a replacement with rationale and migration impact.

| Layer | Choice | Reason |
| --- | --- | --- |
| Frontend hosting | Vercel | Required by project constraints; strong fit for browser delivery and preview deployments. |
| Frontend app | Next.js, React, TypeScript | Flexible routing, fast iteration, Vercel-native deployment, broad ecosystem. |
| 3D renderer | Three.js through `@react-three/fiber` and `@react-three/drei` | Lightweight enough for MVP while keeping a mature path to richer 3D later. |
| 2D analog | Shared room model rendered with lightweight React/SVG or Canvas 2D | Avoids duplicating product logic; keeps low-end-device mode cheap. |
| Backend hosting | Koyeb | Required by project constraints; suitable for always-on API and token services. |
| Backend runtime | Node.js, Fastify, TypeScript | Low overhead, fast Web API surface, strong shared typing with frontend. |
| API contracts | Zod schemas plus generated OpenAPI | Keeps the API agile while giving future agents and clients a stable contract. |
| Database | MongoDB Atlas (managed MongoDB) | Natural fit for versioned room manifests and flexible post-MVP metadata; low operational overhead at MVP scale. |
| ODM | Mongoose | Schema definitions, indexes, and validation at the persistence layer; API contracts remain Zod/OpenAPI at the boundary. |
| Realtime media | LiveKit Cloud for MVP SFU | Supports classes of 30 without browser mesh overload and provides a path to screen share/audio expansion. |
| Realtime state | LiveKit data channels for avatar movement and room events, backed by API persistence where needed | Reuses the media room connection and avoids adding another realtime service for MVP. |
| Object storage | Cloudflare R2 or S3-compatible storage | Prepares wall image/video/audio attachments with signed uploads and CDN-friendly delivery. |
| Auth | Clerk for identity, backend-owned class memberships and roles | Fast MVP auth while preserving teacher/student authorization in project data. |
| Testing | Vitest, Playwright, API contract tests | Covers unit logic, browser join/movement/media flows, and deploy-critical contracts. |
| Observability | Sentry plus Vercel/Koyeb/LiveKit logs and health endpoints | Enough runtime visibility without a heavy ops stack. |

## Core Architecture

The system should keep the world model separate from its renderers.

`room manifest` is the shared source of truth for:

- Room dimensions, spawn points, wall planes, walkable bounds, and attachment anchors.
- Avatar defaults, movement constraints, audio zones, and spatial audio tuning.
- 2D projection data so the same room can render in 3D or 2D.
- Feature flags/capabilities advertised to clients.

`frontend` responsibilities:

- Render 3D and 2D views from the same room manifest.
- Capture keyboard, pointer, and touch movement.
- Publish throttled avatar state over LiveKit data channels.
- Publish local camera and microphone tracks.
- Render remote camera output as avatar billboards or compact video surfaces.
- Spatialize remote audio with the Web Audio API based on avatar positions.
- Provide device/performance fallbacks and allow switching between 3D and 2D.

`backend` responsibilities:

- Authenticate users and authorize teacher/student room access.
- Issue LiveKit room tokens with the correct permissions.
- Persist classes, rooms, memberships, wall anchor metadata, and attachment records.
- Expose flexible, versioned APIs for future tools and room features.
- Generate signed upload/download URLs for wall attachments.
- Provide health, readiness, and environment validation endpoints.

`LiveKit` responsibilities:

- Handle camera, microphone, future screen share, and future computer-audio WebRTC transport.
- Carry lightweight avatar and room event data messages for the active room session.

## Flexible API Requirements

The API must be easy to extend after MVP. Implement the backend around versioned resources and capability-driven room features instead of hard-coded one-off endpoints.

Required API shape:

- `/v1/classes`: create/list/update teacher-owned classes.
- `/v1/classes/:classId/members`: manage teacher/student memberships and invites.
- `/v1/rooms`: create/list/update room metadata.
- `/v1/rooms/:roomId/manifest`: retrieve the room manifest consumed by both renderers.
- `/v1/rooms/:roomId/session`: join a room and receive LiveKit token, participant identity, role, and feature capabilities.
- `/v1/rooms/:roomId/attachments`: create attachment records and signed upload URLs.
- `/v1/rooms/:roomId/events`: optional persisted event intake for durable room changes.
- `/health` and `/ready`: deployment and dependency checks.

API design rules:

- Every endpoint uses typed request and response schemas.
- The OpenAPI document is generated from source schemas and published with the backend.
- Room capabilities are returned as data, not inferred from frontend constants.
- Unknown future feature state should fit into typed extension points such as `capabilities`, `attachment.kind`, `wallAnchor.metadata`, and `roomFeature.config`.
- Teacher-only actions must be enforced by backend authorization, never only by frontend checks.

## Room And Data Model

Minimum persisted entities:

- `User`: external auth id, display name, avatar preferences.
- `Class`: teacher-owned educational grouping.
- `ClassMembership`: user, class, role, status.
- `Room`: class, name, active manifest version, settings.
- `RoomManifest`: versioned JSON describing 3D geometry, 2D projection, spawn points, wall anchors, and tuning.
- `RoomSession`: optional audit record for joins/leaves.
- `WallAttachment`: room, wall anchor, kind, storage key, moderation/status fields.
- `Invite`: class or room invite code, expiry, role, usage state.

MongoDB persistence notes:

- Store relational entities (`ClassMembership`, `Invite`, `WallAttachment`) as collections with compound indexes on lookup keys such as `classId + userId`, `inviteCode`, and `roomId + wallAnchorId`.
- Store `RoomManifest` as versioned documents, either embedded on `Room` (`manifests[]` with `activeVersion`) or in a dedicated `room_manifests` collection keyed by `roomId` and `version`.
- Keep API request/response shapes defined in Zod; Mongoose schemas enforce persistence shape but do not replace the public API contract.
- Use application-level authorization checks plus unique indexes where needed (for example unique `inviteCode`, unique `classId + userId` membership).

Transient realtime state:

- Participant position, rotation, movement state, speaking state, camera state, selected view mode, and last activity timestamp.
- This state should be broadcast in LiveKit data messages and not persisted unless it becomes a durable feature later.

## 3D Space Requirements

The 3D view should prioritize performance and clarity over visual richness.

MVP requirements:

- One default classroom-like space with simple geometry, a floor, boundary walls, and clear spawn positions.
- Avatars represented by lightweight billboards or simple low-poly forms.
- Camera output displayed on or near each avatar when enabled.
- Microphone audio spatialized from avatar position.
- Keyboard/mouse controls plus touch-friendly movement.
- Collision/containment using simple bounds and wall checks, not a heavyweight physics engine.
- Quality levels for low, medium, and high devices.
- A visible control to switch to the 2D analog.

Post-MVP preparation:

- Wall planes and anchor points exist in the manifest from MVP day one.
- Attachment metadata supports `image`, `video`, `audio`, and future kinds.
- Media track handling is abstracted so screen share and computer audio can be added without rewriting participant/session plumbing.

## 2D Analog Requirements

The 2D analog is not a minimap only. It must be a usable representation of the same room.

MVP requirements:

- Top-down or plan-view rendering of the same room manifest.
- Participant movement, presence, speaking/camera state, and wall locations visible.
- Users can join, move, speak, publish camera, and understand where classmates are.
- Teachers can use it as a low-system-requirements mode.
- It must share session, API, auth, room manifest, and LiveKit plumbing with the 3D view.

Accessibility requirements:

- Keyboard-only movement and controls.
- Clear focus states and labels.
- Reduced-motion mode.
- Camera/microphone permission states communicated in text.
- A path to screen-reader-friendly participant and room lists.

## Realtime And Media Requirements

MVP realtime targets:

- Up to 30 participants per class room.
- Avatar state updates capped by environment-controlled send rates.
- Remote avatar interpolation to avoid jitter.
- Graceful degradation when a participant has slow hardware or network.
- Reconnect handling that restores room state and media permissions.

Movement data message shape should be versioned:

```json
{
  "type": "avatar.state.v1",
  "sentAt": 1710000000000,
  "participantId": "participant_123",
  "position": { "x": 1.2, "y": 0, "z": -3.4 },
  "rotation": { "y": 1.57 },
  "movement": "walking",
  "viewMode": "3d"
}
```

Media design:

- Camera and microphone publishing use LiveKit tracks.
- Remote audio is attached to Web Audio panner nodes controlled by avatar positions.
- Spatial audio parameters are environment-configurable.
- Camera output rendering is isolated behind participant media components so future screen share/computer audio can reuse the same track registry.

## Performance Requirements

Performance is a first-class MVP requirement.

Targets:

- 3D mode should run acceptably on common school Chromebooks and older laptops.
- 2D mode should work on devices that cannot sustain the 3D view.
- Initial JavaScript payload must stay intentionally small; defer heavy 3D dependencies where possible.
- No high-poly models, dynamic shadows, post-processing, or heavyweight physics in MVP.
- Movement updates should be throttled and compressed to the minimum useful payload.
- Media rendering should avoid mounting 30 large video elements at full resolution.

Required controls:

- Environment variable for avatar update rate.
- Environment variable for interpolation buffer.
- Environment variable for spatial audio distance model and rolloff.
- Environment variable for default 3D quality level.
- Runtime client setting for 2D/3D mode.

## Environment Variable Strategy

Anything tunable should be configured by environment variable and documented in `MVP_STATUS.md`.

Rules:

- Every required env var must have name, platform, purpose, required/optional state, default, and validation status in the status doc.
- Client-exposed values must use the chosen frontend framework's public prefix and must never contain secrets.
- Server-only secrets stay on Koyeb or provider dashboards.
- Tuning values should be parsed and validated at startup.
- Missing required env vars should fail fast in backend startup and show a clear deployment error.

Initial env categories:

- App URLs and deployment mode.
- Auth provider keys.
- MongoDB connection (`MONGODB_URI`, optional `MONGODB_DB_NAME`).
- LiveKit server URL, API key, and API secret.
- Object storage endpoint, bucket, access key, secret key, and public CDN base.
- Movement tuning.
- Spatial audio tuning.
- Media quality defaults.
- Feature flags.
- Observability keys.

## Security And Education Controls

MVP controls:

- Teachers can create classes and invite students.
- Students can only join authorized classes/rooms.
- LiveKit tokens are short-lived and minted by the backend.
- Role and membership checks are enforced before token issuance.
- Attachment uploads require signed URLs and stored metadata.
- Secrets never appear in client bundles.
- Basic abuse controls exist for room joins and token creation.

Teacher controls for MVP:

- Create/open a room.
- Invite students.
- See participant list.
- Mute self and control own camera/microphone.
- MVP may defer teacher muting of others, moderation queues, and room lock if documented as post-MVP, but the API should not block those additions.

## Implementation Phases

### Phase 0: Status And Repo Foundation

Exit criteria:

- `MVP_STATUS.md` exists and is updated with initial stack decisions and env matrix.
- Monorepo structure exists for frontend, backend, shared contracts, and docs.
- Local development commands are documented.
- Formatting, linting, and test runners are configured.

Recommended structure:

- `apps/web`: Next.js frontend.
- `apps/api`: Fastify backend.
- `packages/contracts`: shared Zod schemas and generated OpenAPI helpers.
- `packages/room-engine`: shared room manifest types and geometry/projection helpers.
- `docs/planning/mvp`: planning and status docs.

### Phase 1: Auth, Data, And API Contracts

Exit criteria:

- Auth is wired for local and deployed environments.
- MongoDB collections, Mongoose schemas, and indexes exist.
- Class, membership, room, invite, manifest, and attachment records are implemented.
- API schemas and OpenAPI generation exist.
- Backend health/readiness endpoints validate dependencies.

### Phase 2: LiveKit Session Join

Exit criteria:

- Backend creates authorized LiveKit room tokens.
- Frontend can join a room session.
- Participants appear in a basic roster.
- Camera and microphone permission flow works.
- Join/reconnect errors are user-readable.

### Phase 3: Shared Room Manifest And 3D MVP

Exit criteria:

- Frontend loads a manifest from the backend.
- 3D scene renders floor, walls, anchors, spawn points, and avatars.
- Local user can move within bounds.
- Remote users appear and move via LiveKit data messages.
- Camera output is displayed on or near avatars.

### Phase 4: Spatial Audio And Media Abstractions

Exit criteria:

- Remote audio is spatialized from avatar positions.
- Spatial tuning is environment-driven.
- Media components distinguish microphone, camera, and future share-like tracks.
- Users can enable/disable camera and microphone.
- 30-participant media behavior is tested with simulated or staged participants.

### Phase 5: 2D Analog

Exit criteria:

- 2D analog renders the same room manifest.
- Users can move and participate from 2D mode.
- Presence, speaking state, camera state, walls, and anchors are visible.
- Switching between 3D and 2D preserves session state.

### Phase 6: Wall Attachment Readiness

Exit criteria:

- Wall anchor metadata is visible in the manifest.
- Backend supports attachment records and signed upload URLs.
- MVP UI can show placeholder anchor affordances.
- Image/video/audio attachment data model is ready even if rich placement UX is deferred.

### Phase 7: Deployment, Verification, And Hardening

Exit criteria:

- Frontend is deployed on Vercel.
- Backend is deployed on Koyeb.
- MongoDB Atlas, LiveKit, storage, auth, and observability are configured.
- Status doc includes exact env var values or redacted owner/location references.
- Smoke tests pass against deployed frontend and backend.
- Performance and low-device checks are recorded.

## Acceptance Criteria

The MVP is complete only when all criteria below are met:

- A teacher can create or access a class room from a deployed Vercel URL.
- A student can join through an invite or authorized flow.
- 30 participants can be supported by the architecture and tested through staged/manual/simulated validation.
- Each user can move in the 3D room and see other users move.
- Each user can use the 2D analog for the same room/session.
- Camera output can appear on or near an avatar.
- Microphone audio is spatial and tunable.
- Wall anchor data exists and supports future image/video/audio attachments.
- Backend APIs are typed, versioned, documented, and easy to extend.
- Environment variables are documented in `MVP_STATUS.md`.
- Frontend is deployed to Vercel and backend is deployed to Koyeb.
- `MVP_STATUS.md` is current and includes implementation status, env configuration, validation evidence, known limitations, and post-MVP backlog.

## Required Validation

Minimum validation before MVP signoff:

- Unit tests for room manifest parsing, 2D projection helpers, API auth guards, and spatial audio math.
- API tests for class/room/session/token/attachment flows.
- Playwright tests for teacher create/join, student join, 3D movement, 2D movement, camera/mic controls, and view switching.
- Manual or scripted multi-user test with 30 participants or a documented equivalent load simulation.
- Deployed smoke test against Vercel and Koyeb.
- Performance check on a low-end target device or throttled browser profile.

## Status Document Contract

`docs/planning/mvp/MVP_STATUS.md` is part of the MVP deliverable and must be updated throughout implementation.

Update it:

- At the start of implementation.
- After every completed phase.
- When stack decisions, env vars, deployment state, blockers, or acceptance status change.
- Before final MVP signoff.

The status doc must always include:

- Current implementation phase and summary.
- Stack decisions and any deviations from this plan.
- Environment variable matrix with platform, purpose, defaults, and validation state.
- Completed work.
- In-progress work.
- Blockers and risks.
- Test and deployment evidence.
- Known limitations and post-MVP backlog.

## Post-MVP Backlog Seeds

The MVP should prepare for, but not necessarily implement:

- Screen sharing.
- Computer audio sharing.
- Teacher moderation controls.
- Persistent room layouts and custom room builder.
- Rich wall-mounted images, videos, and audio.
- Whiteboards and collaborative objects.
- Breakout rooms.
- Attendance and engagement analytics.
- LMS integrations.
- Advanced avatar customization.
- Recording, replay, and transcript features.
