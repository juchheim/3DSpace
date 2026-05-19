# Safari LiveKit ICE Connection Failure - Investigation Handoff

**Status:** Diagnosed — application join/realtime code is ruled out as the root cause. Safari fails relay-only ICE gathering against LiveKit Cloud TURN servers even in a minimal repro (`/debug/livekit-safari/[roomId]`) with zero candidates on both school Wi‑Fi and cellular hotspot.  
**Branch:** `mvp-plus-one`  
**Primary files:** `apps/web/lib/realtime.ts`, `apps/web/components/LiveKitSafariDebug.tsx`  
**LiveKit SDK:** `livekit-client@2.2.0`

---

## Symptom

Safari users see: `"LiveKit connection timed out on Safari while negotiating WebRTC."`

Chrome/Firefox users connect immediately.

Earliest evidence (before minimal repro):

Latest hotspot result (pre–minimal repro):

- LiveKit signaling connects successfully.
- LiveKit Cloud returns three TURN URLs: one UDP TURN URL and two TCP TLS TURN URLs.
- Relay-only path: the RTCPeerConnection config shows `iceTransportPolicy: "relay"`, but both publisher and subscriber PCs stay at `iceConnectionState=new` and `iceGatheringState=gathering`; no relay candidates or `icecandidateerror` events are emitted.
- Restored default v1 path: the URL uses `/rtc/v1`, only the publisher PC exists, `iceTransportPolicy` is `all`, and Safari produces only TCP host pairs.
- Default v1 stats show local TCP host candidates on port `9`, remote LiveKit TCP host candidates on port `7881`, and candidate pairs stuck in `state=waiting`.
- LiveKit Cloud kills each attempt at about 14-15s with `DisconnectReason.CONNECTION_TIMEOUT` (`reason: 14`) regardless of the client-side 45s timeout.

---

## Diagnosed Bug

Safari is handed valid TURN servers by LiveKit Cloud, but the browser-level `RTCPeerConnection` is still being created without `iceTransportPolicy: "relay"`.

That means:

- the app thinks Safari is in relay-only mode;
- LiveKit still creates the actual peer connection with no explicit relay policy;
- Safari falls back onto host TCP candidates instead of TURN relay candidates;
- the candidate pairs stay `waiting` with `bytesSent=0` / `bytesReceived=0`;
- LiveKit eventually disconnects the participant with `DisconnectReason.CONNECTION_TIMEOUT` (`reason: 14`).

This is not a token bug, not a room session bug, and not a generic "Safari needs media permission" bug. The TURN credentials are valid and present; the transport policy enforcement was simply not reaching the browser object that matters.

---

## How The Bug Was Found

The investigation narrowed the problem in stages:

1. **Rule out app-level session drift**
   - Logged the session returned by `/v1/rooms/:roomId/session` before `room.connect()`.
   - Confirmed Safari was getting the expected `livekitUrl`, `participantIdentity`, role, and a normal JWT grant shape.

2. **Rule out permission-gated connection startup**
   - Added a Safari-only permission warmup using `getUserMedia({ audio: true })`.
   - Safari successfully granted audio permission, but `room.connect()` still failed with `could not establish pc connection`.

3. **Verify TURN credentials actually arrive**
   - Wrapped Safari `RTCPeerConnection` creation and logged the raw `RTCConfiguration`.
   - Confirmed LiveKit was passing valid TURN server URLs and credentials:
     - UDP TURN on `*.host.livekit.cloud:3478`
     - TCP/TLS TURN on `*.turn.livekit.cloud:443`

4. **Verify what candidates Safari actually uses**
   - Logged ICE stats from Safari’s peer connection.
   - Despite valid TURN servers, the only candidates visible in stats were:
     - local `host` `tcp` on port `9`
     - remote `host` `tcp` on port `7881`
   - Candidate pairs remained `state=waiting`, `nominated=false`, `bytesSent=0`, `bytesReceived=0`.

5. **Compare intended transport policy vs actual browser config**
   - The app logged Safari transport intent as relay-only.
   - But the actual `[Safari RTC create json]` output showed `iceServers` only, with no `iceTransportPolicy: "relay"` on the `RTCPeerConnection` config.
   - That gap identified the concrete bug: relay policy was being requested at the LiveKit room layer but dropped before browser PC construction.

---

## Fix Direction

Enforce `iceTransportPolicy: "relay"` at the Safari browser boundary itself, not only through LiveKit room options.

Specifically:

- wrap `window.RTCPeerConnection` on Safari;
- inject `iceTransportPolicy: "relay"` into the constructor config;
- also inject it into any later `pc.setConfiguration(...)` call, since LiveKit may mutate the RTC configuration after PC creation.

This ensures the relay policy survives all the way to the actual browser `RTCPeerConnection`, which is the object Safari uses to choose candidate types.

---

## Fix History

### Earlier Working Shape

Earlier Safari code used LiveKit defaults:

- `singlePeerConnection` left at the SDK default (`true`);
- no RTCPeerConnection monkey-patch;
- no forced relay-only ICE policy;
- longer Safari `peerConnectionTimeout` / `websocketTimeout` window.

That shape matches the known "Safari worked earlier today and yesterday" signal better than the later TURN experiments.

### Experiment 1: Force v0 Signaling Path

The theory was that LiveKit's default v1 path creates RTCPeerConnection before the join response arrives, so TURN servers are added later via `setConfiguration()`.

Result: v0 created PCs with TURN servers present, but Safari still did not connect.

### Experiment 2: Split Multi-URL RTCIceServer

The theory was that WebKit fails a multi-URL `RTCIceServer` object after the UDP TURN URL fails and never reaches TCP TLS TURN URLs.

Result: the patch worked mechanically (`[ICE split] 1 -> 3`), but Safari still did not generate relay candidates.

### Experiment 3: Force `iceTransportPolicy: "relay"`

The theory was that relay-only mode would bypass slow mDNS host candidate gathering and force TURN allocation immediately.

Result: failed on mobile hotspot. The config showed `policy=relay`, but both PCs stayed `new/gathering`, with zero relay candidates and zero `icecandidateerror` events.

### Current Candidate: Restore Default LiveKit Path + 45s Safari Timeout

Change in `apps/web/lib/realtime.ts`:

- remove `window.RTCPeerConnection` monkey-patch;
- remove forced `iceTransportPolicy: "relay"`;
- remove `singlePeerConnection: false`;
- restore Safari `peerConnectionTimeout` / `websocketTimeout` to 45s.

Result: still failed. The default v1 path was confirmed by `/rtc/v1` and `subPc=false`, but LiveKit Cloud timed out each attempt at about 15s while candidate pairs remained `waiting`.

### Experiment 4: Disabled Video Primer Track

Change in `apps/web/lib/realtime.ts`:

- before `room.connect()` on Safari, create `getEmptyVideoStreamTrack()`;
- publish it with name `__3dspace_safari_ice_primer`, source `unknown`, stream `__3dspace_safari_ice_primer`, simulcast disabled, H.264;
- filter this publication out of remote media handlers;
- unpublish it after connect or stop it on failure.

Result: still failed. The primer published successfully, but Safari still produced only TCP host port `9` candidates and candidate pairs remained `waiting`.

### Experiment 5: Host-Only ICE + Enabled Silent Audio Primer

Change in `apps/web/lib/realtime.ts`:

- Safari `room.connect()` now uses `rtcConfig: { iceServers: [] }`, which prevents LiveKit's TURN/STUN list from being injected;
- before `room.connect()` on Safari, create `getEmptyAudioStreamTrack()`;
- set `track.enabled = true`;
- publish it with name `__3dspace_safari_ice_primer`, source `unknown`, stream `__3dspace_safari_ice_primer`, `dtx: false`, `red: false`;
- keep filtering this publication out of remote media handlers;
- unpublish it after connect or stop it on failure.

This is still synthetic media, not a user device track. The empty audio track comes from LiveKit's own oscillator helper and should not prompt for microphone access.

### Experiment 6: Regional US RTC Endpoint for Safari

Change in `apps/web/lib/realtime.ts`:

- Safari now rewrites the LiveKit project URL from `wss://<subdomain>.livekit.cloud` to `wss://<subdomain>.us.rtc.livekit.cloud` before `room.connect()`;
- non-Safari clients still use the original project endpoint;
- host-only ICE and the enabled silent audio primer remain active for Safari.

Reasoning:

- LiveKit's current firewall and region documentation explicitly support regional RTC endpoints such as `wss://<subdomain>.us.rtc.livekit.cloud`;
- the docs state that the default `<subdomain>.livekit.cloud` address resolves to the cluster closest to the client, while the regional RTC address keeps the connection on the requested regional infrastructure;
- current failures consistently land on `ochicago1b` with only TCP host candidate pairs (`local port 9`, `remote port 7881`) stuck in `waiting`;
- LiveKit also has a known Safari ICE/TCP issue in its public tracker, which makes a bad TCP-only edge path a stronger suspect than another client-side transceiver quirk.

Result: still failed. The explicit US regional RTC endpoint connected to the same US Central node family and produced the same TCP-only ICE stats: local host TCP port `9`, remote host TCP port `7881`, candidate pairs stuck in `waiting`, and LiveKit timeout reason `14`.

### Experiment 7: Restore the Earlier Same-Day Safari Path

Change in `apps/web/lib/realtime.ts`:

- Safari again calls `room.prepareConnection()` before `room.connect()`;
- Safari uses `autoSubscribe: false` during `room.connect()`;
- after connect, Safari explicitly subscribes remote tracks and calls `room.startAudio()`;
- the endpoint rewrite, host-only ICE override, primer track, and extra Safari room options are removed.

Reasoning:

- this matches the simpler 2.19.0 Safari flow that was in the repo earlier the same day when Safari reportedly worked;
- the endpoint rewrite and all ICE overrides failed to change the transport shape at all;
- the most plausible regression left is not "Safari needs another workaround", but "we walked away from the last working connect flow."

Result: still failed according to the next Safari retest.

### Experiment 8: Pre-Classroom Baseline (`32eb86b^`)

Anchor:

- the phrase `Phase 1: Contracts And Persistence` appears in `docs/planning/mvp+1/MVP_PLUS_ONE_CLASSROOM_TOOLS_IMPLEMENTATION.md`;
- the nearest code milestone is `32eb86b` (`Add MVP+1 classroom tools planning and initial classroom state implementation`);
- `apps/web/lib/realtime.ts` at `32eb86b^` used a simple connect flow and `apps/web/package.json` pinned `livekit-client` to `^2.2.0`.

Change in `apps/web/lib/realtime.ts`:

- remove Safari-only `prepareConnection()`, `autoSubscribe: false`, room recreation, reconnect helpers, and timeout wrappers;
- restore simple `await room.connect(normalizeLiveKitUrl(input.session.livekitUrl), input.session.token)`;
- keep current classroom message types and `syncParticipants()` API surface, but use the older connection behavior.

Change in `apps/web/package.json` and `package-lock.json`:

- pin `livekit-client` back to `2.2.0`.

Reasoning:

- this is the cleanest regression boundary in the repo;
- it predates the classroom-tools phase the user pointed at;
- it also predates the same-day SDK bump to `2.19.0` that triggered the Safari patch cascade.

Result: this overshot the likely break window. The user confirmed Safari had been working more recently, and the first Safari-specific fix work does not begin until `22a1b91`.

### Current Candidate: Immediate Pre-Safari-Fix Window (`6a0c5ea`)

Window:

- `6a0c5ea` (`Fix teacher LiveKit connect hanging on Room session ready`) is the last non-Safari-specific LiveKit change before the break;
- `2f74b89` (`Fix teacher LiveKit fallback caused by stale duplicate connections`) changes connect teardown/retry behavior and adds `prepareConnection()`;
- `22a1b91` is the first explicit Safari repair attempt.

Current restoration:

- keep `livekit-client@2.2.0`;
- restore the initial MVP LiveKit path from `f7e4bef`, adapted only enough to preserve today's wall/classroom API surface:
  - dynamic `livekit-client` import;
  - plain `await room.connect(input.session.livekitUrl, input.session.token)`;
  - no `normalizeLiveKitUrl()`;
  - no connect timeout wrapper;
  - no `prepareConnection()`;
  - no disconnect/retry loop;
  - no Safari-only room options;
  - no periodic local presence publish over LiveKit;
  - no room recreation or dual-PC Safari path.

Reasoning:

- the `6a0c5ea` and `827776c` candidates still failed on Safari;
- the next clean regression boundary is the original MVP connection path before later lifecycle work was added;
- if Safari still fails here, the evidence shifts away from client-side LiveKit connect flow changes and toward a server-side/environment change, or a regression outside `apps/web/lib/realtime.ts`.

---

## Current Code State

Safari Room options:

```typescript
new Room({ adaptiveStream: true, dynacast: true })
```

Safari connect options:

```typescript
await room.connect(input.session.livekitUrl, input.session.token);
```

---

## Verified Evidence

From the decisive Safari hotspot run:

- `getUserMedia({ audio: true })` permission warmup succeeded;
- session log showed the expected LiveKit Cloud project URL and participant identity;
- Safari `RTCPeerConnection` config contained valid TURN servers with credentials;
- Safari ICE stats still showed only host TCP candidates on port `9` locally and `7881` remotely;
- no relay candidates appeared before timeout;
- the app-level relay intent did not show up in the actual PC config;
- LiveKit then region-fell back and timed out again.

That combination is what isolated the bug.

From the final raw TURN probe run:

- Safari received a valid relay-only `RTCConfiguration` with TURN credentials from LiveKit Cloud;
- a standalone `RTCPeerConnection` using that exact config was created outside LiveKit negotiation;
- the probe created a data channel and attempted local ICE gathering;
- the probe timed out with:

```json
{"reason":"timeout","candidates":[]}
```

- Safari emitted no relay candidates, no host candidates, and no `icecandidateerror` events even in the raw probe.

This is the strongest evidence in the investigation. It shows the failure is not caused by:

- room token shape;
- LiveKit session response shape;
- the app's join/reconnect flow;
- Safari media permission state;
- missing TURN credentials;
- or relay policy not reaching the browser.

It points to Safari failing TURN candidate allocation itself for the supplied LiveKit TURN servers in this environment.

---

## Minimal Repro: Application Code Ruled Out

**Route:** `/debug/livekit-safari/[roomId]?invite=<code>`  
**Component:** `apps/web/components/LiveKitSafariDebug.tsx`  
**Commit:** `0a5fd14` (Safari LiveKit debug page)

The debug page intentionally bypasses the normal classroom stack. It only:

1. Fetches a room session via the same API as production (`joinRoom`).
2. Runs Safari `getUserMedia` permission warmup (audio, then video).
3. Wraps `window.RTCPeerConnection` for logging and forces `iceTransportPolicy: "relay"` on every constructed PC.
4. Runs a one-shot raw TURN probe: standalone `RTCPeerConnection` + data channel + `createOffer()` / `setLocalDescription()` using the ICE servers from LiveKit’s first PC config (6s timeout).
5. Calls bare `room.connect(livekitUrl, token)` with `Room({ rtcConfig: { iceTransportPolicy: "relay" } })`.

### Conclusion

If the main app’s join flow, reconnect logic, classroom sync, avatar presence, or `realtime.ts` retry layers were causing Safari to fail, this page should behave differently. It does not: Safari still reaches `icegatheringstate: gathering`, the raw TURN probe still ends with `{"reason":"timeout","candidates":[]}`, and bare `room.connect()` still stalls in the same negotiation window.

**Ruled out as root cause:**

| Area | Evidence |
| --- | --- |
| Room token / JWT grant shape | Valid `video.roomJoin`, publish/subscribe grants in session summary |
| Session API response | Expected `livekitUrl`, identity, role before connect |
| Safari media permission gating | `[Safari permission warmup] {"result":"granted","kind":"audio"}` |
| Relay policy not on browser PC | `[Safari RTC create]` shows `"iceTransportPolicy":"relay"` |
| Missing TURN credentials | `iceServers` with `username`/`credential` present |
| Main app reconnect / classroom / 3D lifecycle | Minimal page reproduces the same ICE failure |

**Investigation should move off “fix RoomClient / realtime layering”** toward Safari × LiveKit Cloud TURN reachability (device, OS, browser version, LiveKit project/region, or LiveKit support).

### Caveats (not a formal proof of “nothing in our stack”)

- Still uses the same Vercel origin, Clerk auth, and API session endpoint as production.
- Still uses the same LiveKit Cloud project (`project-3dspace-wganhyh3`).
- The page instruments `RTCPeerConnection` (logging wrapper + forced relay). That is unlikely to cause zero candidates, but it is not an unmodified browser tab.

---

## Cellular Hotspot Retest (2026-05-18)

Retested the minimal repro on **cellular hotspot** (not school Wi‑Fi). Outcome: **same failure shape** — not network-specific at the LAN/firewall level.

| Step | Result |
| --- | --- |
| Permission warmup | `granted` (audio) |
| Session fetch | Valid JWT + `wss://project-3dspace-wganhyh3.livekit.cloud` |
| Relay on PC create | `"iceTransportPolicy":"relay"` on all logged PCs |
| TURN servers | UDP `turn:ip-161-115-181-241.host.livekit.cloud:3478?transport=udp` + TLS `turns:ochicago1b.turn.livekit.cloud:443` + `turns:project-3dspace-wganhyh3.turn.livekit.cloud:443` |
| Raw TURN probe | `{"sourcePcId":1,"reason":"timeout","candidates":[]}` |
| LiveKit bare connect | PCs reach `gathering`; no relay candidates before timeout |

Representative log sequence:

```
[Safari permission warmup] {"result":"granted","kind":"audio"}
[Debug bare connect start] {"livekitUrl":"wss://project-3dspace-wganhyh3.livekit.cloud","policy":"relay"}
[Safari RTC create] {"id":1,"configuration":{"iceTransportPolicy":"relay","iceServers":[...],"username":"present","credential":"present"}}
[Safari TURN probe start] {"sourcePcId":1}
[Safari TURN probe result] {"sourcePcId":1,"reason":"timeout","candidates":[]}
[Safari RTC icegatheringstate] {"id":2,"state":"gathering"}
[Safari RTC icegatheringstate] {"id":4,"state":"gathering"}
```

Hotspot retest **rules out** “school district firewall blocks TURN” as the sole explanation. Combined with the minimal repro, it strengthens the case that **Safari on this device cannot allocate any ICE candidates (including relay) against LiveKit’s current TURN endpoints**, independent of the main 3DSpace room UI.

---

## Next Test

After enforcing relay at the `RTCPeerConnection` constructor / `setConfiguration()` boundary, verify:

- `[Safari RTC create json]` now includes `"iceTransportPolicy":"relay"`;
- Safari begins producing `relay` candidates instead of only `host tcp` candidates;
- candidate pairs move beyond `waiting`;
- the participant reaches a connected state without LiveKit region fallback.

Status after minimal repro + hotspot retest (2026-05-18):

- Relay policy reaches the actual browser `RTCPeerConnection`.
- Raw relay-only TURN probe times out with **zero** candidates on school Wi‑Fi and cellular hotspot.
- Bare `room.connect()` on the debug page shows the same gathering stall.
- **Application realtime/join code is ruled out**; next work is outside the room product path.

Recommended next actions:

1. Open a LiveKit support / issue report with:
   - TURN URLs redacted only as needed,
   - Safari + iOS/macOS version,
   - minimal repro URL and attached log block (`/debug/livekit-safari/...`),
   - school Wi‑Fi vs cellular hotspot: **both failed** with `candidates: []` on raw probe.
2. Run LiveKit SDK `ConnectionCheck` / TURN check (Option A below) on the same Safari device.
3. Optional: test Safari against a non-LiveKit public TURN server in a throwaway page to see if **any** relay candidates appear on this device.
4. Decide on a product fallback for Safari:
   - no-AV classroom presence over BroadcastChannel/WebSocket/SSE, or
   - browser support restriction until TURN allocation is resolved.

---

## Remaining Options If This Fails

**Option A: Use LiveKit connection helper / TURN check**

LiveKit's SDK includes a TURN check that connects with `rtcConfig: { iceTransportPolicy: "relay" }`. Running the same check in Safari would confirm whether this is a general Safari TURN failure outside our app code.

**Option B: WebSocket-backed Safari realtime fallback**

If Safari cannot reliably establish LiveKit WebRTC, use a backend WebSocket/SSE channel for cross-device presence and room state on Safari. This would preserve classroom state sync but would not provide Safari audio/video through LiveKit.

---

## SDK Implementation Notes

- `singlePeerConnection: true` is the LiveKit SDK default.
- `singlePeerConnection: false` forces the older v0 path and creates separate publisher/subscriber PCs.
- `peerConnectionTimeout` is the client-side timeout used by `RTCEngine.waitForPCInitialConnection()`.
- LiveKit disconnect reason `14` maps to `DisconnectReason.CONNECTION_TIMEOUT`.
- SDK `makeRTCConfiguration()` only copies server ICE servers when `rtcConfig.iceServers` is falsy; setting `rtcConfig: { iceServers: [] }` intentionally prevents server ICE servers from being added.
- LiveKit's current firewall docs say the default `<subdomain>.livekit.cloud` hostname resolves to the closest cluster, and document `wss://<subdomain>.us.rtc.livekit.cloud` as the explicit US regional RTC endpoint.
- LiveKit's current connection helper docs recommend calling `room.prepareConnection()` early to avoid initial region fallback and connection stalls.
