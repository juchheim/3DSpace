# Implementation — Shared Browser via Hyperbeam (Free-for-All)

Source plan (original self-hosted design): [`PLAN_FREE_FOR_ALL_SHARED_BROWSER.md`](./PLAN_FREE_FOR_ALL_SHARED_BROWSER.md)  
Prior implementation (Puppeteer + LiveKit): [`IMPL_FREE_FOR_ALL_SHARED_BROWSER.md`](./IMPL_FREE_FOR_ALL_SHARED_BROWSER.md)  
Parent room type: [`IMPL_FREE_FOR_ALL_ROOM.md`](./IMPL_FREE_FOR_ALL_ROOM.md)  
Vendor: [Hyperbeam](https://hyperbeam.com/) — embedded virtual browser API  
Branch: `room-types`  
Last updated: 2026-05-28

---

## Status / Scope

**Status:** Planning — not started.

This doc **replaces the browser runtime** described in `IMPL_FREE_FOR_ALL_SHARED_BROWSER.md` Phases 3 and 5 (Puppeteer, JPEG screencast, `@livekit/rtc-node` synthetic video). It **keeps** the product surface already shipped in Phases 1–2, 4, 6–7 (contracts, REST, realtime state, UI shell, lazy start, empty-room pause) and rewires **where the browser runs and how pixels reach the board**.

### Vendor policy (updated)

The original PLAN forbade paid browser SaaS. **This migration explicitly adopts Hyperbeam** as the managed browser + streaming layer because self-hosted Chromium on small API workers is not viable for acceptable quality, frame rate, and audio.

| Component | Role |
|---|---|
| **Hyperbeam** | Cloud Chromium session, WebRTC video/audio to clients, multi-user control |
| **3DSpace API** | Session orchestration, SSRF, persistence, permissions policy, billing guardrails |
| **3DSpace web** | `@hyperbeam/web` embed on the board; toolbar + lease UX |
| **LiveKit (existing)** | Realtime **data channel only** for URL/title/lease sync — **not** shared-browser video |
| **MongoDB** | `SharedBrowserSession` + `WallObject` (unchanged ownership model) |

**Removed after migration (delete or gate off):**

- `puppeteer` + bundled Chromium on API
- `apps/api/src/shared-browser/puppeteer-driver.ts`
- `apps/api/src/shared-browser/livekit-publisher.ts`
- `apps/api/src/shared-browser/jpeg-fallback.ts`
- `apps/api/src/shared-browser/video-manager.ts`
- `GET .../shared-browser/frame.jpg`
- Chromium packages in `apps/api/Dockerfile`
- Env: `SHARED_BROWSER_CHROMIUM_*`, screencast/JPEG/LiveKit-bot tuning for shared browser

### What ships

1. **Hyperbeam-backed** shared browser boards on FFA (same `web.browser.shared` wall object type).
2. **HD streaming** (configurable up to 1080p, 24–60 fps, `sharp` / `smooth` / `blocky` quality modes).
3. **Site audio** in the embed (with standard browser autoplay UX).
4. **No Chromium RAM** on the API container — API only calls Hyperbeam REST.
5. **Lazy start + empty-room pause** preserved: Hyperbeam session created on resume/first view; **terminated** when idle or room empty (no meter while paused).
6. **SSRF + https** navigation policy remains **server-enforced** before Hyperbeam session create / programmatic navigate.

### Out of scope (Hyperbeam v1)

- Hyperbeam Android / emulator runtimes.
- Per-participant Hyperbeam billing dashboard in the product UI (ops only).
- Classroom / workforce-training room types.
- Cookie jar persistence across days (Hyperbeam session save states are a follow-up).
- Replacing room A/V (LiveKit for cameras/mics) with Hyperbeam.

---

## Architecture

### Before (current)

```text
API worker
  Puppeteer Chromium  →  CDP JPEG screencast
       ↓
  sharp → @livekit/rtc-node synthetic track  →  LiveKit room
       ↓
  Clients subscribe shared-browser:<wallObjectId> video
  Clients send pointer/keyboard → API → Puppeteer
```

### After (Hyperbeam)

```text
API worker
  Hyperbeam REST: create / navigate / terminate session
  MongoDB: sessionId, embed metadata, URL, lease, status
       ↓
  Clients (per viewer): @hyperbeam/web(embedURL)
       ↓
  Hyperbeam CDN/WebRTC → video + audio + input on embed
       ↓
  Optional: frameCb → Three.js texture on 3D wall

Parallel: LiveKit data channel for room.shared-browser.*.v1 (state only)
```

### Responsibility split

| Concern | Owner |
|---|---|
| Browser process, encoding, fan-out video | **Hyperbeam** |
| URL allowlist / SSRF | **3DSpace API** |
| Room-owned session row, wall object lifecycle | **3DSpace API** |
| Toolbar (back/forward/URL/go) | **Web** → API navigate/history → Hyperbeam admin API |
| Pointer / wheel / typing in page | **Hyperbeam embed** (when user has control permission) |
| “Who may type” UX (`Take control`) | **3DSpace lease** + Hyperbeam `setUserPermission` |
| 3D board texture | **Web** (`frameCb` or `<video>` inside `Html`) |

---

## Hyperbeam integration reference

Docs: [Introduction](https://docs.hyperbeam.com/home/introduction) · [REST API](https://docs.hyperbeam.com/rest-api/dispatch/start-chromium-session) · [JS SDK](https://docs.hyperbeam.com/client-sdk/javascript/reference) · [FAQ / bandwidth](https://docs.hyperbeam.com/home/faq) · [Three.js example](https://github.com/hyperbeam/threejs-example)

### Session create (server)

`POST https://engine.hyperbeam.com/v0/vm` (see current REST docs for exact path/version).

Typical request fields to map from room settings:

| Hyperbeam param | 3DSpace source | Notes |
|---|---|---|
| `width` / `height` | `settings.sharedBrowsers.viewportWidth/Height` | Max pixel area 1920×1080 |
| `framerate` | `settings.sharedBrowsers.hyperbeamFramerate` | 24–60 |
| `quality` | `settings.sharedBrowsers.hyperbeamQuality` | `"sharp"` \| `"smooth"` \| `"blocky"` |
| `start_url` | wall object `startUrl` / navigate | After SSRF pass |
| `timeout.empty` / `offline` | idle + occupancy reapers | Align with `idlePauseMinutes` / room empty |
| `tag` | `wallObjectId` or `session.id` | Optional dedupe: one HB session per board |

Response fields to persist:

- `session_id` → `SharedBrowserSession.hyperbeam.sessionId`
- `embed_url` → returned to clients on hydrate (per-user or shared — see security)
- `admin_token` → **server only** (never broadcast to clients)

### Session terminate (server)

Call Hyperbeam terminate when:

- Wall object deleted
- Idle reaper pauses session
- Occupancy reaper pauses (room empty)
- API shutdown (best-effort)

### Client embed

```ts
import Hyperbeam from "@hyperbeam/web";

const hb = await Hyperbeam(container, embedUrl, {
  adminToken: undefined, // normal participants use embed URL token only
  quality: "sharp",      // if exposed client-side; prefer server-set on create
  frameCb: (frame) => { /* 3D texture update */ },
  audioTrackCb: (track) => { /* route to <audio> or WebAudio */ },
  delegateKeyboard: true
});
```

**3D wall:** Prefer Hyperbeam’s **Three.js / R3F examples** — `frameCb` supplies `ImageBitmap` (Chrome) or `HTMLVideoElement` (other browsers) for `CanvasTexture` / `VideoTexture` inside the existing `Html` transform on the board.

**Autoplay:** If no prior user gesture, Hyperbeam shows a **Play** button until interaction — document in UI copy.

### Pricing (ops)

Public list pricing (verify on [hyperbeam.com](https://hyperbeam.com/) before production):

| Item | Value |
|---|---|
| Free tier | **10,000 participant-minutes / month** |
| Overage | **~$0.007 / participant-minute** (volume discounts) |
| Billing unit | **Per connected viewer × time**, not per browser session hour |

**Cost implication:** A board with 4 people watching for 30 minutes ≈ **120 participant-minutes** per session block. Design UX to avoid subscribing the whole room to video when nobody is looking at the board (see Phase 6).

---

## Codebase context (migration baseline)

Built on `room-types` as of 2026-05-28 after lazy start + occupancy pause.

| Area | Current files | Migration action |
|---|---|---|
| Driver | `puppeteer-driver.ts`, `stub-driver.ts` | Add `hyperbeam-driver.ts`; remove Puppeteer from production path |
| Video | `livekit-publisher.ts`, `video-manager.ts`, `jpeg-fallback.ts` | **Remove** for shared browser |
| Orchestrator | `orchestrator.ts` | `ensureLiveSession` → create HB session; `pauseSession` → terminate HB |
| Web video | `useSharedBrowserVideo.ts`, `StreamVideo` in surface | Replace with `useHyperbeamEmbed.ts` |
| Realtime | `room.shared-browser.pointer.v1` | Stop emitting; optional ack-only for compat |
| `realtime.ts` | Maps `shared-browser:*` to `wallMediaStreams` | **Remove** shared-browser video mapping |
| Config | Puppeteer/JPEG/LiveKit tuning | Replace with `HYPERBEAM_API_KEY`, quality/fps |
| Dockerfile | Chromium deps | Remove shared-browser Chromium layers |
| Tests | `puppeteer-driver.test.ts`, JPEG tests | Replace with Hyperbeam driver mocks |

---

## Plan adjustments

**A. `SharedBrowserDriver` interface shrinks.** Hyperbeam does not need server-side pointer/screencast:

```ts
export interface SharedBrowserDriver {
  start(input: {
    session: SharedBrowserSession;
    startUrl: string;
    navigationGuard: NavigationGuardSettings;
    render: { width: number; height: number; framerate: number; quality: "sharp" | "smooth" | "blocky" };
    timeouts?: { emptySeconds?: number; offlineSeconds?: number };
  }): Promise<{ url: string; title: string; hyperbeam: { sessionId: string; embedUrl: string; adminToken: string } }>;

  stop(externalSessionId: string): Promise<void>;

  navigate(externalSessionId: string, url: string): Promise<{ url: string; title: string }>;

  history(externalSessionId: string, action: "back" | "forward" | "refresh"): Promise<{ url: string; title: string }>;

  isLive?(externalSessionId: string): boolean;
}
```

Remove `pointer`, `keyboard`, `screencastLoop` from the production driver (keep stub no-ops for tests if needed).

**B. Do not send `admin_token` to browsers.** Only return `embedUrl` from authenticated `GET .../shared-browser` (or a dedicated `POST .../shared-browser/embed-token`). Store `adminToken` server-side for navigate/history/terminate.

**C. Control lease → Hyperbeam permissions.** On `take` / `release` / cooperative takeover (existing orchestrator behavior):

1. Update Mongo `controlLease` (unchanged contract).
2. Client with lease calls `hb.setUserPermission(userId, { control: true, ... })` via admin flow **or** server uses admin REST to set default permissions for the joining user.

Investigate Hyperbeam’s [permissions API](https://docs.hyperbeam.com/client-sdk/javascript/reference) during Phase 2; fallback: server holds admin and only the lease holder’s client gets `control: true` on connect.

**D. Navigation path.** Toolbar `Go` / back / forward:

1. Client → existing REST (`navigate`, `history`).
2. API validates SSRF → Hyperbeam admin navigate API.
3. API updates Mongo `currentUrl` / `title` → fan-out `navigate.v1` + `state.v1` (unchanged).

**E. Lazy start (keep).** `createSession` still creates Mongo row `paused` with **no** Hyperbeam VM. `resume` / `ensureLiveSession` creates the Hyperbeam session and stores `embedUrl`.

**F. Empty-room + idle pause (keep).** `pauseSession` calls Hyperbeam **terminate** and clears `hyperbeam.sessionId` / `embedUrl` from the row (or marks stale). Clients destroy embed and show “Browser paused”.

**G. Realtime pointer messages.** Deprecate sending `room.shared-browser.pointer.v1` from clients; remove `POST .../shared-browser/realtime` pointer handling (or return 410). Keeps data channel traffic low.

**H. Feature flags unchanged.** Still `ENABLE_SHARED_BROWSERS` + FFA `sharedBrowsers` + room settings `enabled`.

**I. Production config.** When `enableSharedBrowsers=true` in production:

- Require `HYPERBEAM_API_KEY`
- **Do not** require LiveKit for shared browser (remove `requiredInProduction` LiveKit coupling for this feature)
- Remove `SHARED_BROWSER_USE_JPEG_FALLBACK` production guard (delete feature)

---

## Data model changes

### `SharedBrowserSessionSchema` (`packages/contracts`)

```ts
// Add (required when status === "active" and hyperbeam-backed):
hyperbeam: z.object({
  sessionId: z.string().min(1),
  // embedUrl stored for hydrate convenience; may be omitted when paused
  embedUrl: z.string().url().optional()
}).optional(),

// Deprecate (remove after migration, no dual-publish period):
livekit: z.object({
  participantIdentity: z.string().min(1),
  trackSid: z.string().optional()
}).optional(),
```

### `RoomSettings.sharedBrowsers`

Add / replace tuning:

```ts
hyperbeamQuality: z.enum(["sharp", "smooth", "blocky"]).default("smooth"),
hyperbeamFramerate: z.number().int().min(24).max(60).default(30),
// Remove or ignore: deviceScaleFactor, screencastQuality, screencastEveryNthFrame, jpegFps
```

Keep: `viewportWidth`, `viewportHeight`, `maxActivePerRoom`, `idlePauseMinutes`, `navigationAllowlist*`, `controlLeaseSeconds`.

### API config (`apps/api/src/config.ts`)

| Env var | Default | Purpose |
|---|---|---|
| `HYPERBEAM_API_KEY` | — | **Required** when shared browsers enabled in prod |
| `HYPERBEAM_API_BASE` | `https://engine.hyperbeam.com` | Override for mocks |
| `SHARED_BROWSER_HYPERBEAM_QUALITY` | `smooth` | Default quality mode |
| `SHARED_BROWSER_HYPERBEAM_FRAMERATE` | `30` | 24–60 |
| `SHARED_BROWSER_HYPERBEAM_REGION` | optional | Nearest region hint |

Remove from shared-browser production path: `SHARED_BROWSER_CHROMIUM_EXECUTABLE`, screencast/JPEG vars (or leave ignored with deprecation comment).

### Web config

| Env var | Purpose |
|---|---|
| `NEXT_PUBLIC_SHARED_BROWSER_HYPERBEAM_REGION` | Optional client region hint for create |
| `NEXT_PUBLIC_SHARED_BROWSER_HYPERBEAM_PLAYOUT_DELAY` | `true` enables Hyperbeam `playoutDelay` (smoother, higher latency) |

No Hyperbeam API key in the web bundle.

---

## Phased implementation

### Phase 1 — Contracts + config

**Goal:** Schema and flags for Hyperbeam fields; remove LiveKit-bot requirement for shared browser.

1. Extend `SharedBrowserSessionSchema` with optional `hyperbeam` block; mark `livekit` deprecated in comment, remove in Phase 8.
2. Extend `RoomSettings.sharedBrowsers` with `hyperbeamQuality`, `hyperbeamFramerate`.
3. `apps/api/src/config.ts`: add Hyperbeam env vars; relax `requiredInProduction()` — require `HYPERBEAM_API_KEY` instead of LiveKit for shared browsers.
4. Update `.env.example` files; `DEPLOYMENT_CHECKLIST.md` — Hyperbeam billing note, remove Chromium RAM note for shared browser.

**Validation:** `npm run typecheck` (contracts, api, web).

---

### Phase 2 — Hyperbeam driver + orchestrator

**Goal:** Server can create, navigate, and terminate Hyperbeam sessions without Puppeteer.

**New: `apps/api/src/shared-browser/hyperbeam-driver.ts`**

- `fetch` wrapper with `Authorization: Bearer ${apiKey}`
- `start()` → create VM, return `{ url, title, hyperbeam: { sessionId, embedUrl, adminToken } }`
- `stop()` → terminate
- `navigate()` / `history()` → admin REST (read Hyperbeam docs for exact endpoints)
- Unit tests with **mocked fetch** (no network)

**Update: `orchestrator.ts`**

- Inject `HyperbeamDriver` when `HYPERBEAM_API_KEY` set; else keep stub for offline tests.
- `createSession` (lazy): paused row, no HB call.
- `ensureLiveSession`: if no `hyperbeam.sessionId`, call `driver.start`, persist `hyperbeam` + `active`.
- `pauseSession`: `driver.stop(hyperbeam.sessionId)`, clear hyperbeam fields, `status: paused`.
- Remove calls to `video?.onSessionActive/Inactive` for shared browser.

**Update: `app.ts`**

- Build `HyperbeamDriver` instead of `PuppeteerSharedBrowserDriver` when enabled.
- Remove `SharedBrowserVideoManager`, idle reaper’s video hook (idle/occupancy reapers only call orchestrator).

**Delete or stop wiring:** `puppeteer-driver.ts` from `buildApp` (file can remain for reference until Phase 8).

**Tests:**

- `hyperbeam-driver.test.ts` — mock create/navigate/terminate.
- Update `api.test.ts` shared-browser tests — mock Hyperbeam driver via injected orchestrator (same pattern as today’s stub).

---

### Phase 3 — API surface cleanup

**Goal:** Remove pixel pipeline endpoints and input ingress.

1. Remove route `GET .../shared-browser/frame.jpg`.
2. Change `POST .../shared-browser/realtime` to **keyboard-only** optional or **remove entirely** (Hyperbeam handles input). If removed, update `useSharedBrowser` to drop `queuePointer` / `queueKey` / `sendSharedBrowserInput`.
3. `hydrate` / session responses: include `hyperbeam.embedUrl` when active; never include `adminToken`.
4. Optional: `POST .../shared-browser/embed` that returns fresh `embedUrl` for reconnect (if Hyperbeam tokens expire).

---

### Phase 4 — Web: Hyperbeam embed hook

**Goal:** Replace JPEG/LiveKit video with `@hyperbeam/web`.

**Deps:** `apps/web/package.json` → `"@hyperbeam/web": "^0.x"` (pin latest compatible).

**New: `apps/web/components/SharedBrowser/useHyperbeamEmbed.ts`**

- Input: `embedUrl | null`, `enabled`, `quality`, callbacks for `onClose`, `onDisconnect`
- Mount `Hyperbeam` into a `div` ref in the viewport
- Wire `audioTrackCb` → hidden `<audio autoplay>` or existing room audio graph
- Expose `hb` instance for permission APIs (control lease)
- Destroy on unmount / when `embedUrl` cleared

**Update: `SharedBrowserSurface.tsx`**

- Remove `StreamVideo`, `useSharedBrowserVideo`, pointer capture overlay (Hyperbeam receives input when permitted).
- Show placeholder when `paused` / no `embedUrl`; “Resume” triggers existing `resume` REST → hydrate → embed.
- Keep toolbar (navigate/history/lease) — still uses `useSharedBrowser` REST + realtime.

**Update: `useSharedBrowser.ts`**

- Remove pointer/keyboard batching + `sendSharedBrowserInput` if Phase 3 removed ingress.
- On `control-lease` success, call into `useHyperbeamEmbed` ref to update permissions.

**Update: `RoomClient.tsx`**

- Stop passing `videoStream` for shared browser boards.
- Remove shared-browser branch in `wallMediaStreams` / LiveKit track handler (`realtime.ts`).

---

### Phase 5 — 3D / 2D rendering quality

**Goal:** Crisp board display in `RoomView3D` Html surfaces.

1. Implement **3D path** using Hyperbeam `frameCb` + `CanvasTexture` update loop (see official `threejs-example`).
2. **2D path** can use default video element rendering inside the surface (simpler).
3. Match `viewportWidth/Height` to Hyperbeam create dimensions; avoid upscaling tiny textures on large boards where possible.
4. `playoutDelay` option: expose as advanced room setting if motion stutters (trades latency for smoothness).

**CSS:** Full-bleed viewport, no letterboxing from old JPEG aspect quirks.

---

### Phase 6 — Cost controls + lifecycle hardening

**Goal:** Avoid burning participant-minutes.

1. **Only mount Hyperbeam** when the board surface is visible (3D overlay visible hook / 2D tab active / fullscreen). Tear down embed when off-screen.
2. Align Hyperbeam `timeout.offline` with occupancy reaper (room empty).
3. Align `timeout.empty` with idle reaper (`idlePauseMinutes`).
4. Document in AnchorPanel: “Shared browsers use Hyperbeam (usage-based billing).”
5. Optional later: single “presenter” subscribes to video, others see static thumbnail — out of scope unless cost requires it in v1.

---

### Phase 7 — Decommission Puppeteer path

**Goal:** Remove dead code and Docker weight.

| Action | Target |
|---|---|
| Delete or archive | `puppeteer-driver.ts`, `livekit-publisher.ts`, `jpeg-fallback.ts`, `video-manager.ts` |
| Delete | `useSharedBrowserVideo.ts`, `frame.jpg` route |
| Remove deps | `puppeteer` from `apps/api/package.json` if unused elsewhere |
| Dockerfile | Remove Chromium/apt packages added for shared browser |
| Tests | Remove `puppeteer-driver.test.ts` |
| Grep guard | `rg "puppeteer|livekit-publisher|frame\.jpg|screencastLoop" apps/` → shared-browser clean |

---

### Phase 8 — E2E, docs, rollout

1. **Playwright** (`apps/web/test/shared-browser.spec.ts`):
   - Mock Hyperbeam REST on API **or** use test API key in CI secret.
   - Two tabs: create board, resume, see video container, navigate URL, audio play button handling.
2. Update `PLAN_FREE_FOR_ALL_SHARED_BROWSER.md` § 1.1 with pointer to this IMPL as production path.
3. Update `IMPL_FREE_FOR_ALL_SHARED_BROWSER.md` status banner: superseded by Hyperbeam for runtime.
4. Staging: set `HYPERBEAM_API_KEY`, disable Chromium on API, monitor Hyperbeam dashboard usage.
5. Production rollout behind existing `ENABLE_SHARED_BROWSERS` flag.

---

## Files-to-touch summary

| Area | Files |
|---|---|
| Contracts | `packages/contracts/src/index.ts` |
| API config | `apps/api/src/config.ts`, `.env.example`, `apps/api/.env.example` |
| API core | `apps/api/src/app.ts`, `apps/api/src/shared-browser/orchestrator.ts`, **new** `hyperbeam-driver.ts` |
| API cleanup | Remove `puppeteer-driver.ts`, `livekit-publisher.ts`, `jpeg-fallback.ts`, `video-manager.ts` (Phase 7) |
| API tests | `hyperbeam-driver.test.ts`, update `api.test.ts`, remove puppeteer tests |
| Web deps | `apps/web/package.json` — `@hyperbeam/web` |
| Web | `useHyperbeamEmbed.ts`, `SharedBrowserSurface.tsx`, `useSharedBrowser.ts`, `RoomClient.tsx`, `RoomView3D.tsx`, `RoomView2D.tsx`, `WallObjectCard.tsx`, `realtime.ts` |
| Ops | `docs/planning/mvp/DEPLOYMENT_CHECKLIST.md`, `apps/api/Dockerfile` |
| E2E | `apps/web/test/shared-browser.spec.ts` |

---

## Security

| Topic | Approach |
|---|---|
| SSRF | Keep `assertNavigationAllowed` on create + every programmatic navigate |
| Embed URL leakage | HTTPS only; hydrate requires room auth; short-lived tokens if Hyperbeam supports |
| Admin token | Server-only; never in realtime messages or client JSON |
| Participant-minutes abuse | Rate-limit session create; `maxActivePerRoom`; room empty terminate |
| Education / compliance | Review Hyperbeam DPA, data residency, subprocessors before FFA production |

---

## Risks

| Risk | Mitigation |
|---|---|
| Hyperbeam outage | Graceful `error` session state; “Open in new tab” escape hatch (already in UI) |
| Cost spikes from many viewers | Visibility-gated embed; occupancy pause; monitor dashboard |
| Autoplay blocked | Hyperbeam play overlay; user gesture copy |
| 3D texture perf | Limit board resolution; `smooth` not `sharp` on low-end clients |
| Vendor lock-in | Session model in Mongo is vendor-agnostic; driver interface retained |
| Control lease desync | On hydrate, reconcile lease holder with Hyperbeam permissions |

---

## Validation checkboxes

- [x] Phase 1: contracts + config typecheck; OpenAPI regenerated if session shape changes.
- [x] Phase 2: hyperbeam driver unit tests; API shared-browser tests pass with mock driver.
- [x] Phase 3: `frame.jpg` removed; no `pointer.v1` emitted from clients.
- [x] Phase 4: web typecheck; manual single-tab embed loads Wikipedia.
- [x] Phase 5: 3D board uses `frameCb` + canvas; 2D map uses DOM video; optional `NEXT_PUBLIC_SHARED_BROWSER_HYPERBEAM_PLAYOUT_DELAY`.
- [x] Phase 6: visibility-gated embed (`hyperbeamEmbedVisible`, tab visibility, 2D `IntersectionObserver`); Hyperbeam `timeout.offline`/`empty` aligned with reapers; AnchorPanel billing note.
- [x] Phase 7: Puppeteer/JPEG/LiveKit publisher removed; API Docker image slimmed; `puppeteer` and `@livekit/rtc-node` deps removed.
- [x] Phase 8: Playwright `shared-browser.spec.ts` with Hyperbeam REST mock + client embed mock; PLAN/IMPL cross-links; rollout notes in `DEPLOYMENT_CHECKLIST.md`.

---

## Migration checklist (from current `room-types` implementation)

1. Obtain Hyperbeam API key; confirm billing alerts.
2. Land Phases 1–4 behind flag on staging.
3. Verify cooperative control lease still works with Hyperbeam permissions.
4. Run side-by-side: one board on old Puppeteer build vs new Hyperbeam build (quality comparison).
5. Land Phase 7–8; remove Chromium from production API deploy.
6. Update planning docs and team runbook with participant-minute cost model.

---

## Out-of-scope follow-ups

- Hyperbeam **session save states** for semi-persistent login.
- **Region pinning** (`region` param) for EU users.
- **Presenter-only video** subscription to cut participant-minutes.
- Classroom rollout with separate safeguarding review.
- Hyperbeam **kiosk mode** / URL allowlist at HB layer in addition to API SSRF.
