# Implementation — Shared Browser Board (Free-for-All Room Type)

Source plan: [`PLAN_FREE_FOR_ALL_SHARED_BROWSER.md`](./PLAN_FREE_FOR_ALL_SHARED_BROWSER.md)
Parent room type: [`IMPL_FREE_FOR_ALL_ROOM.md`](./IMPL_FREE_FOR_ALL_ROOM.md)
Parity source: [`FRAME_FEATURE_PARITY_GAP_ANALYSIS.md`](./FRAME_FEATURE_PARITY_GAP_ANALYSIS.md)
Branch: `room-types`
Last updated: 2026-05-28

---

## Status / Scope

**Status:** Not started. Planning only.

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

- [ ] Phase 1: `npm run typecheck` (contracts, room-engine, web).
- [ ] Phase 1: OpenAPI regenerated.
- [ ] Phase 2: `npm run test -- apps/api/tests/api.test.ts -t "shared browser"` passes.
- [ ] Phase 2: creator disconnect does **not** stop session (API test).
- [ ] Phase 3: Puppeteer navigates example.com in CI (allow network or mock HTTP server).
- [ ] Phase 3: SSRF unit tests pass for localhost + metadata IP.
- [ ] Phase 4: two-tab pointer click reflected in session state < 500 ms (local).
- [ ] Phase 5: video track visible on board OR JPEG fallback renders in dev.
- [ ] Phase 6: 3D + 2D parity manually verified.
- [ ] Phase 7: Playwright `shared-browser.spec.ts` passes.
- [ ] Phase 7: `grep -r hyperbeam\|browserless\|browserbase apps/api/src/shared-browser` returns **no matches**.

---

## Out-of-scope follow-ups (Phase 2+)

- Encrypted cookie jar in R2 for semi-persistent login (still self-hosted).
- Presenter mode (single driver for all input).
- Classroom rollout with teacher gate + safeguarding review.
- Sidecar worker with session lease queue for horizontal scale.
- Self-hosted LiveKit on Hetzner as default production path (see `deploy/hetzner-livekit/`).

These remain **self-hosted / free-OSS** paths only — still no paid browser SaaS.
