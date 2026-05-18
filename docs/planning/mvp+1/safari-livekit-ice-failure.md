# Safari LiveKit ICE Connection Failure — Investigation Handoff

**Status:** Unresolved. Safari on WebKit cannot establish a WebRTC connection to LiveKit Cloud.  
**Branch:** `mvp-plus-one`  
**Primary file:** `apps/web/lib/realtime.ts`  
**LiveKit SDK:** `livekit-client@2.19.0` (ESM bundle at `node_modules/livekit-client/dist/livekit-client.esm.mjs`)

---

## Symptom

Safari users see: `"LiveKit connection timed out on Safari while negotiating WebRTC."`

Chrome/Firefox users connect immediately. The issue is reproducible on both macOS Safari and iOS Safari (which also runs WebKit).

---

## What We Know For Certain

### Safari's ICE candidate behavior

Safari on WebKit only generates **TCP mDNS host candidates** (port 9, active mode). It never generates:
- UDP candidates of any type
- STUN server-reflexive (`srflx`) candidates
- TURN relay candidates

The mDNS candidates use `.local` hostnames. `getStats()` returns `addr=undefined` due to mDNS obfuscation. There are typically 14 of these candidates, and gathering takes ~14 seconds (mDNS Bonjour registration delay).

### What the server provides

LiveKit Cloud sends TURN credentials in the join response with one `RTCIceServer` object that contains multiple URLs:

```json
{
  "urls": [
    "turn:ip-161-115-180-211.host.livekit.cloud:3478?transport=udp",
    "turns:ochicago1b.turn.livekit.cloud:443?transport=tcp",
    "turns:project-3dspace-wganhyh3.turn.livekit.cloud:443?transport=tcp"
  ],
  "username": "...",
  "credential": "..."
}
```

### ICE candidate pairs

The only pairs ever formed are mDNS TCP host (local, port 9) ↔ server host (remote, port 7881). These pairs stay in `state=waiting` the entire 14-second window and never transition to `in-progress`. The server sends `leave reason: 14` (JOIN_FAILURE) after ~14s.

### TURN relay candidates: never appear

Despite TURN servers being configured, zero `type=relay` candidates ever appear in `getStats()`. No `icecandidateerror` events fire either (the listener is attached — their absence is notable).

---

## Root Cause Analysis

### Problem 1 (FIXED): TURN servers absent at PC creation — the v1 signaling path

The LiveKit SDK defaults to `singlePeerConnection: true`, which activates the **v1 signaling path**:

1. `RTCPeerConnection` is created **before** the WebSocket join response arrives — so TURN servers are absent from the config at creation time (SDK line ~21583: `configure()` called with no `joinResponse`).
2. After the join response arrives, TURN servers are added via `setConfiguration()` (SDK line 21382: `pcManager.updateConfiguration(...)`).
3. **WebKit ignores `setConfiguration()` for ICE gathering purposes** — it does not trigger re-gathering for newly added ICE servers.
4. Result: Safari only has mDNS host candidates and no relay candidates.

**Fix applied (commit `d7f8033`):** Added `singlePeerConnection: false` to the Safari Room options. This forces the **v0 path** where `configure(joinResponse)` is called *after* the join response, so TURN servers are present when `new RTCPeerConnection(config)` is called.

This fix is confirmed working — `[ICE split]` log fires correctly with TURN servers present.

### Problem 2 (FIXED): Multi-URL RTCIceServer WebKit bug

LiveKit Cloud packs all TURN URLs into a single `RTCIceServer` with an array of URLs. WebKit has a bug where if the first URL in a multi-URL `RTCIceServer` fails (here, UDP TURN on port 3478 — UDP is blocked on many networks), it marks the **entire object** as failed rather than falling back to the remaining URLs (TCP TLS TURN on port 443).

**Fix applied:** `window.RTCPeerConnection` monkey-patch splits multi-URL entries into individual single-URL `RTCIceServer` objects before PC creation. This is confirmed working with `singlePeerConnection: false`.

### Problem 3 (UNRESOLVED): TURN relay candidates still never appear

Even after both fixes above are applied:
- `[ICE config]` at t+3s shows 3 correctly split individual TURN URLs ✓
- `[ICE stats local]` still shows only `type=host proto=tcp addr=undefined port=9` ✗
- No relay candidates appear ✗
- No `icecandidateerror` events fire ✗
- ICE stays `checking` / `gathering` for the entire timeout

---

## What We Don't Know

1. **Is TURN allocation being attempted at all?** The absence of both relay candidates AND `icecandidateerror` events is suspicious. Either:
   - WebKit is silently queueing TURN allocations but never starting them
   - WebKit is starting them but silently failing (no error event)
   - The 14-second mDNS registration delay is exhausting the ICE checking window before TURN can complete

2. **Is port 443 TCP reachable to the TURN servers from Safari?** If the host is behind a corporate firewall or captive portal that blocks outbound to TURN servers even on 443, the fix can't help. This hasn't been isolated.

3. **Does WebKit support ICE-TCP active for TURN (not just host candidates)?** The host candidates use TCP active (port 9). TURN TCP typically uses a different framing. Some WebKit versions have bugs here.

4. **Is the mDNS gathering delay interfering with TURN gathering?** With 14 mDNS candidates registered over ~14 seconds, the ICE agent may exhaust its budget before TURN allocation completes.

---

## All Attempts Made

| Attempt | Result |
|---|---|
| `iceServers: []` (no STUN/TURN) | No effect. Still 14 TCP host pairs in `state=waiting`. |
| `setConfiguration()` after `SignalConnected` to split multi-URL servers | Did NOT trigger re-gathering in WebKit. Zero `icecandidate` events after calling it. Removed. |
| `window.RTCPeerConnection` monkey-patch to split multi-URL at PC creation | Intercepted correctly, BUT in v1 path (default) the PC is created before TURN servers arrive, so config had no TURN to split. Appeared non-functional. |
| `singlePeerConnection: false` to force v0 signaling path | Fixed the timing issue — PC now created with TURN servers present. Split fires correctly. But relay candidates still don't appear. |
| `autoSubscribe: false` | `subPc` not created (subscriber requires remote tracks). No effect on publisher ICE. |

---

## Current Code State

**`apps/web/lib/realtime.ts`** — Safari Room options:
```typescript
new Room({
  adaptiveStream: false,
  dynacast: false,
  disconnectOnPageLeave: false,
  singlePeerConnection: false,   // ← forces v0 path so TURN present at PC creation
  publishDefaults: { simulcast: false, videoCodec: "h264" }
})
```

**`connectLiveKitRoomOnce`** — Monkey-patch active before `room.connect()`:
```typescript
// Splits multi-URL RTCIceServer → individual single-URL objects
window.RTCPeerConnection = splitIcePc as unknown as typeof RTCPeerConnection;
```

**Diagnostic logging** still active on `RoomEvent.SignalConnected`:
- `[ICE split]` — fires at PC creation, logs before/after URL counts
- `[ICE init]` — confirms both pub and sub PCs are obtained
- `[ICE t+Ns]` — polls ICE state every second
- `[ICE config]` at t+3s — logs `getConfiguration().iceServers`
- `[ICE stats *]` at t+3s — dumps local/remote candidates and pairs from `getStats()`
- `[ICE pub/sub candidate]` / `[ICE pub/sub error]` — event listeners for candidates and errors

---

## Hypotheses for Next Investigator

### Hypothesis A: WebKit doesn't try TURN when mDNS pairs are available

ICE prioritizes lower-latency candidates. Host candidates (mDNS TCP) get checked first. If WebKit's ICE implementation doesn't parallelize host-checking and TURN allocation, it may never reach TURN within the server's 15s window. 

**Test:** Force `iceTransportPolicy: 'relay'` in the Safari Room options. This makes the ICE agent skip host and srflx candidates and only use relay. If TURN allocation succeeds, ICE will connect. If it still hangs (or produces an `icecandidateerror`), TURN itself is the problem.

```typescript
// Add to connectLiveKitRoomOnce before room.connect():
// room.engine?.rtcConfig might need to be set, or pass via room options
```

Actually the cleanest way may be to extend the monkey-patch to also force `iceTransportPolicy: 'relay'` in the config:
```typescript
config = { ...config, iceTransportPolicy: 'relay' };
```
This would confirm whether TURN is reachable.

### Hypothesis B: TURN servers are unreachable on port 443

If the test device is behind a firewall or corporate proxy that blocks outbound TCP to LiveKit's TURN servers on port 443, nothing will work. 

**Test:** From Safari, try fetching `https://ochicago1b.turn.livekit.cloud/` (should return a 404 or error, but if it times out, the host is unreachable). Or use the Network tab to check if the TURN TLS connection is even attempted.

### Hypothesis C: `icecandidateerror` events are being swallowed

The listener is attached but no errors fire. In some WebKit versions, `RTCIceCandidateErrorEvent` is not dispatched for TURN failures — the failure is silent.

**Test:** Add enhanced logging to catch ALL candidate events, and also poll `getStats()` at t+1s, t+5s, t+10s for relay-type candidates. If none ever appear across the whole gathering window, TURN is definitely not working.

### Hypothesis D: mDNS gathering delay blocks TURN checking window

ICE pairs from mDNS candidates can't be checked until the mDNS address is registered (Bonjour delay, ~14s). The 14 mDNS candidates are registered one by one. During this time, ICE is `checking` but pairs stay `waiting`. The server times out at 15s.

The mDNS host candidates form pairs with the server's host candidates (port 7881). These pairs are prioritized but can't be checked because the mDNS `.local` resolution takes time. TURN relay pairs would be lower-priority and might not even be tried before the server gives up.

**Possible fix:** Suppress mDNS host candidates entirely on Safari so ICE skips straight to TURN. There's no standard API for this, but you could filter them out of the `icecandidate` event (intercept `pc.onicecandidate`) and not forward mDNS candidates to the LiveKit signal client. Without mDNS pairs to check, ICE would fall back to relay pairs sooner.

### Hypothesis E: LiveKit server requires ICE-TCP from client side

The server provides host candidates on port 7881 (TCP passive). The client's mDNS candidates are TCP active (port 9). The ICE-TCP pair should work: client active (port 9) → server passive (port 7881). But maybe there's a framing issue on WebKit's side.

If ICE-TCP itself is failing (not TURN), switching to `iceTransportPolicy: 'relay'` would bypass this entirely.

---

## Suggested Next Steps (Priority Order)

1. **Collect `icecandidateerror` detail** — Add `console.warn("[ICE error]", e.errorCode, e.errorText, e.url, e.hostCandidate)` to the error listener. Error code 701 = TURN server unreachable; 400 = bad request; 401 = auth failure. This immediately tells you if TURN is being tried and why it fails.

2. **Test with `iceTransportPolicy: 'relay'`** — Add to `splitIcePc`:
   ```typescript
   config = { ...config, iceTransportPolicy: 'relay' };
   ```
   If ICE connects, TURN works and the problem is ICE prioritization (Hypothesis D). If TURN errors appear in console, that's Hypothesis B.

3. **Poll `getStats()` across the full gathering window** — The current diagnostic only dumps at t+3s. Dump at t+1s, t+5s, t+10s, t+14s. Look for `type=relay` candidates appearing late.

4. **Try filtering out mDNS candidates** — Intercept `pc.onicecandidate` after the monkey-patch creates the PC and suppress candidates where `candidate.type === 'host'` and `candidate.address?.endsWith('.local')`. This forces the server to only form relay pairs.

5. **Consider using LiveKit's own TURN REST API** — LiveKit exposes a REST endpoint to pre-fetch TURN credentials. Pre-fetch them before `room.connect()` using the token, then set them as `iceServers` in the Room options. This would let us test arbitrary TURN configs including the split + relay-force without depending on the join response flow.

6. **Consider a self-hosted TURN server** — If LiveKit Cloud's TURN is unreachable on the test network, deploying a self-hosted `coturn` on a standard port (443) and pointing Safari at it would isolate whether it's LiveKit's TURN infrastructure or WebKit's TURN implementation.

---

## SDK Implementation Notes (for understanding the code)

- **`singlePeerConnection: true` (default)** → v1 path: PC created before join response → `configure()` with no args → `makeRTCConfiguration()` with no serverResponse → no TURN → TURN added via `setConfiguration()` later (WebKit ignores)
- **`singlePeerConnection: false`** → v0 path: PC created after join response → `configure(joinResponse)` → `makeRTCConfiguration(joinResponse)` → TURN present at PC creation
- SDK line 18052: `new RTCPeerConnection(this.config)` — bare global reference
- SDK line 21772: `if (serverResponse.iceServers && !rtcConfig.iceServers)` — server ICE servers only added if `rtcConfig.iceServers` is falsy
- The `window.RTCPeerConnection` monkey-patch IS intercepting correctly (confirmed by `[ICE split]` log firing)
- `setConfiguration()` after PC creation does NOT trigger ICE re-gathering in WebKit (confirmed empirically)
