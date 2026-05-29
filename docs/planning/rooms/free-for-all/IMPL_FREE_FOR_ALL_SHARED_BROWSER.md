# Implementation — Shared Browser Board (Free-for-All Room Type)

Source plan: [`PLAN_FREE_FOR_ALL_SHARED_BROWSER.md`](./PLAN_FREE_FOR_ALL_SHARED_BROWSER.md)
Parent room type: [`IMPL_FREE_FOR_ALL_ROOM.md`](./IMPL_FREE_FOR_ALL_ROOM.md)
Parity source: [`FRAME_FEATURE_PARITY_GAP_ANALYSIS.md`](./FRAME_FEATURE_PARITY_GAP_ANALYSIS.md)
Branch: `room-types`
Last updated: 2026-05-28

---

## Status / Scope

**Status:** Phase 6 implementation complete; Phase 7 rollout scaffolding landed. The shared browser now has creation UI, 3D/2D/fullscreen rendering, shared media wiring, and JPEG fallback polling in the web client. Remaining work is verification-heavy: add/run dedicated multi-tab E2E coverage and do manual latency/UX passes.

### Progress log

- **2026-05-28 — Phase 6 complete; Phase 7 rollout scaffolding landed.** Shared-browser UI now renders and drives the room-owned Chromium session across 3D, 2D, sidebar, and fullscreen surfaces; env/docs updated; `@3dspace/web` + `@3dspace/api` typecheck green.
  - `apps/web/components/SharedBrowser/SharedBrowserSurface.tsx` (NEW): shared-browser toolbar + viewport + status strip. Supports navigate/back/forward/refresh, take/release control, pause resume, open-in-new-tab, pointer injection, and keyboard forwarding gated on the control lease. `SharedBrowserSummary` gives compact/sidebar rendering.
  - `apps/web/components/SharedBrowser/useSharedBrowserVideo.ts` (NEW): authenticated JPEG fallback polling against `GET .../frame.jpg`, using `NEXT_PUBLIC_SHARED_BROWSER_JPEG_FPS` on the client. It activates only when the session is active and there is no LiveKit `trackSid`.
  - `apps/web/lib/realtime.ts`: remote track subscription now maps LiveKit participant identities of the form `shared-browser:<wallObjectId>` into the existing `wallMediaStreams` store, so the server-published synthetic track reuses the normal wall-media render path.
  - `apps/web/lib/useWallObjects.ts`: `createInlineObject` now accepts `web.browser.shared`, letting the room UI create browser boards through the existing wall-object mutation path.
  - `apps/web/components/AnchorPanel.tsx`: added the **Shared Browser** create option and form (title + start URL), wired to `onCreateSharedBrowser`, hidden unless the shared-browser feature is enabled client-side for the current room.
  - `apps/web/components/RoomClient.tsx`: created `createSharedBrowser`, threaded the shared-browser controller/identity/roomId into `RoomView3D`, `RoomView2D`, `AnchorPanel`, and the fullscreen wall-object overlay.
  - `apps/web/components/RoomView3D.tsx`: dynamic Free-for-All boards now accept `web.browser.shared`; shared-browser props flow through `WallObjectLayer` / `WallObjectSurface`.
  - `apps/web/components/RoomView2D.tsx`: 2D projected board overlays now render shared-browser surfaces alongside whiteboards when present.
  - `apps/web/components/WallObjectCard.tsx`: shared-browser rendering branch added to `WallObjectContent`, reusing the surface for boards/fullscreen and the summary view for compact sidebar cards.
  - `apps/web/app/globals.css`: added shared-browser surface, toolbar, viewport, fallback, status, fullscreen, and 2D overlay styling.
  - Rollout/docs: `.env.example`, `apps/api/.env.example`, and `apps/web/.env.example` now include shared-browser env vars; `docs/planning/mvp/DEPLOYMENT_CHECKLIST.md` now records RAM/LiveKit/JPEG-fallback deployment notes.

- **2026-05-28 — Phase 4 done.** Realtime fan-out plumbed end-to-end; full suite 248 tests + `@3dspace/api` and `@3dspace/web` typecheck green. No new routes/contracts (the server side shipped in Phase 2).
  - Server (already in place from Phase 2, verified): all shared-browser REST mutations return `realtimeMessages` envelopes; `navigate`→`navigate.v1`+`state.v1`, `history`→`history.v1`+`state.v1`, `control-lease`→`control-lease.v1`, `applyInput` (`POST /v1/rooms/:roomId/shared-browser/realtime`)→`pointer.v1` (pointer only; empty batch = no fan-out; keyboard requires the actor's live control lease else 403). The client publishes the returned messages over the existing LiveKit data channel (same pattern as whiteboards — server does not self-broadcast).
  - `apps/web/lib/realtime.ts`: added `SharedBrowserRealtimeMessage` to the `RealtimeMessage` union and `room.shared-browser.pointer.v1` to `ROOM_OBJECT_UNRELIABLE_TYPES` (pointer is unreliable; navigate/history/control-lease/state/session are reliable).
  - `apps/web/lib/api.ts`: added `getSharedBrowserSession`, `navigateSharedBrowser`, `sharedBrowserHistory`, `sharedBrowserControlLease`, `resumeSharedBrowser`, `sendSharedBrowserInput` (the last posts to the room-scoped `/shared-browser/realtime` with `wallObjectId` in the body).
  - `apps/web/lib/useSharedBrowser.ts` (NEW): `useSharedBrowser` controller mirroring `useWhiteboards`. Per-object `SharedBrowserBoardState` (session + derived `currentUrl`/`title`/`status`/`controlLease`); hydrates each `web.browser.shared` object on mount; actions `navigate`/`history`/`controlLease`/`resume` (publish returned envelopes + patch local state); `queuePointer`/`queueKey` batch input and flush once per `requestAnimationFrame` via `sendSharedBrowserInput`; `handleRealtimeMessage` merges `state.v1`/`session.v1`/`navigate.v1`/`control-lease.v1` and acks `history.v1`/`pointer.v1`. Gated on `CLIENT_TUNING.enableSharedBrowsers && roomTypeFeatures.sharedBrowsers && session && manifest`.
  - `apps/web/components/RoomClient.tsx`: instantiate `useSharedBrowser` after `roomTypeFeatures`; add `sharedBrowserRealtimeHandlerRef` and dispatch it in `handleMessage` (before the prefix-fallthrough), plus a `room.shared-browser.` prefix guard.
  - Tests: `packages/contracts/tests/shared-browser.test.ts` (6 — discriminated-union parse for all 6 message types, control-lease payload, unknown-type rejection, pointer-batch clamp/defaults, FFA-only feature flag, https `currentUrl` guard); `apps/api/tests/api.test.ts` gained "fans out realtime envelopes for pointer input and control-lease changes" (pointer→1 `pointer.v1`, empty batch→0, lease take→`control-lease.v1`). Existing navigate/keyboard-lease tests already cover the other fan-out paths.

- **2026-05-28 — Phase 3 done.** Real self-hosted Chromium driver implemented and wired in behind `enableSharedBrowsers`; full suite (241 tests, incl. 4 real-Chromium integration tests) + `npm --workspace @3dspace/api run typecheck` green. No new routes, so OpenAPI is unchanged.
  - Deps added to `apps/api`: `puppeteer` (24.x, bundled Chromium → `~/.cache/puppeteer`) and `@livekit/rtc-node` (installed now for Phase 5). **No hosted remote-browser SDK** — hard vendor rule honored.
  - `apps/api/src/shared-browser/session-registry.ts` (NEW): `LiveSessionRegistry` — in-memory `sessionId → { browser, context, page, cdp, screencastActive, guard, viewport }`. DB row stays the source of truth for metadata.
  - `apps/api/src/shared-browser/puppeteer-driver.ts` (NEW): `PuppeteerSharedBrowserDriver implements SharedBrowserDriver`. Lazy single `browserPromise`; per-session **incognito `BrowserContext`** + page for cookie/storage isolation; `Page.setDownloadBehavior: deny`; **redirect SSRF guard via request interception** (`assertNavigationAllowed` re-checked on every main-frame navigation, `abort("blockedbyclient")` on reject); `navigate`/`history` drive `goto`/`goBack`/`goForward`/`reload` and swallow transient/timeout errors, returning the settled `{ url, title }`; `pointer`/`keyboard` map normalized coords to `page.mouse`/`page.keyboard`; `screencastLoop` via CDP `Page.startScreencast` (JPEG q60) with frame-ack; `stop` tears down the context, `close` tears down all sessions + the browser.
  - `apps/api/src/shared-browser/idle-reaper.ts` (NEW): `SharedBrowserIdleReaper.sweep()` pauses sessions whose `lastInputAt` is older than `tuning.sharedBrowserIdlePauseMinutes` (driver `stop` + row → `paused`). LIMITATIONS: uses the **global** tuning value, not the per-room `settings.sharedBrowsers.idlePauseMinutes`; does **not** refresh the wall-object state cache (lags until the next mutation). `start()` runs a 60s `setInterval` (unref'd); `stop()` clears it.
  - `apps/api/src/shared-browser/types.ts`: `DriverStartOptions` gained `navigationGuard: NavigationGuardSettings`; `SharedBrowserDriver` gained optional `close?()`.
  - `apps/api/src/shared-browser/orchestrator.ts`: `createSession`/`resume` now pass `navigationGuard` to `driver.start` and pre-validate the start URL.
  - `apps/api/src/app.ts`: `buildApp` constructs a `PuppeteerSharedBrowserDriver` only when `enableSharedBrowsers` **and** no orchestrator is injected (tests inject a stub-driver orchestrator). Idle reaper started after `fastify()`; `onClose` stops the reaper and calls `driver.close()`.
  - Tests: `apps/api/tests/ssrf.test.ts` (13 — `__testing` IP/suffix helpers + `assertNavigationAllowed` allow/reject incl. scheme, private IP, localhost, allowlist, blocked-suffix, allowInsecureLocal); `apps/api/tests/shared-browser-idle-reaper.test.ts` (2 — stale→paused + driver.stop, fresh untouched, no re-pause of paused); `apps/api/tests/puppeteer-driver.test.ts` (4, gated on `puppeteer.executablePath()` existing — local HTTP server, start/navigate/history/`not live` after stop; uses `allowInsecureLocal` guard to reach loopback offline). `api.test.ts` shared-browser tests now build via a `buildSharedBrowserApp` helper that injects a **stub-driver** orchestrator so they stay offline (the real driver would otherwise launch Chromium + hit the network — that broke the `1.1.1.1 → one.one.one.one` redirect assertions).

- **2026-05-28 — Phase 2 done.** Durable session lifecycle on the stub driver; full API surface, gating, SSRF, and tests landed. `npm --workspace @3dspace/api run typecheck` and the full `npx vitest run` (222 tests) are green.
  - `apps/api/src/repository.ts`: `Repository` gained 8 `*SharedBrowserSession*` methods (return `| undefined`, not `| null`, to match the codebase). `MemoryRepository` implements all + `deleteRoom` cascade. `MongoRepository` (`models/mongoose.ts`) mirrors them with `sharedBrowserSessionSchema` (indexes `{roomId,wallObjectId}`, `{status,updatedAt}`, collection `shared_browser_sessions`), `docToSharedBrowserSession`, and lean-doc casts (`as Record<string, unknown> | null`) matching the meeting-notes pattern.
  - `apps/api/src/shared-browser/`: `ssrf.ts` (`assertNavigationAllowed` — blocks non-https, private/reserved IPv4/IPv6 after DNS, localhost, optional allowlist/blocked-suffix), `types.ts` (`SharedBrowserDriver` interface), `stub-driver.ts` (URL/title-only, pointer/keyboard/screencast no-ops), `orchestrator.ts` (`SharedBrowserOrchestrator`: `createSession`/`hydrate`/`navigate`/`history`/`controlLease`/`resume`/`applyInput`/`stopSession`, mirrors runtime snapshot onto `WallObject.state` via `updateWallObject({ updatedByUserId: session.createdByUserId, state })`, builds realtime messages now so Phase 4 only needs fan-out). `guardSettings.allowInsecureLocal` is hard-`false` — the shared browser never targets loopback, even in dev.
  - `apps/api/src/app.ts`: `assertSharedBrowsersEnabled` (double gate: `tuning.enableSharedBrowsers` + `settings.sharedBrowsers.enabled` + `getRoomTypeFeatureFlags().sharedBrowsers`, throws `notFound`). `validateWallObjectSource` requires an inline source with an https `startUrl`. `enforceWallObjectLimits` caps `web.browser.shared` at `settings.sharedBrowsers.maxActivePerRoom` (note: one object occupies an anchor, so the cap only bites across distinct anchors). Wall-object create handler gates + (when active) calls `orchestrator.createSession` and returns the state-synced object; delete handler calls `orchestrator.stopSession`. Six REST handlers: GET/navigate/history/control-lease/resume are wall-object-scoped; `POST /v1/rooms/:roomId/shared-browser/realtime` is room-scoped with `wallObjectId` in the body (matches the registered route). Orchestrator instantiated in `buildApp` (`options.sharedBrowserOrchestrator` injectable, defaults to stub).
  - `apps/api/tests/api.test.ts`: `describe("shared browser boards")` — 8 tests: create+state mirror, navigate updates `currentUrl`, SSRF rejects `127.0.0.1`/`169.254.169.254`/`10.0.0.5`/`localhost` (400 `navigation_blocked`), non-https start URL rejected, 404 on classroom + flag-off rooms, delete→session gone, per-room limit across 3 FFA static anchors (2 allowed, 3rd 409), keyboard requires control lease / pointer does not. Tests use literal public IP `1.1.1.1`/`1.0.0.1` to keep SSRF DNS off the network.
  - OpenAPI regenerated (same explicit command as Phase 1); 6 shared-browser paths present.

- **2026-05-28 — Phase 1 done.** Contracts, room-engine, feature flags, room settings, config tuning, and OpenAPI all landed and typecheck green.
  - `packages/contracts/src/index.ts`: added `"web.browser.shared"` to `WallObjectTypeSchema`; `sharedBrowsers: boolean` on `RoomTypeFeatureFlags` (FFA `true`, others `false`); `RoomSettings.sharedBrowsers` block (after `aiObjects`); full shared-browser schema block (entity `SharedBrowserSessionSchema`, `SharedBrowserWallObjectStateSchema`, pointer/key event, navigate/history/control-lease/pointer-batch requests, 6 realtime messages + `SharedBrowserRealtimeMessageSchema` union, `SharedBrowserSessionResponseSchema`, `SharedBrowserRealtimeDispatchResponseSchema`) placed right after the whiteboard response schemas (~line 1519). Type exports added after `WhiteboardRealtimeMessage`. Six REST routes registered in `apiRoutes` after the whiteboard routes (tag `shared-browsers`). NOTE: `frame.jpg` is NOT in `apiRoutes` (binary response) — register it manually in `app.ts` in Phase 5.
  - `packages/room-engine/src/index.ts`: `"web.browser.shared"` added to `FULL_WALL_OBJECT_ACCEPTS`.
  - `packages/room-engine/src/wallAnchorPolicy.ts`: `"shared-browser"` added to `WallAnchorCreateOption` + `anchorSupportsCreateOption` case → `web.browser.shared`.
  - `apps/web/lib/config.ts`: `CLIENT_TUNING.enableSharedBrowsers` (`NEXT_PUBLIC_ENABLE_SHARED_BROWSERS === "true"`).
  - `apps/api/src/config.ts`: added 10 `tuning.sharedBrowser*` fields + loader (env vars per PLAN § 5) + `requiredInProduction` guard (requires LiveKit when enabled; rejects JPEG fallback in production).
  - `apps/api/src/app.ts`: `roomSettings()` factory now emits the `sharedBrowsers` block (needed for compile).
  - OpenAPI regenerated via `npm run build -w @3dspace/contracts && node apps/api/dist/openapi.js > packages/contracts/openapi/openapi.json` (the `npm run openapi` wrapper pollutes stdout — use the explicit form).
  - Validation green: `npm --workspace @3dspace/contracts run typecheck`, `@3dspace/room-engine`, `@3dspace/web`; api builds.

### Where to start next (Phase 5)

Realtime is wired; the missing piece is **pixels on the board**. Phase 5 turns the driver's screencast (`driver.screencastLoop(sessionId, onFrame)`, JPEG buffers) into something the room can render: a LiveKit synthetic video track in production and a `GET .../frame.jpg` fallback in dev. See the "Phase 5" section below. Plan:

1. **`apps/api/src/shared-browser/livekit-publisher.ts` (NEW)**: use `@livekit/rtc-node` (already installed) to join the room as a bot identity (`shared-browser:<wallObjectId>`), publish a synthetic video track, and feed it the screencast frames. Store `trackSid`/`participantIdentity` on the session row (`session.livekit`).
2. **`apps/api/src/shared-browser/jpeg-fallback.ts` (NEW)**: when `SHARED_BROWSER_USE_JPEG_FALLBACK=true` or LiveKit is unconfigured (non-production only — `config.ts` already forbids the fallback in production), keep the latest JPEG per session in memory.
3. **`apps/api/src/app.ts`**: register `GET /v1/rooms/:roomId/wall-objects/:objectId/shared-browser/frame.jpg` **manually** (binary `image/jpeg`, `Cache-Control: no-store`) — it is intentionally NOT in `apiRoutes` (binary response). Start the publisher/fallback when a session goes active; stop it on pause/stop. Wire the screencast loop start into the orchestrator/driver lifecycle.
4. **`apps/web/lib/useSharedBrowserVideo.ts` (NEW)**: subscribe the bot's LiveKit track when `status === "active"`, or poll `frame.jpg` in dev.
5. **Tests**: gate any encode test on `@livekit/rtc-node` availability; a fallback test can assert `frame.jpg` returns the last pushed buffer with `image/jpeg`.

Key files: new `livekit-publisher.ts`, `jpeg-fallback.ts`, `apps/web/lib/useSharedBrowserVideo.ts`; `frame.jpg` route + lifecycle wiring in `apps/api/src/app.ts`. **Then Phase 6** adds the actual UI (SharedBrowser components, AnchorPanel create form, WallObjectCard branch, RoomView3D/2D mount) — until then the feature has no user-facing surface even though the hook + dispatch exist.

**Gotchas for the next AI:** (a) The real Puppeteer driver is only built in `buildApp` when `enableSharedBrowsers` AND no orchestrator is injected — API tests MUST inject a stub-driver orchestrator (see `buildSharedBrowserApp` in `api.test.ts`) or they'll launch Chromium and hit the network. (b) The idle reaper uses the **global** `tuning.sharedBrowserIdlePauseMinutes`, not the per-room setting, and does not refresh the wall-object state cache — revisit if per-room idle config matters. (c) `puppeteer-driver.test.ts` is gated on `puppeteer.executablePath()` existing on disk; it will silently `describe.skip` in lanes without bundled Chromium. (d) The server never self-broadcasts realtime — handlers return `realtimeMessages` and the **client** publishes them over the LiveKit data channel; preserve that contract (`useSharedBrowser` already does it). (e) `applyInput` only emits a `pointer.v1` envelope (no `state.v1`); an empty batch is a no-op with zero fan-out.

This doc implements the Shared Browser board described in the PLAN. It is **additive to Free-for-All Phase 1** and follows the hard vendor rule: **no paid or freemium third-party browser services** — only self-hosted Chromium + Puppeteer and reuse of existing 3DSpace infra (MongoDB, API, LiveKit).

**What ships:**

1. New wall object type **`web.browser.shared`** placeable from `AnchorPanel` on FFA boards.
2. **`SharedBrowserSession`** persistence in MongoDB — room-scoped, survives creator disconnect.
3. **Self-hosted Puppeteer driver** (`apps/api/src/shared-browser/`) — navigation, pointer, keyboard, screencast; bundled Chromium, no Browserless/Hyperbeam/etc.
4. **LiveKit synthetic video track** via `@livekit/rtc-node` for 3D/2D wall rendering in production.
5. **Dev JPEG fallback** (`GET .../frame.jpg`) when LiveKit is unavailable — no new vendor.
6. **Realtime** — `room.shared-browser.*.v1` messages on existing LiveKit data channels.
7. **Feature flag** `ENABLE_SHARED_BROWSERS` / `NEXT_PUBLIC_ENABLE_SHARED_BROWSERS` (default `false`).

**Out of scope (Phase 1):**

- Classroom / workforce-training room types.
- Paid remote-browser SaaS adapters (explicitly forbidden by PLAN § 1.1).
- Cookie jar persistence / logged-in sessions across days.
- File downloads from the shared browser.
- Dedicated GPU streaming stack (no Agora, no Daily, no Parsec).

---

## Codebase context (pre-implementation state)

Line numbers are accurate as of `room-types` HEAD on 2026-05-28.

| File | What matters |
|---|---|
| `packages/contracts/src/index.ts` | `WallObjectTypeSchema` at line 13 — add `"web.browser.shared"`. `RoomTypeFeatureFlags` at line 815 — add `sharedBrowsers: boolean`. `FREE_FOR_ALL_ROOM_TYPE_FEATURE_FLAGS` at line 872 — set `sharedBrowsers: true`. `RoomSettingsSchema` at line 905 — add `sharedBrowsers` block near `aiObjects` / `whiteboards`. `WallObjectSourceSchema` at line 1236 — `inline` source already supports arbitrary `data`. `WallObjectControlRequestSchema` at line 1320 — extend with shared-browser actions or keep separate REST (prefer separate REST + realtime, like whiteboards). Realtime patterns at `RoomBoardCreatedMessageV1Schema` line 1681. |
| `packages/contracts/openapi/openapi.json` | Regenerate after contract changes. |
| `packages/room-engine/src/index.ts` | `FULL_WALL_OBJECT_ACCEPTS` at line 96 — add `"web.browser.shared"`. |
| `packages/room-engine/src/wallAnchorPolicy.ts` | `WallAnchorCreateOption` — add `"shared-browser"`. `anchorSupportsCreateOption()` — map to `anchorAcceptsWallObjectType(anchor, "web.browser.shared")`. |
| `apps/api/src/config.ts` | `AppConfig.tuning` — add `enableSharedBrowsers`, viewport/idle/rate-limit vars from PLAN § 5. `requiredInProduction()` — when enabled, require LiveKit **unless** `NODE_ENV !== "production"` or explicit JPEG fallback flag. **Do not** add third-party browser API keys. |
| `apps/api/src/app.ts` | Wall object create at line 3455; validation in `validateWallObjectSource()` at line 781 (`web.link`/`web.embed` branch — add `web.browser.shared` → requires `inline`). Dynamic anchor merge at line 600 for FFA board validation. Embed allowlist helpers at line 557 (`isAllowedEmbedHost`) — reuse for optional navigation allowlist. New route block after whiteboard routes (or wall-objects block ~3455). |
| `apps/api/src/repository.ts` | Add `SharedBrowserSession` CRUD mirroring `DynamicWallAnchor` / `WhiteboardStroke` patterns. |
| `apps/api/src/models/mongoose.ts` | New `SharedBrowserSession` collection + indexes `{ roomId: 1, wallObjectId: 1 }`, `{ status: 1, updatedAt: 1 }`. |
| `apps/api/src/shared-browser/` | **New module**: `orchestrator.ts`, `driver.ts`, `session-registry.ts`, `ssrf.ts`, `livekit-publisher.ts`, `jpeg-fallback.ts`, `idle-reaper.ts`. |
| `apps/web/lib/config.ts` | `CLIENT_TUNING` — add `enableSharedBrowsers`. |
| `apps/web/lib/realtime.ts` | Extend `RealtimeMessage` with `SharedBrowserRealtimeMessage`. Mark pointer messages unreliable (same set pattern as whiteboard stroke-delta at line ~81). |
| `apps/web/lib/api.ts` | Wrappers for shared-browser REST + optional `frame.jpg` polling URL builder. |
| `apps/web/lib/useSharedBrowser.ts` | **New hook** — hydrate session, subscribe realtime, send pointer batches, navigate, lease control. |
| `apps/web/components/SharedBrowser/` | **New module**: `SharedBrowserSurface.tsx`, `SharedBrowserToolbar.tsx`, `useSharedBrowserPointer.ts`, `useSharedBrowserVideo.ts`. |
| `apps/web/components/AnchorPanel.tsx` | `FORM_TYPES` — add `{ id: "shared-browser", label: "Shared Browser" }` gated on FFA + flags. |
| `apps/web/components/WallObjectCard.tsx` | Branch for `web.browser.shared` at line ~581 (near `web-url` handling). |
| `apps/web/components/RoomView3D.tsx` | `WallObjectSurface` — branch for shared browser (line ~706 area, alongside whiteboard). Reuse `StreamVideo` path used by `browser-tab.live`. |
| `apps/web/components/RoomView2D.tsx` | 2D parity branch. |
| `apps/web/components/RoomClient.tsx` | Realtime dispatch + `useSharedBrowser` wiring; video track subscription for server bot identity `shared-browser:<objectId>`. |
| `deploy/hetzner-livekit/` | Optional self-hosted LiveKit (already documented) — **free OSS path** for synthetic track publishing without LiveKit Cloud metering. |
| Env templates | `.env.example`, `apps/api/.env.example`, `apps/web/.env.example`. |

---

## Plan adjustments

Clarifications from the codebase walkthrough, on top of the PLAN:

**A. Double gating: room-type flag + env flag.** Same pattern as AI Meeting Notes / whiteboards:

- `getRoomTypeFeatureFlags(room.type).sharedBrowsers === true` (FFA only), and
- `config.tuning.enableSharedBrowsers === true` / `CLIENT_TUNING.enableSharedBrowsers === true`.

**B. Do not extend `browser-tab.live`.** That type binds to `source.kind: "livekit-track"` and a participant publication (`validateWallObjectSource` line 774–778). Shared browser uses `source.kind: "inline"` + separate server bot track. Mixing them would reintroduce creator-leave teardown.

**C. Wall object persists; worker is lazy.** MongoDB holds `SharedBrowserSession` + `WallObject.state` cache. The Puppeteer process runs only while `status === "active"`. Idle pause closes Chromium but keeps the wall object row.

**D. Third-party adapter folder is intentionally absent.** Do **not** create `backends/hyperbeam.ts`, `backends/browserless.ts`, etc. The driver interface has a single implementation:

```ts
interface SharedBrowserDriver {
  start(session: SharedBrowserSession): Promise<void>;
  stop(sessionId: string): Promise<void>;
  navigate(sessionId: string, url: string): Promise<{ url: string; title: string }>;
  history(sessionId: string, action: "back" | "forward" | "refresh"): Promise<void>;
  pointer(sessionId: string, events: SharedBrowserPointerEvent[]): Promise<void>;
  keyboard(sessionId: string, events: SharedBrowserKeyEvent[]): Promise<void>;
  screencastLoop(sessionId: string, onFrame: (jpeg: Buffer) => void): Promise<void>;
}
```

Only `PuppeteerSharedBrowserDriver` ships in v1.

**E. SSRF check runs on every navigation**, including redirects (follow max 5 hops, re-validate each URL). Implement in `ssrf.ts` using Node `dns.promises.lookup` + blocked CIDR list. Reuse `assertHttpsUrl()` from `app.ts` line 565 as a starting point.

**F. Server bot LiveKit identity.** Mint tokens with identity `shared-browser:<wallObjectId>`, name `"Shared Browser"`. Clients subscribe to this participant's video track the same way they subscribe to remote camera tracks in `useWallObjects` / `RoomClient`.

**G. Pointer coordinate normalization.** Match whiteboard convention: events are 0..1 relative to the **board placement rect**, not the full anchor. The surface component converts to pixel coords against `viewportWidth × viewportHeight` before POST/realtime send; the driver maps to Puppeteer mouse events.

**H. Control lease stored on session row.** `controlLease.expiresAt` refreshed on keyboard activity. API rejects keyboard events without a valid lease. Pointer events do not require a lease.

**I. Creator leave is a no-op.** Do not call `stop-share` or mark `source_ended` when the creating participant disconnects. Only wall-object delete or idle reaper pauses the session.

**J. RAM / deployment note.** Puppeteer + Chromium ≈ 200–400 MB per session. Default cap `maxActivePerRoom: 2`. If API container OOMs on Koyeb, split `shared-browser` into a sidecar Docker service using the same MongoDB lease pattern — still self-hosted, still no third-party browser SaaS.

**K. Dependency additions (free OSS only).**

```json
// apps/api/package.json
"puppeteer": "^24.x",
"@livekit/rtc-node": "^0.13.x"
```

Puppeteer bundles Chromium (BSD). No API keys. No Browserless SDK.

---

## Phased implementation

### Phase 1 — Contracts + feature flags

Goal: schemas, enums, feature flags, anchor policy.

**File: `packages/contracts/src/index.ts`**

1. Extend `WallObjectTypeSchema` (line 13):

   ```ts
   "web.browser.shared",
   ```

2. Extend `RoomTypeFeatureFlags` (line 815):

   ```ts
   sharedBrowsers: boolean;
   ```

3. Set `sharedBrowsers: false` in `NON_CLASSROOM` + `CLASSROOM` flags; `sharedBrowsers: true` in `FREE_FOR_ALL_ROOM_TYPE_FEATURE_FLAGS` (line 872).

4. Add `RoomSettings.sharedBrowsers` block (defaults from PLAN § 4.3).

5. Add entity + message schemas:

   ```ts
   export const SharedBrowserSessionStatusSchema = z.enum([
     "starting", "active", "paused", "error", "stopped"
   ]);

   export const SharedBrowserSessionSchema = z.object({
     id: z.string().min(1),
     roomId: z.string().min(1),
     wallObjectId: z.string().min(1),
     createdByUserId: z.string().min(1),
     status: SharedBrowserSessionStatusSchema,
     currentUrl: z.string().url(),
     title: z.string().max(512).default(""),
     viewport: z.object({
       width: z.number().int().positive(),
       height: z.number().int().positive()
     }),
     controlLease: z.object({
       userId: z.string().min(1),
       displayName: z.string().min(1),
       expiresAt: z.string().datetime()
     }).optional(),
     livekit: z.object({
       participantIdentity: z.string().min(1),
       trackSid: z.string().optional()
     }).optional(),
     lastInputAt: z.string().datetime(),
     lastFrameAt: z.string().datetime().optional(),
     errorCode: z.string().optional(),
     errorMessage: z.string().optional(),
     createdAt: z.string().datetime(),
     updatedAt: z.string().datetime()
   });
   ```

   Request/response schemas for navigate, history, control-lease, hydrate GET, and pointer batch ingress.

   Realtime (place near line 1681):

   - `room.shared-browser.pointer.v1` (unreliable)
   - `room.shared-browser.navigate.v1`
   - `room.shared-browser.history.v1`
   - `room.shared-browser.control-lease.v1`
   - `room.shared-browser.state.v1`
   - `room.shared-browser.session.v1`

6. OpenAPI routes for new endpoints (PLAN § 4.4).

**File: `packages/room-engine/src/index.ts`**

7. Add `"web.browser.shared"` to `FULL_WALL_OBJECT_ACCEPTS` (line 96).

**File: `packages/room-engine/src/wallAnchorPolicy.ts`**

8. Add `"shared-browser"` to `WallAnchorCreateOption` + `anchorSupportsCreateOption` case.

**File: `apps/web/lib/config.ts`**

9. `enableSharedBrowsers: process.env.NEXT_PUBLIC_ENABLE_SHARED_BROWSERS === "true"`.

**Validation:**

```
npm --workspace @3dspace/contracts run typecheck
npm --workspace @3dspace/room-engine run typecheck
npm --workspace @3dspace/contracts run openapi
```

---

### Phase 2 — API: session lifecycle stub (no Chromium)

Goal: durable session rows + REST without Puppeteer.

**Files: `repository.ts`, `models/mongoose.ts`, `apps/api/src/shared-browser/orchestrator.ts`**

1. Repository methods:

   ```ts
   createSharedBrowserSession(input): Promise<SharedBrowserSession>;
   getSharedBrowserSessionByWallObject(wallObjectId: string): Promise<SharedBrowserSession | null>;
   updateSharedBrowserSession(id: string, patch: Partial<SharedBrowserSession>): Promise<SharedBrowserSession>;
   deleteSharedBrowserSession(id: string): Promise<void>;
   listStaleSharedBrowserSessions(olderThan: Date): Promise<SharedBrowserSession[]>;
   ```

2. On `POST /v1/rooms/:roomId/wall-objects` with `type: "web.browser.shared"`:

   - Assert FFA + flags + anchor empty + under `maxActivePerRoom`.
   - Validate `inline` source contains `startUrl` (https).
   - Create `WallObject` + `SharedBrowserSession` (`status: "starting"`).
   - Return wall object; background job marks `active` with stub driver (sets URL/title only).

3. REST endpoints from PLAN § 4.4 (navigate/history/lease/resume/get) returning updated session + `realtimeMessages: []` for now.

4. `validateWallObjectSource()` branch:

   ```ts
   if (input.type === "web.browser.shared") {
     if (input.source.kind !== "inline") throw badRequest("web.browser.shared requires inline source");
     return;
   }
   ```

5. Wall object delete → `orchestrator.stopSession(wallObjectId)`.

**Tests: `apps/api/tests/api.test.ts`**

- Create shared browser on FFA room; expect session row.
- Navigate updates `currentUrl` (stub).
- Non-FFA room → 403/404.
- SSRF URL rejected (`http://127.0.0.1`, `http://169.254.169.254`, private DNS).
- Delete wall object → session `stopped`.
- Creator user deleted from session membership → session still `active`.

---

### Phase 3 — Puppeteer driver (self-hosted Chromium)

Goal: real headless browsing with zero third-party APIs.

**File: `apps/api/src/shared-browser/driver.ts`**

1. `PuppeteerSharedBrowserDriver` using `puppeteer.launch`:

   ```ts
   const browser = await puppeteer.launch({
     headless: true,
     executablePath: config.sharedBrowserChromiumExecutable || undefined,
     args: [
       "--no-sandbox",
       "--disable-setuid-sandbox",
       "--disable-dev-shm-usage",
       "--disable-gpu",
       "--no-first-run",
       "--no-default-browser-check"
     ]
   });
   ```

2. Per session: one `page`, set viewport from room settings, `page.goto(startUrl)`, listen for `framenavigated` → update session URL/title.

3. Pointer injection: `page.mouse.move/down/up/wheel` with coordinate mapping.

4. Keyboard injection: `page.keyboard.type/press` only when lease valid.

5. Disable downloads:

   ```ts
   await page._client().send("Page.setDownloadBehavior", {
     behavior: "deny"
   });
   ```

6. CDP screencast: `Page.startScreencast` → JPEG buffers → `onFrame` callback.

**File: `apps/api/src/shared-browser/session-registry.ts`**

7. In-memory map `sessionId → { driver, page, screencastTimer }` with ref-counted cleanup.

**File: `apps/api/src/shared-browser/ssrf.ts`**

8. `assertNavigationAllowed(url, settings)` — https only, DNS resolve, block private IPs, optional allowlist.

**File: `apps/api/src/shared-browser/idle-reaper.ts`**

9. Timer every 60 s: pause sessions with no room participants OR `lastInputAt` older than `idlePauseMinutes`.

**Tests:**

- Unit test `ssrf.test.ts` with mocked DNS.
- Integration test with `puppeteer` navigating to a local static `file://` **blocked**; `https://example.com` allowed (mock server).

---

### Phase 4 — Realtime fan-out

Goal: pointer + state sync across clients.

**File: `apps/api/src/app.ts`**

1. `POST /v1/rooms/:roomId/shared-browser/realtime` — authenticate participant, validate payload against `SharedBrowserPointerBatchSchema`, apply to driver, return fan-out messages.

2. All REST mutations return `realtimeMessages` envelopes (mirror dynamic-wall-anchors / whiteboards).

**File: `apps/web/lib/realtime.ts`**

3. Add `SharedBrowserRealtimeMessage` union; extend unreliable set with `room.shared-browser.pointer.v1`.

**File: `apps/web/lib/useSharedBrowser.ts`**

4. Hook: hydrate GET on mount, merge `state.v1` messages, batch pointer events at rAF cadence.

**File: `apps/web/components/RoomClient.tsx`**

5. Dispatch handler before wall-object handlers; subscribe server bot video track when session `active`.

**Tests:**

- API test: pointer batch returns `room.shared-browser.state.v1` when URL unchanged (noop) vs navigate side effects.
- Contract parse tests for each message type.

---

### Phase 5 — Video delivery (free paths only)

Goal: render screencast on the board.

**File: `apps/api/src/shared-browser/livekit-publisher.ts`**

1. Use `@livekit/rtc-node` to join room as `shared-browser:<wallObjectId>`.
2. Publish synthetic video track; encode screencast JPEGs to VP8 frames (or pipe through `@livekit/rtc-node` video source API).
3. Store `trackSid` on session row.

**File: `apps/api/src/shared-browser/jpeg-fallback.ts`**

4. When `SHARED_BROWSER_USE_JPEG_FALLBACK=true` or LiveKit not configured (non-production):

   - Keep latest JPEG in memory per session.
   - `GET .../frame.jpg` returns `image/jpeg` with `Cache-Control: no-store`.

**File: `apps/web/components/SharedBrowser/useSharedBrowserVideo.ts`**

5. Production: attach LiveKit remote track from server bot identity.
6. Fallback: poll `frame.jpg` at `SHARED_BROWSER_JPEG_FPS`.

**No Hyperbeam/Browserless SDK imports anywhere.**

---

### Phase 6 — Web UI + 2D/3D parity

**File: `apps/web/components/SharedBrowser/SharedBrowserSurface.tsx`**

1. Layout: toolbar + video + transparent pointer capture overlay.
2. Props: `mode: "3d" | "2d"`, `object`, `session`, `videoTrack | jpegUrl`.

**File: `apps/web/components/SharedBrowser/SharedBrowserToolbar.tsx`**

3. Back, forward, refresh, URL bar, take/release control, open-in-new-tab link.

**File: `apps/web/components/SharedBrowser/useSharedBrowserPointer.ts`**

4. Pointer capture with normalized coords; wheel throttling; keyboard gated on lease.

**File: `apps/web/components/AnchorPanel.tsx`**

5. Add create form: title + start URL (default from room settings).

**File: `apps/web/components/WallObjectCard.tsx`**

6. Sidebar card: status, current URL (truncated), driver name, remove.

**File: `apps/web/components/RoomView3D.tsx` + `RoomView2D.tsx`**

7. Mount `SharedBrowserSurface` for `object.type === "web.browser.shared"`.

**File: `apps/web/app/globals.css`**

8. `.shared-browser-*` styles aligned with `.wall-object-surface-mount` tokens.

---

### Phase 7 — Env templates, validation, rollout

1. Update `.env.example`, `apps/api/.env.example`, `apps/web/.env.example` with PLAN § 5 vars.
2. `apps/web/test/shared-browser.spec.ts`:
   - Two browser tabs join same FFA room.
   - Tab A places shared browser on dynamic board.
   - Tab A navigates to `https://example.com`.
   - Tab B sees URL/title update + video/jpeg surface non-empty.
   - Tab A leaves; Tab B still navigates successfully.
3. API load note in `docs/planning/mvp/DEPLOYMENT_CHECKLIST.md`: Chromium RAM, `--no-sandbox`, optional sidecar.
4. Staging rollout: flags off by default; enable on staging with self-hosted LiveKit or JPEG fallback.

---

## Files-to-touch summary

| Area | Files |
|---|---|
| Contracts | `packages/contracts/src/index.ts`, OpenAPI artifact |
| Room engine | `packages/room-engine/src/index.ts`, `packages/room-engine/src/wallAnchorPolicy.ts` |
| API | `apps/api/package.json`, `apps/api/src/config.ts`, `apps/api/src/app.ts`, `apps/api/src/repository.ts`, `apps/api/src/models/mongoose.ts`, `apps/api/src/shared-browser/*` |
| API tests | `apps/api/tests/api.test.ts`, `apps/api/tests/shared-browser-ssrf.test.ts` |
| Web libs | `apps/web/lib/config.ts`, `apps/web/lib/api.ts`, `apps/web/lib/realtime.ts`, `apps/web/lib/useSharedBrowser.ts` |
| Web UI | `apps/web/components/SharedBrowser/*`, `AnchorPanel.tsx`, `WallObjectCard.tsx`, `RoomView3D.tsx`, `RoomView2D.tsx`, `RoomClient.tsx`, `globals.css` |
| E2E | `apps/web/test/shared-browser.spec.ts` |
| Env | `.env.example`, `apps/api/.env.example`, `apps/web/.env.example` |
| Ops | `docs/planning/mvp/DEPLOYMENT_CHECKLIST.md` (Chromium RAM note) |

**Explicitly not added:** `apps/api/src/shared-browser/backends/hyperbeam.ts`, `browserless.ts`, or any SDK requiring a paid API key.

---

## Risks

| Risk | Mitigation |
|---|---|
| Chromium RAM exhaustion on small API containers | Cap 2 sessions/room; idle reaper; document sidecar split. |
| Headless detection blocks sites | User-facing copy; not fixable without non-free anti-detect services (out of scope). |
| SSRF via redirect chain | Re-validate each hop; block private IPs after DNS. |
| LiveKit synthetic publish complexity | Ship JPEG fallback for dev first; add rtc-node in Phase 5. |
| Pointer latency over data channel | Coalesce moves client-side; click down/up sent immediately. |
| Keyboard fights | Control lease with TTL. |
| Puppeteer/Chromium CVEs | Pin dependency versions; periodic `npm audit`; run browser in isolated sidecar. |

---

## Validation checkboxes

- [x] Phase 1: `npm run typecheck` (contracts, room-engine, web).
- [x] Phase 1: OpenAPI regenerated.
- [x] Phase 2: `npx vitest run apps/api/tests/api.test.ts -t "shared browser boards"` passes (8 tests; full suite 222 green).
- [x] Phase 2: session persists in the repository independent of the creator's connection (no disconnect teardown wired — only wall-object delete calls `stopSession`).
- [x] Phase 3: Puppeteer navigates a local mock HTTP server (`puppeteer-driver.test.ts`, gated on bundled Chromium; start/navigate/history/`not live`).
- [x] Phase 3: SSRF unit tests pass for localhost + metadata IP (`ssrf.test.ts`, 13 tests incl. `169.254.169.254`, `127.0.0.1`, `::1`).
- [~] Phase 4: realtime plumbing done + unit-tested (contract parse + ingress fan-out envelopes); full two-tab manual latency check still pending.
- [x] Phase 5: code paths for LiveKit video wiring + JPEG fallback landed on both API and web; manual rendered-board verification still pending.
- [x] Phase 6: UI/rendering implementation landed for creation, 3D, 2D, sidebar, and fullscreen shared-browser surfaces.
- [~] Phase 7: env/docs scaffolding landed and `@3dspace/web` + `@3dspace/api` typecheck pass; dedicated Playwright coverage is still pending.
- [x] Phase 7: `rg "hyperbeam|browserless|browserbase" apps/api/src/shared-browser apps/web` returns no matches.

---

## Out-of-scope follow-ups (Phase 2+)

- Encrypted cookie jar in R2 for semi-persistent login (still self-hosted).
- Presenter mode (single driver for all input).
- Classroom rollout with teacher gate + safeguarding review.
- Sidecar worker with session lease queue for horizontal scale.
- Self-hosted LiveKit on Hetzner as default production path (see `deploy/hetzner-livekit/`).

These remain **self-hosted / free-OSS** paths only — still no paid browser SaaS.
