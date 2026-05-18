# Safari LiveKit ICE Connection Failure - Investigation Handoff

**Status:** Active - relay-only TURN, the restored default v1 path, and the disabled video primer all failed on a mobile hotspot. Current candidate uses host-only ICE plus an enabled silent audio primer during connect.  
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

Current candidate fix: remove the server ICE bundle for Safari (`rtcConfig.iceServers = []`) and publish an enabled silent audio track during the initial join. This keeps Safari on the direct ICE-TCP path while giving WebKit a live sender without camera/mic permission.

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

### Current Candidate: Host-Only ICE + Enabled Silent Audio Primer

Change in `apps/web/lib/realtime.ts`:

- Safari `room.connect()` now uses `rtcConfig: { iceServers: [] }`, which prevents LiveKit's TURN/STUN list from being injected;
- before `room.connect()` on Safari, create `getEmptyAudioStreamTrack()`;
- set `track.enabled = true`;
- publish it with name `__3dspace_safari_ice_primer`, source `unknown`, stream `__3dspace_safari_ice_primer`, `dtx: false`, `red: false`;
- keep filtering this publication out of remote media handlers;
- unpublish it after connect or stop it on failure.

This is still synthetic media, not a user device track. The empty audio track comes from LiveKit's own oscillator helper and should not prompt for microphone access.

---

## Current Code State

Safari Room options:

```typescript
new Room({
  adaptiveStream: false,
  dynacast: false,
  disconnectOnPageLeave: false,
  publishDefaults: { simulcast: false, videoCodec: "h264" }
})
```

Safari connect options:

```typescript
room.connect(livekitUrl, token, {
  peerConnectionTimeout: 45_000,
  websocketTimeout: 45_000
});
```

Safari host-only connect override:

```typescript
room.connect(livekitUrl, token, {
  peerConnectionTimeout: 45_000,
  websocketTimeout: 45_000,
  rtcConfig: { iceServers: [] }
});
```

Safari audio primer:

```typescript
const track = getEmptyAudioStreamTrack();
track.enabled = true;
void room.localParticipant.publishTrack(track, {
  name: "__3dspace_safari_ice_primer",
  source: Track.Source.Unknown,
  stream: "__3dspace_safari_ice_primer",
  dtx: false,
  red: false
});
```

The temporary Safari diagnostic logging remains active on `RoomEvent.SignalConnected`:

- `[ICE init]`
- `[ICE t+Ns]`
- `[ICE config]`
- `[ICE stats *]`
- `[ICE pub/sub candidate]`
- `[ICE pub/sub error]`

If this candidate connects, remove the diagnostic block before calling the issue closed.

---

## Next Test

Test Safari on the same mobile hotspot.

Expected if the current candidate is correct:

- no `[ICE split]` logs, because the monkey-patch is gone;
- the Safari audio primer publish should happen after signal connects;
- `[ICE config]` should show no TURN/STUN servers if the host-only override is taking effect;
- candidate gathering should finish faster than the TURN/STUN case;
- connection should complete before the app timeout;
- diagnostic logs should show whether Safari eventually produces usable candidates after its slow gathering phase.

Expected if it still fails:

- record the final `[ICE config]`, `[ICE stats local]`, `[ICE stats pair]`, and timeout timestamp;
- check whether the LiveKit disconnect still reports `reason: 14`;
- check whether the console logs `Safari ICE primer publish failed`.

---

## Remaining Options If This Fails

**Option A: Try host-only ICE with the 45s window**

Set `rtcConfig: { iceServers: [] }` for Safari, still with the 45s timeout. This tests whether the previously observed TCP host candidate path can connect without waiting on STUN/TURN.

**Option B: Use LiveKit connection helper / TURN check**

LiveKit's SDK includes a TURN check that connects with `rtcConfig: { iceTransportPolicy: "relay" }`. Running the same check in Safari would confirm whether this is a general Safari TURN failure outside our app code.

**Option C: WebSocket-backed Safari realtime fallback**

If Safari cannot reliably establish LiveKit WebRTC, use a backend WebSocket/SSE channel for cross-device presence and room state on Safari. This would preserve classroom state sync but would not provide Safari audio/video through LiveKit.

---

## SDK Implementation Notes

- `singlePeerConnection: true` is the LiveKit SDK default.
- `singlePeerConnection: false` forces the older v0 path and creates separate publisher/subscriber PCs.
- `peerConnectionTimeout` is the client-side timeout used by `RTCEngine.waitForPCInitialConnection()`.
- LiveKit disconnect reason `14` maps to `DisconnectReason.CONNECTION_TIMEOUT`.
- SDK `makeRTCConfiguration()` only copies server ICE servers when `rtcConfig.iceServers` is falsy; setting `rtcConfig: { iceServers: [] }` intentionally prevents server ICE servers from being added.
