# Safari LiveKit ICE Connection Failure - Investigation Handoff

**Status:** Active - relay-only TURN, the restored default v1 path, the disabled video primer, host-only ICE plus an enabled silent audio primer, the regional US RTC endpoint, the earlier same-day `prepareConnection()` plus `autoSubscribe: false` path, and the pre-classroom baseline all failed or were ruled out as too old. Current candidate is the narrower rollback target just before the first Safari-specific fix commit `22a1b91`: the `6a0c5ea` connection shape on `livekit-client@2.2.0`.  
**Branch:** `mvp-plus-one`  
**Primary file:** `apps/web/lib/realtime.ts`  
**LiveKit SDK:** `livekit-client@2.19.0`

---

## Symptom

Safari users see: `"LiveKit connection timed out on Safari while negotiating WebRTC."`

Chrome/Firefox users connect immediately. Safari has failed on both a school district network and a mobile hotspot, so the current failure is not network-specific.

Latest hotspot result:

- LiveKit signaling connects successfully.
- LiveKit Cloud returns three TURN URLs: one UDP TURN URL and two TCP TLS TURN URLs.
- Relay-only path: the RTCPeerConnection config shows `iceTransportPolicy: "relay"`, but both publisher and subscriber PCs stay at `iceConnectionState=new` and `iceGatheringState=gathering`; no relay candidates or `icecandidateerror` events are emitted.
- Restored default v1 path: the URL uses `/rtc/v1`, only the publisher PC exists, `iceTransportPolicy` is `all`, and Safari produces only TCP host pairs.
- Default v1 stats show local TCP host candidates on port `9`, remote LiveKit TCP host candidates on port `7881`, and candidate pairs stuck in `state=waiting`.
- LiveKit Cloud kills each attempt at about 14-15s with `DisconnectReason.CONNECTION_TIMEOUT` (`reason: 14`) regardless of the client-side 45s timeout.

---

## Current Working Hypothesis

Safari is not getting a useful ICE checklist when the app joins LiveKit before any local media exists.

The mobile hotspot logs prove that Safari can receive correctly credentialed TURN servers, can be put into relay-only mode, and still does not generate relay candidates or TURN errors before LiveKit times out. The restored default path also fails: Safari checks only TCP host pairs and leaves them waiting until LiveKit Cloud times out the participant.

This matches a known WebKit failure mode for receive-only / data-channel-first WebRTC sessions: Safari may not emit useful ICE candidates until the connection has a local media sender. LiveKit is being used for data/presence first, so users can enter the room before enabling camera or microphone.

Current candidate fix: restore the connection shape from `6a0c5ea`, which is immediately before `2f74b89` and `22a1b91`. The current theory is that Safari broke in the short window between `6a0c5ea` and the first Safari-specific repair attempt, not back at the pre-classroom baseline.

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

## Next Test

Test Safari on the same mobile hotspot.

Expected if the current candidate is correct:

- no Safari ICE debug logs, primer logs, endpoint rewrite logs, timeout-wrapper errors, or reconnect lifecycle noise from later patches;
- Safari should move from signaling into a completed room connect using the original MVP negotiation flow.

Expected if it still fails:

- record whether the failure happens before or after `signal connected`;
- record the exact on-screen error and any Safari console message from LiveKit;
- if this still fails, the next question is no longer "which client branch works", but whether a server-side or environment change broke a path that previously worked with `2.2.0`.

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
