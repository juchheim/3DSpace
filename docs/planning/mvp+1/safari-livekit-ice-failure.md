# Safari LiveKit ICE Connection Failure - Investigation Handoff

**Status:** Active - relay-only TURN failed on a mobile hotspot. Current candidate restores the earlier default LiveKit Safari path with a longer 45s negotiation window.  
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
- The RTCPeerConnection config shows `iceTransportPolicy: "relay"`.
- Both publisher and subscriber PCs stay at `iceConnectionState=new` and `iceGatheringState=gathering`.
- No `icecandidate` relay candidates are emitted.
- No `icecandidateerror` events are emitted.
- LiveKit eventually disconnects with `DisconnectReason.CONNECTION_TIMEOUT` (`reason: 14`).

---

## Current Working Hypothesis

The TURN-forcing path is the wrong path for this Safari failure.

The latest mobile hotspot log proves that Safari can receive correctly credentialed TURN servers, can be put into relay-only mode, and still does not generate relay candidates or TURN errors before LiveKit times out. That makes more TURN URL reshaping unlikely to fix the connection.

The important regression signal is local history: Safari was working earlier with the default LiveKit single-peer-connection path and a much longer Safari negotiation window. The current deployed path changed both:

- forced `singlePeerConnection: false`, moving Safari from LiveKit's default v1 path to the v0 dual-PC path;
- monkey-patched `window.RTCPeerConnection` to split TURN URLs;
- forced `iceTransportPolicy: "relay"`;
- reduced Safari's connection wait to 20s.

Current candidate fix: undo the v0/relay/TURN monkey-patch path and restore Safari to the default LiveKit connection flow with a 45s peer connection timeout.

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
- `peerConnectionTimeout` should allow Safari substantially longer than the previous ~20s path;
- connection should complete before the app timeout;
- diagnostic logs should show whether Safari eventually produces usable candidates after its slow gathering phase.

Expected if it still fails:

- record the final `[ICE config]`, `[ICE stats local]`, `[ICE stats pair]`, and timeout timestamp;
- check whether the LiveKit disconnect still reports `reason: 14`;
- compare the total time from `SignalConnected` to failure to confirm whether the 45s timeout is taking effect.

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
