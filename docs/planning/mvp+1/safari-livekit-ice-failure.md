# Safari LiveKit ICE Connection Failure — Investigation Handoff

**Status:** Active — `iceTransportPolicy: 'relay'` experiment just deployed (commit pending), awaiting test result.  
**Branch:** `mvp-plus-one`  
**Primary file:** `apps/web/lib/realtime.ts`  
**LiveKit SDK:** `livekit-client@2.19.0` (ESM bundle at `node_modules/livekit-client/dist/livekit-client.esm.mjs`)

---

## Symptom

Safari users see: `"LiveKit connection timed out on Safari while negotiating WebRTC."`

Chrome/Firefox users connect immediately. Reproducible on both macOS Safari and iOS Safari (WebKit). Tested on a school district network **and** a mobile hotspot — fails on both. This is confirmed NOT a network-specific issue.

---

## Why Chrome Works But Safari Doesn't

Chrome generates **UDP candidates**. It uses STUN to discover its public IP (server-reflexive candidates), then connects to the LiveKit server's UDP endpoint directly — no TURN relay needed.

Safari generates **only TCP mDNS host candidates**. It cannot do UDP at all. Its only hope for connecting to a server on the public internet is **TURN relay over TCP-TLS on port 443**.

---

## Root Cause: WebKit Does Not Generate TURN Relay Candidates

**Confirmed on mobile hotspot (unrestricted network):** With correctly split, properly credentialed TURN servers in the RTCPeerConnection config, Safari produces:
- Zero relay candidates in `getStats()`
- Zero `icecandidateerror` events
- Only mDNS TCP host candidates (port 9)
- ICE stays `checking` / `gathering` for the entire 15-second server timeout

If TURN allocation was being attempted and failing, `icecandidateerror` events with error codes would fire. Getting neither relay candidates nor errors means **WebKit is not initiating TURN allocation at all**.

### Why: mDNS gathering serializes TURN

WebKit registers mDNS hostnames (`.local` addresses) for each local network interface via Bonjour before the corresponding `icecandidate` event fires. With 14 network interfaces, this takes ~14 seconds — consuming the entire ICE window. The LiveKit server times out at ~15 seconds.

TURN allocation appears to be **serialized after mDNS gathering** in WebKit's ICE implementation, not run in parallel as the ICE RFC requires. By the time mDNS registration completes, the server has already given up.

---

## Fix History

### Fix 1 (APPLIED, commit `d7f8033`): Force v0 signaling path

The SDK's default `singlePeerConnection: true` (v1 path) creates `RTCPeerConnection` before the join response arrives, so TURN servers aren't in the config at creation time. They're added later via `setConfiguration()`, which WebKit ignores for ICE re-gathering.

**Fix:** `singlePeerConnection: false` in Safari Room options forces the v0 path, where the PC is created after the join response with TURN servers present.

### Fix 2 (APPLIED, commit `d7f8033`): Split multi-URL RTCIceServer

LiveKit Cloud sends all TURN URLs in one `RTCIceServer` object. WebKit fails the entire object when the first URL (UDP TURN port 3478) fails, without trying the TCP TLS entries.

**Fix:** `window.RTCPeerConnection` monkey-patch in `splitIcePc` splits multi-URL objects into one per URL before PC creation. Confirmed working — `[ICE split] 1 → 3` log fires and `[ICE config]` shows 3 individual entries.

### Fix 3 (DEPLOYED, awaiting test): Force `iceTransportPolicy: 'relay'`

The mDNS gathering occupies the entire ICE window and TURN never starts. Forcing relay-only makes the ICE agent **skip mDNS host candidates entirely** and only gather TURN relay candidates. This eliminates the 14-second delay.

**Change:** Added `iceTransportPolicy: "relay"` inside `splitIcePc` alongside the URL split. This is set on the config object at PC creation time, so it applies from the start of ICE gathering.

**Expected outcome if this works:** Safari immediately attempts TURN allocation, gets relay candidates within 1-2 seconds, ICE connects.

**Expected outcome if this fails:** `icecandidateerror` events fire with error codes, or gathering silently hangs again. Either way, we get new information.

---

## All Attempts Made

| Attempt | Result |
|---|---|
| `iceServers: []` (no STUN/TURN) | No effect. 14 TCP host pairs in `state=waiting`. |
| `setConfiguration()` after `SignalConnected` to split multi-URL servers | Did NOT trigger re-gathering in WebKit. Zero new `icecandidate` events. Removed. |
| `window.RTCPeerConnection` monkey-patch to split multi-URL | Patch works, BUT in v1 path (default) PC created before TURN servers arrive — nothing to split. |
| `singlePeerConnection: false` to force v0 signaling path | Fixed timing — PC now created with TURN present. Split fires. Still no relay candidates (mDNS serialization). |
| Mobile hotspot test | **Fails identically.** Confirmed not a network issue. WebKit bug. |
| `iceTransportPolicy: 'relay'` inside monkey-patch | **Deployed, not yet tested.** Should bypass mDNS delay entirely. |

---

## Current Code State

**`apps/web/lib/realtime.ts`** — Safari Room options:
```typescript
new Room({
  adaptiveStream: false,
  dynacast: false,
  disconnectOnPageLeave: false,
  singlePeerConnection: false,   // forces v0 path: PC created with TURN servers present
  publishDefaults: { simulcast: false, videoCodec: "h264" }
})
```

**`connectLiveKitRoomOnce`** — `splitIcePc` monkey-patch (set before `room.connect()`):
```typescript
function splitIcePc(config?: RTCConfiguration): RTCPeerConnection {
  if (config?.iceServers) {
    config = {
      ...config,
      iceServers: config.iceServers.flatMap(/* split multi-URL into single-URL objects */),
      iceTransportPolicy: "relay"  // skip mDNS, go straight to TURN
    };
  }
  return new OriginalPC(config!);
}
window.RTCPeerConnection = splitIcePc as unknown as typeof RTCPeerConnection;
```

**Diagnostic logging** active on `RoomEvent.SignalConnected`:
- `[ICE split]` — fires at PC creation, logs URL counts before/after split
- `[ICE init]`, `[ICE t+Ns]` — connection state polling every second
- `[ICE config]` at t+3s — `getConfiguration().iceServers` (should show `policy=relay` now)
- `[ICE stats *]` at t+3s — local/remote candidates and pairs
- `[ICE pub/sub candidate]` / `[ICE pub/sub error]` — candidate and error event listeners

---

## If `iceTransportPolicy: 'relay'` Works (connects)

The fix is validated. TURN relay works in Safari when mDNS candidates are bypassed. The `relay` policy is safe to keep for Safari — it means all media goes through TURN (slightly higher latency vs direct P2P), but LiveKit is a server-side SFU so there's no peer-to-peer path anyway. TURN is the intended path.

Next: remove the diagnostic logging block from `realtime.ts` (the entire `if (safari)` block inside the `SignalConnected` handler). The production code should be clean.

## If `iceTransportPolicy: 'relay'` Also Fails

WebKit's TCP TURN implementation itself is broken. Options:

**Option A: WebKit-specific TURN implementation bug**
Check if `icecandidateerror` events now fire (they should if relay-only and TURN fails). Collect `e.errorCode`, `e.errorText`, `e.url`. Error codes: 701 = server unreachable, 401 = auth failure, 400 = bad request.

Also check if the `icecandidateerror` listener is actually being reached — add a `console.warn` at the very top of the handler before checking event properties.

**Option B: Try UDP TURN only**
Remove the `turns:` (TCP TLS) entries from the split list and only keep `turn:...:3478?transport=udp`. If Safari can do UDP TURN (even though it doesn't generate UDP host candidates, TURN allocation itself uses UDP to the TURN server), this might work.

**Option C: Use LiveKit's WebRTC over WebSocket fallback**
LiveKit has experimental support for running WebRTC over a plain WebSocket connection, which always works through firewalls and doesn't need ICE/TURN at all. This would require LiveKit server-side configuration changes and is not yet GA.

**Option D: Replace LiveKit with a WebSocket-only solution for Safari**
The app already has a `BroadcastChannel` fallback for same-device multi-tab scenarios. For cross-device Safari connections, a pure WebSocket data channel (with no WebRTC at all) would work universally. This sacrifices video/audio media relay through LiveKit for Safari users, but data messages (presence, wall state, etc.) would work. Audio/video would need a separate non-WebRTC approach.

---

## SDK Implementation Notes

- **`singlePeerConnection: true` (default)** → v1 path: PC created before join → no TURN at creation → `setConfiguration()` later → WebKit ignores for ICE
- **`singlePeerConnection: false`** → v0 path: PC created after join → TURN present at creation
- SDK line 18052: `new RTCPeerConnection(this.config)` — bare global, intercepted by `window.RTCPeerConnection` monkey-patch
- SDK line 21772: `if (serverResponse.iceServers && !rtcConfig.iceServers)` — server ICE only added if `rtcConfig.iceServers` is falsy; don't pre-set iceServers in Room options
- `setConfiguration()` after PC creation does NOT trigger ICE re-gathering in WebKit (confirmed empirically)
- The `window.RTCPeerConnection` monkey-patch IS intercepting correctly (confirmed by `[ICE split]` log)
