# Plan — Shared Browser Board (Free-for-All Room Type)

Source room type: [`PLAN_FREE_FOR_ALL_ROOM.md`](./PLAN_FREE_FOR_ALL_ROOM.md)
Implementation parent: [`IMPL_FREE_FOR_ALL_ROOM.md`](./IMPL_FREE_FOR_ALL_ROOM.md)
Parity source: [`FRAME_FEATURE_PARITY_GAP_ANALYSIS.md`](./FRAME_FEATURE_PARITY_GAP_ANALYSIS.md) (Shared web browsers inside room)
Branch target: `room-types` (additive feature; lands after Free-for-All Phase 1)
Last updated: 2026-05-28

---

## 1. Overview

Add a **Shared Browser** as a new wall-board type in Free-for-All rooms: a real, interactive web browser rendered on a board surface that **any participant can drive**, and that **keeps running after the creator leaves**.

Today 3DSpace already supports:

- `web.link` / `web.embed` — static URL cards or allowlisted iframes; not a shared interactive browser.
- `browser-tab.live` — a participant's own browser tab streamed via LiveKit; **dies when that participant disconnects**.

The Shared Browser closes the Frame parity gap for collaborative in-room browsing without tying the session to one person's machine or LiveKit track.

### 1.1 Production runtime (Hyperbeam)

**Production path (2026):** Shared browsers use **[Hyperbeam](https://hyperbeam.com/)** managed Chromium + client WebRTC embeds. Implementation guide: [`IMPL_FREE_FOR_ALL_SHARED_BROWSER_HYPERBEAM.md`](./IMPL_FREE_FOR_ALL_SHARED_BROWSER_HYPERBEAM.md).

| Component | Role |
|---|---|
| **Hyperbeam** | Remote browser VM + per-viewer WebRTC (usage-based **participant-minutes**) |
| **3DSpace API** | SSRF-safe navigation, session lifecycle, MongoDB persistence, occupancy/idle pause |
| **3DSpace web** | `@hyperbeam/web` embed on boards; visibility-gated to limit billing |
| **LiveKit (existing)** | Realtime **data channel only** for URL/title/lease sync — not shared-browser video |

The original self-hosted **Puppeteer + LiveKit synthetic track** design is archived in [`IMPL_FREE_FOR_ALL_SHARED_BROWSER.md`](./IMPL_FREE_FOR_ALL_SHARED_BROWSER.md) (superseded at runtime).

**Ops:** Production requires `HYPERBEAM_API_KEY` when `ENABLE_SHARED_BROWSERS=true`. See `DEPLOYMENT_CHECKLIST.md` and Hyperbeam dashboard for usage alerts.

OpenAI, Meshy, and other AI vendors remain **out of scope** for this feature.

### 1.2 Product goals

1. Any FFA participant can place a **Shared Browser** on an empty board anchor (static or dynamic).
2. Once placed, **any participant currently in the room** can navigate, click, scroll, and type in the shared session.
3. The browser session is **room-owned**, not user-owned: when the creator leaves, late joiners, or anyone else still in the room can continue using it.
4. Session state (at minimum current URL + page title) **persists across participant churn** and survives brief API worker restarts via MongoDB.
5. The board renders in **3D and 2D** with the same wall-object sizing conventions as other surfaces.
6. Unsafe navigation is blocked server-side (SSRF guardrails).

### 1.3 Non-goals (Phase 1)

- Classroom or workforce-training room types (FFA-only in v1).
- Per-user private browser tabs inside the same board.
- File downloads from the shared browser to participant devices (blocked in v1).
- Persistent login cookies across long idle periods (URL persistence only in v1; encrypted cookie jar deferred).
- Arbitrary iframe embed as a substitute for true co-browsing.
- Mobile native WebView parity beyond responsive pointer/keyboard input.
- Recording or exporting browser session video.
- Multiple simultaneous drivers without focus handoff (v1 uses a soft **control lease** so one typer at a time; others can still click/navigate when no lease is held — see § 7).
- Paid third-party remote-browser services (see § 1.1).

---

## 2. UX surface

### 2.1 Creating a Shared Browser

`AnchorPanel` gains a **Shared Browser** create option when:

- Room type is `"free-for-all"` and `RoomTypeFeatureFlags.sharedBrowsers === true`.
- Env flag `ENABLE_SHARED_BROWSERS` / `NEXT_PUBLIC_ENABLE_SHARED_BROWSERS` is on.
- Selected anchor accepts the new type (added to `FULL_WALL_OBJECT_ACCEPTS` for FFA anchors).
- Anchor is empty (existing one-object-per-anchor rule).

Create form fields:

| Field | Default | Notes |
|---|---|---|
| Title | `Shared Browser` | Shown on board header |
| Start URL | `https://www.wikipedia.org` | Must pass SSRF + https validation |

Submitting creates:

- A `WallObject` with `type: "web.browser.shared"`, `source.kind: "inline"`, `status: "active"`.
- A backing `SharedBrowserSession` row the API worker starts asynchronously.

### 2.2 Using the board

The board surface shows:

1. **Video pane** — live screencast from the server-side Chromium session (primary path via LiveKit synthetic track; dev fallback via JPEG polling).
2. **Toolbar** — Back, Forward, Refresh, URL bar (editable), **Take control** / **Release control**, optional **Follow presenter** toggle (auto-sync viewport focus — off by default).
3. **Status strip** — current driver display name (when control lease held), connection state, idle notice.

Interaction model:

- **Pointer** — normalized click/drag/scroll events sent to the server and applied through Puppeteer.
- **Keyboard** — only forwarded when the local client holds the control lease (prevents five people typing into one field at once).
- **Navigation** — URL bar commits send a reliable navigate action; back/forward/refresh ditto.

Remote participants see updates within ~150–300 ms on a healthy network (video latency dominates; input ack is faster).

### 2.3 Persistence after creator leaves

| Event | Behavior |
|---|---|
| Creator leaves room | Session **continues**; worker stays bound to `roomId` + `wallObjectId`. |
| Last participant leaves | Worker **pauses** after idle timeout (default 15 min); URL/title persisted in DB. |
| Someone rejoins later | Client hydrates last URL; worker **resumes** Chromium and reattaches video track. |
| Creator deletes board | Session stopped; worker torn down; wall object soft-removed. |
| Room deleted | Cascade delete sessions + workers. |

The UI copy should say: *"This browser belongs to the room, not to whoever created it."*

### 2.4 Where it mounts

| View | Mount point |
|---|---|
| 3D | `WallObjectSurface` branch for `web.browser.shared` inside `RoomView3D` |
| 2D | Equivalent branch in `RoomView2D` inside projected anchor rect |
| Sidebar | `WallObjectCard` shows URL, driver, reconnect, remove |

---

## 3. Architecture

### 3.1 Why not reuse `browser-tab.live` or `web.embed`

```
browser-tab.live          web.embed / web.link           web.browser.shared (new)
─────────────────         ─────────────────────          ─────────────────────────
User's machine            Static client iframe           Server headless Chromium
Dies on disconnect        No shared input                Room-scoped worker
LiveKit user track        Site embed restrictions        SSRF-safe server fetch
```

### 3.2 High-level data flow

```
  ┌─────────────────────────┐
  │ Participant clients      │  pointer/keyboard/navigate
  │ (3D + 2D board surface)  │──────────────────┐
  └───────────┬─────────────┘                  │
              │ LiveKit data channel            │ HTTPS REST (navigate, lease)
              ▼                                 ▼
  ┌───────────────────────────────────────────────────────────┐
  │ API — shared-browser module                                │
  │  - session registry (in-memory) + MongoDB authoritative   │
  │  - Puppeteer driver pool (1 session ↔ 1 Chromium page)    │
  │  - SSRF guard + rate limits                               │
  │  - screencast → LiveKit synthetic video (production)      │
  └───────────┬───────────────────────────────┬───────────────┘
              │                               │
              ▼                               ▼
  ┌───────────────────────┐       ┌───────────────────────────┐
  │ MongoDB                │       │ LiveKit room (existing)    │
  │ SharedBrowserSession   │       │ server-published video     │
  └───────────────────────┘       └───────────────────────────┘
```

### 3.3 Session driver (self-hosted Chromium)

Each active `web.browser.shared` wall object maps 1:1 to a `SharedBrowserSession`:

```ts
type SharedBrowserSession = {
  id: string;
  roomId: string;
  wallObjectId: string;
  createdByUserId: string;          // audit only; not an ownership gate
  status: "starting" | "active" | "paused" | "error" | "stopped";
  currentUrl: string;
  title: string;
  viewport: { width: number; height: number };   // default 1280×720
  controlLease?: {
    userId: string;
    displayName: string;
    expiresAt: string;              // short TTL, renewed while typing
  };
  livekit?: {
    participantIdentity: string;  // server bot identity, e.g. shared-browser:<objectId>
    trackSid?: string;
  };
  lastInputAt: string;
  lastFrameAt?: string;
  errorCode?: string;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
};
```

Worker lifecycle:

1. **Start** — launch headless Chromium (`puppeteer.launch` with bundled Chromium), create page, set viewport, navigate to start URL, begin CDP screencast.
2. **Input** — translate normalized board coordinates → page coordinates; inject mouse/keyboard/wheel via Puppeteer.
3. **Navigate** — `page.goto()` with SSRF check before navigation.
4. **Pause** — close page/browser but persist URL; status → `paused`.
5. **Resume** — relaunch and goto saved URL.
6. **Stop** — tear down on wall-object delete.

**No third-party browser API** — all control is local Puppeteer over bundled Chromium.

### 3.4 Video delivery (free paths only)

**Production path (preferred):** `@livekit/rtc-node` publishes a server bot participant into the existing LiveKit room with a synthetic video track fed by Chromium screencast frames (VP8). Clients reuse the existing wall live-share video renderer (`StreamVideo` path).

**Local dev fallback:** when LiveKit is unavailable or `SHARED_BROWSER_USE_JPEG_FALLBACK=true`, the API exposes `GET .../shared-browser/frame.jpg` (short-cache, ~5–10 fps polling) so developers can iterate without LiveKit Cloud or self-hosted LiveKit. This path is dev/QA only.

Both paths use **zero new paid services**.

### 3.5 Realtime sync

**Unreliable channel** (high frequency):

- `room.shared-browser.pointer.v1` — move, down, up, wheel; normalized 0..1 coords relative to board placement.
- `room.shared-browser.frame-request.v1` — optional nudge for JPEG fallback clients.

**Reliable channel** (state of record):

- `room.shared-browser.navigate.v1` — `{ url }` committed navigation.
- `room.shared-browser.history.v1` — `{ action: "back" | "forward" | "refresh" }`.
- `room.shared-browser.control-lease.v1` — `{ action: "take" | "release" | "renew" }`.
- `room.shared-browser.state.v1` — `{ currentUrl, title, status, controlLease? }` hydrate + course corrections.
- `room.shared-browser.session.v1` — `{ status: "starting" | "active" | "paused" | "error" | "stopped" }`.

REST mirrors the reliable actions for reconnect safety (same pattern as whiteboard stroke commits).

### 3.6 SSRF and abuse guardrails

Server-side navigation must reject:

- Non-HTTPS URLs (except localhost in explicit dev mode).
- Private/reserved IP ranges after DNS resolution (`10/8`, `172.16/12`, `192.168/16`, `127/8`, `169.254/16`, link-local, metadata hosts).
- `file:`, `javascript:`, `data:` schemes.
- Downloads initiated by the browser (Chromium prefs: disable download prompts / block downloads).

Optional FFA room setting: **`navigationAllowlistEnabled`** — when true, only hosts matching `RoomSettings.sharedBrowsers.navigationAllowlist` are reachable (same normalization as existing embed allowlist in `apps/api/src/app.ts`).

Rate limits:

- Max navigations per user per minute (default 20).
- Max pointer events per client per second (default 60, coalesced client-side).

---

## 4. Data and API model

### 4.1 New wall object type

Extend `WallObjectTypeSchema`:

```ts
"web.browser.shared"
```

Source shape:

```ts
source: {
  kind: "inline",
  data: {
    sessionId: string;
    startUrl: string;
  }
}
```

Cached runtime in `WallObject.state`:

```ts
{
  sessionStatus: "starting" | "active" | "paused" | "error";
  currentUrl: string;
  title: string;
  controlUserId?: string;
  controlDisplayName?: string;
  lastActivityAt: string;
}
```

### 4.2 Room-type feature flag

Extend `RoomTypeFeatureFlags`:

```ts
sharedBrowsers: boolean;
```

Default `false` everywhere except `FREE_FOR_ALL_ROOM_TYPE_FEATURE_FLAGS` → `true`.

### 4.3 Room settings

```ts
sharedBrowsers: z.object({
  enabled: z.boolean().default(true),
  maxActivePerRoom: z.number().int().min(0).max(4).default(2),
  defaultStartUrl: z.string().url().default("https://www.wikipedia.org"),
  viewportWidth: z.number().int().min(640).max(1920).default(1280),
  viewportHeight: z.number().int().min(360).max(1080).default(720),
  idlePauseMinutes: z.number().int().min(1).max(240).default(15),
  navigationAllowlistEnabled: z.boolean().default(false),
  navigationAllowlist: z.array(z.string()).default([]),
  controlLeaseSeconds: z.number().int().min(10).max(600).default(120),
}).default({ ... })
```

### 4.4 REST endpoints

All routes require current room membership. FFA equality model — any participant may act unless a control lease explicitly reserves keyboard focus.

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/v1/rooms/:roomId/wall-objects` (existing) | Create with `type: "web.browser.shared"`. |
| `GET` | `/v1/rooms/:roomId/wall-objects/:objectId/shared-browser` | Hydrate session + wall state. |
| `POST` | `/v1/rooms/:roomId/wall-objects/:objectId/shared-browser/navigate` | `{ url }` — SSRF-checked navigation. |
| `POST` | `/v1/rooms/:roomId/wall-objects/:objectId/shared-browser/history` | `{ action: "back" \| "forward" \| "refresh" }`. |
| `POST` | `/v1/rooms/:roomId/wall-objects/:objectId/shared-browser/control-lease` | `{ action: "take" \| "release" \| "renew" }`. |
| `POST` | `/v1/rooms/:roomId/wall-objects/:objectId/shared-browser/resume` | Resume a paused session (idempotent). |
| `GET` | `/v1/rooms/:roomId/wall-objects/:objectId/shared-browser/frame.jpg` | Dev-only JPEG fallback frame. |
| `DELETE` | `/v1/rooms/:roomId/wall-objects/:objectId` (existing) | Soft-remove wall object → stop session worker. |

Pointer events do **not** go through REST in production — they use the LiveKit data channel → API ingress endpoint:

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/v1/rooms/:roomId/shared-browser/realtime` | Accept batched pointer payloads from authenticated clients; returns `{ messages[] }` for fan-out (mirrors room-objects realtime dispatch). |

---

## 5. Environment variables

```
# --- Shared Browser (Free-for-All) ---
ENABLE_SHARED_BROWSERS=false
NEXT_PUBLIC_ENABLE_SHARED_BROWSERS=false

# Headless Chromium — bundled via puppeteer by default (no SaaS)
SHARED_BROWSER_VIEWPORT_WIDTH=1280
SHARED_BROWSER_VIEWPORT_HEIGHT=720
SHARED_BROWSER_MAX_ACTIVE_PER_ROOM=2
SHARED_BROWSER_IDLE_PAUSE_MINUTES=15
SHARED_BROWSER_MAX_NAVIGATIONS_PER_USER_PER_MINUTE=20

# SSRF — comma-separated blocked host suffixes added to built-in private-network guard
SHARED_BROWSER_BLOCKED_HOST_SUFFIXES=

# Dev-only JPEG fallback instead of LiveKit synthetic track
SHARED_BROWSER_USE_JPEG_FALLBACK=false
SHARED_BROWSER_JPEG_FPS=8

# Optional: explicit Chromium executable (e.g. Alpine package) instead of Puppeteer bundle
SHARED_BROWSER_CHROMIUM_EXECUTABLE=
```

Production validation when `ENABLE_SHARED_BROWSERS=true`:

- LiveKit configured **or** explicit opt-in to JPEG fallback for non-production only.
- No third-party browser API keys required or permitted.

---

## 6. Phased rollout

### Phase 1 — Contracts + feature flags

- Add `web.browser.shared` to `WallObjectTypeSchema`.
- Add `sharedBrowsers` to `RoomTypeFeatureFlags` (FFA only).
- Add `RoomSettings.sharedBrowsers`.
- Add `SharedBrowserSessionSchema`, request/response schemas, six realtime message schemas.
- Extend `FULL_WALL_OBJECT_ACCEPTS` + `WallAnchorCreateOption`.

### Phase 2 — API session lifecycle (stub driver)

- Mongoose + memory repository for `SharedBrowserSession`.
- Create wall object → create session row → return immediately with `status: "starting"`.
- Stub driver that only updates URL/title in DB (no Chromium yet).
- REST navigate/history/lease endpoints + tests.

### Phase 3 — Puppeteer driver (self-hosted Chromium)

- `apps/api/src/shared-browser/driver.ts` — launch, navigate, input, screencast loop.
- SSRF module shared with navigate REST.
- In-memory session registry with idle reaper.

### Phase 4 — Realtime fan-out

- `/shared-browser/realtime` ingress + LiveKit message envelopes.
- Web dispatcher in `RoomClient`.

### Phase 5 — Video delivery

- Production: `@livekit/rtc-node` synthetic track publish.
- Dev: JPEG fallback endpoint.

### Phase 6 — Web UI + 2D/3D parity

- `SharedBrowserSurface.tsx` + toolbar + pointer capture.
- `AnchorPanel` create flow.
- `WallObjectCard` sidebar branch.

### Phase 7 — Polish, validation, rollout

- Env templates, API tests, Playwright two-tab co-browsing spec.
- Operational runbook note for Chromium RAM on Koyeb (see IMPL doc).
- Staging behind flags.

---

## 7. Permissions

| Action | FFA v1 rule |
|---|---|
| Place Shared Browser | Any participant with anchor create permission (FFA: all participants). |
| Click / scroll | Any participant. |
| Type / keyboard | Holder of active control lease, or take lease first. |
| Navigate / back / forward / refresh | Any participant (rate limited). |
| Remove board | Any participant (cooperative cleanup norm, same as FFA dynamic boards). |

Classroom board-access grants **do not apply** — feature is FFA-only in v1.

---

## 8. Performance and scale

| Bound | Default | Why |
|---|---|---|
| Active shared browsers per room | 2 | Each session ≈ 150–400 MB RAM for Chromium. |
| Viewport | 1280×720 | Balance readability vs encode cost. |
| Screencast FPS | 10–15 | Enough for browsing; lower than game streaming. |
| Concurrent rooms with browsers | ops concern | API worker may need a dedicated container with `--no-sandbox` + sufficient memory. |

---

## 9. Failure modes

| Failure | Mitigation |
|---|---|
| Chromium OOM | Mark session `error`; client shows **Restart browser** (resume endpoint relaunches). |
| LiveKit publish fails | Fall back to JPEG polling in dev; production surfaces error badge + retry. |
| Creator leaves | No effect — session is room-scoped. |
| SSRF attempt | Reject with `navigation_blocked`; audit `RoomEvent`. |
| Two users fight for keyboard | Control lease serializes typing; clicks still work for quick interactions. |
| Site blocks automation | Some sites detect headless Chrome; document limitation; user can try a different site. |
| API restart | On boot, resume `active`/`paused` sessions from MongoDB for rooms with recent activity. |

---

## 10. Technical decisions

| Decision | Choice | Rationale |
|---|---|---|
| Third-party browser SaaS | **Rejected** | User constraint: no paid/freemium vendors; self-host only. |
| Browser engine | **Chromium via Puppeteer** | Free OSS; mature CDP; bundled binary. |
| Session ownership | **Room + wall object** | Persists after creator leaves. |
| Video transport | **Existing LiveKit** synthetic track | Reuses infra; no new vendor. |
| Dev transport | **JPEG polling** | Zero LiveKit dependency for local work. |
| Input transport | **LiveKit data channel + REST ack** | Matches whiteboard/dynamic-board patterns. |
| Keyboard concurrency | **Short control lease** | Avoids multi-typing chaos without a full presenter mode. |
| Cookie/login persistence | **Deferred** | URL-only persistence keeps v1 simpler and safer. |
| Room-type scope | **FFA only** | Matches open-collab posture; avoids classroom safeguarding review. |

---

## 11. Open questions

1. Should keyboard require an explicit lease, or should the last click focus holder auto-lease for 30 s? **Plan:** explicit **Take control** for v1.
2. Should navigation be allowlisted by default in FFA public rooms? **Plan:** off by default; operators can enable per deployment.
3. Dedicated browser worker container vs in-process on API? **Plan:** start in-process behind flag; split when RAM pressure appears (document in IMPL).
4. Resume paused sessions automatically on first join, or require a **Resume** button? **Plan:** auto-resume on first participant join after idle pause.
5. Should we expose a "Open in your browser" escape hatch link? **Plan:** yes — opens current URL in a new tab (read-only escape, does not sync back).

---

## 12. Relationship to existing planning

```
Free-for-All room type
├── Dynamic boards (shipped)
├── AI Meeting Notes (planned — uses OpenAI; separate vendor policy)
├── AI 3D Objects (planned — optional Meshy)
└── Shared Browser (this plan — **no new paid vendors**)
       ├── new WallObject type: web.browser.shared
       ├── new SharedBrowserSession entity
       ├── self-hosted Puppeteer/Chromium driver
       ├── LiveKit synthetic video (existing infra)
       └── new room.shared-browser.*.v1 realtime messages
```

Paired implementation doc: [`IMPL_FREE_FOR_ALL_SHARED_BROWSER.md`](./IMPL_FREE_FOR_ALL_SHARED_BROWSER.md).
