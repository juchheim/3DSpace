# Safari LiveKit ICE Connection Failure — Investigation Handoff

**Status:** Unresolved. Safari on WebKit cannot establish a WebRTC connection to LiveKit Cloud.  
**Branch:** `mvp-plus-one`  
**Primary file:** `apps/web/lib/realtime.ts`  
**LiveKit SDK:** `livekit-client@2.19.0` (ESM bundle at `node_modules/livekit-client/dist/livekit-client.esm.mjs`)

---

## Symptom

Safari users see: `"LiveKit connection timed out on Safari while negotiating WebRTC."`

Chrome/Firefox users connect immediately. The issue is reproducible on both macOS Safari and iOS Safari (which also runs WebKit). Testing was done on a **school district network**.

---

## Why Chrome Works But Safari Doesn't (on School Networks)

Chrome generates **UDP candidates**. It uses STUN to discover its public IP (server-reflexive candidates), then connects to the LiveKit server's UDP endpoint directly — no TURN relay needed. School firewalls typically allow outbound UDP for this.

Safari generates **only TCP mDNS host candidates**. It cannot do UDP at all. Its only options are:

1. **Direct TCP to the LiveKit server on port 7881** — school firewalls typically block non-standard ports outbound
2. **TURN relay over TCP-TLS on port 443** — port 443 is usually open, but the TURN server must be reachable

Chrome's success on the school network tells us nothing about TURN reachability — Chrome simply doesn't need TURN.

### On the HTTP test for TURN

`https://ochicago1b.turn.livekit.cloud/` failing to load in both Chrome and Safari **does not mean TURN is blocked**. TURN servers speak the TURN protocol over TLS, not HTTP. A browser opening that URL as HTTPS will always "fail to load" because the server has no HTTP handler — it only accepts TURN allocations. This is expected even when TURN works correctly. The test is inconclusive.

---

## Is This Just the School Network, Or Will It Fail Everywhere?

**Unknown — this is the most important thing to determine next.**

The current failure has two plausible causes:

**A) School network blocks TURN outbound** — Port 443 TCP to LiveKit's TURN servers is reachable on most home networks but may be blocked by the school's firewall or deep-packet-inspection proxy (which can block non-HTTP traffic on port 443). If so, the code fixes described below are correct, but the school needs to allowlist LiveKit's TURN IPs, or we need a self-hosted TURN server.

**B) WebKit bug with TCP TURN** — Safari may not be correctly implementing TURN-over-TCP-TLS gathering, independent of the network. If so, it would fail even on a home network where TURN is reachable.

**To distinguish:** Test Safari on a **mobile hotspot** (no school network). If Safari connects on the hotspot but not on the school network, it's a network problem (Case A). If it still fails, it's a WebKit bug (Case B).

---

## What We Know For Certain

### Safari's ICE candidate behavior

Safari on WebKit only generates **TCP mDNS host candidates** (port 9, active mode). It never generates:
- UDP candidates of any type
- STUN server-reflexive (`srflx`) candidates
- TURN relay candidates (at least on the school network tested)

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

Despite TURN servers being correctly configured, zero `type=relay` candidates ever appear in `getStats()`. No `icecandidateerror` events fire either (the listener is attached — their absence is notable).

---

## Root Cause Analysis

### Problem 1 (FIXED): TURN servers absent at PC creation — the v1 signaling path

The LiveKit SDK defaults to `singlePeerConnection: true`, which activates the **v1 signaling path**:

1. `RTCPeerConnection` is created **before** the WebSocket join response arrives — so TURN servers are absent from the config at creation time (SDK line ~21583: `configure()` called with no `joinResponse`).
2. After the join response arrives, TURN servers are added via `setConfiguration()` (SDK line 21382: `pcManager.updateConfiguration(...)`).
3. **WebKit ignores `setConfiguration()` for ICE gathering purposes** — it does not trigger re-gathering for newly added ICE servers.
4. Result: Safari only has mDNS host candidates and no relay candidates.

**Fix applied (commit `d7f8033`):** Added `singlePeerConnection: false` to the Safari Room options. This forces the **v0 path** where `configure(joinResponse)` is called *after* the join response, so TURN servers are present when `new RTCPeerConnection(config)` is called.

### Problem 2 (FIXED): Multi-URL RTCIceServer WebKit bug

LiveKit Cloud packs all TURN URLs into a single `RTCIceServer` with an array of URLs. WebKit has a bug where if the first URL in a multi-URL `RTCIceServer` fails (here, UDP TURN on port 3478 — UDP is blocked on most school networks), it marks the **entire object** as failed rather than falling back to the remaining URLs (TCP TLS TURN on port 443).

**Fix applied:** `window.RTCPeerConnection` monkey-patch splits multi-URL entries into individual single-URL `RTCIceServer` objects before PC creation. Confirmed working — `[ICE split] 1 → 3` fires and `[ICE config]` shows the 3 split entries.

### Problem 3 (UNRESOLVED): TURN relay candidates still never appear

Even after both fixes above are applied:
- `[ICE config]` at t+3s shows 3 correctly split individual TURN URLs ✓
- `[ICE stats local]` still shows only `type=host proto=tcp addr=undefined port=9` ✗
- No relay candidates appear ✗
- No `icecandidateerror` events fire ✗
- ICE stays `checking` / `gathering` for the entire timeout

This is consistent with the school network blocking TURN outbound (Case A above), or a WebKit bug (Case B).

---

## All Attempts Made

| Attempt | Result |
|---|---|
| `iceServers: []` (no STUN/TURN) | No effect. Still 14 TCP host pairs in `state=waiting`. |
| `setConfiguration()` after `SignalConnected` to split multi-URL servers | Did NOT trigger re-gathering in WebKit. Zero new `icecandidate` events after calling it. Removed. |
| `window.RTCPeerConnection` monkey-patch to split multi-URL at PC creation | Patch itself worked, BUT in v1 path (the default) the PC is created before TURN servers arrive. No TURN to split at creation time. Appeared non-functional for a different reason. |
| `singlePeerConnection: false` to force v0 signaling path | Fixed the timing — PC now created with TURN servers present. Split fires correctly. Relay candidates still don't appear (network block or WebKit bug). |
| `autoSubscribe: false` | No effect. `subPc` not created without remote tracks. |
| Opening `https://ochicago1b.turn.livekit.cloud/` in browser | Inconclusive — TURN servers don't serve HTTP. "Failed to load" is expected even when TURN works. |

---

## Current Code State

**`apps/web/lib/realtime.ts`** — Safari Room options:
```typescript
new Room({
  adaptiveStream: false,
  dynacast: false,
  disconnectOnPageLeave: false,
  singlePeerConnection: false,   // forces v0 path so TURN servers present at PC creation
  publishDefaults: { simulcast: false, videoCodec: "h264" }
})
```

**`connectLiveKitRoomOnce`** — monkey-patch active before `room.connect()`:
```typescript
// Splits multi-URL RTCIceServer → individual single-URL objects
window.RTCPeerConnection = splitIcePc as unknown as typeof RTCPeerConnection;
```

**Diagnostic logging** still active on `RoomEvent.SignalConnected`:
- `[ICE split]` — fires at PC creation, logs before/after URL counts
- `[ICE init]` — confirms both pub and sub PCs obtained
- `[ICE t+Ns]` — polls ICE state every second
- `[ICE config]` at t+3s — logs `getConfiguration().iceServers`
- `[ICE stats *]` at t+3s — dumps local/remote candidates and pairs from `getStats()`
- `[ICE pub/sub candidate]` / `[ICE pub/sub error]` — event listeners for candidates and errors

---

## Next Steps

### Step 1 (Required): Test Safari on a mobile hotspot

This single test determines the entire direction:

- **Safari connects on hotspot** → school network is blocking TURN. The code fixes are correct. Solution is network-level (LiveKit Cloud config or self-hosted TURN) — see Step 3.
- **Safari still fails on hotspot** → WebKit bug unrelated to network. Solution is code-level — see Step 2.

### Step 2 (If hotspot also fails): Diagnose WebKit TURN behavior

Add `iceTransportPolicy: 'relay'` inside the monkey-patch to force Safari to only use TURN candidates:

```typescript
// In splitIcePc, after splitting iceServers:
config = { ...config, iceTransportPolicy: 'relay' };
```

This eliminates the mDNS host candidates entirely and forces ICE to only attempt TURN. If it connects → mDNS candidates were crowding out TURN (timing issue). If `icecandidateerror` events appear → collect `e.errorCode` (701 = unreachable, 401 = auth failure). If it still silently hangs → deep WebKit bug with TCP TURN gathering.

Also enhance the `icecandidateerror` listener (currently fires but produces no output because `e` isn't serialized):
```typescript
pc.addEventListener("icecandidateerror", (e) =>
  console.warn(`[ICE ${label} error]`, (e as RTCPeerConnectionIceErrorEvent).errorCode,
    (e as RTCPeerConnectionIceErrorEvent).errorText,
    (e as RTCPeerConnectionIceErrorEvent).url)
);
```

### Step 3 (If school network is blocking TURN): LiveKit Cloud configuration

LiveKit Cloud allows you to configure **custom TURN servers**. The school district's firewall may block `*.turn.livekit.cloud` on port 443 but allow connections to a known IP. Options:

**Option A: Allowlist LiveKit's TURN IPs at the district firewall.**  
LiveKit Cloud's TURN servers are at known IPs (the `ip-X-X-X-X.host.livekit.cloud` hostnames are the IPs encoded in the name). Work with the district IT department to allowlist those outbound on port 443.

**Option B: Self-host a TURN server on a fixed IP and configure LiveKit to advertise it.**  
Deploy `coturn` on a VPS at an IP the district allows, listening on port 443. In LiveKit Cloud's project settings, you can add custom TURN servers. This gives full control over the TURN endpoint. This is the most reliable long-term solution for school networks.

**Option C: Use a TCP WebSocket tunnel as a fallback.**  
Some WebRTC frameworks support wrapping ICE traffic in a WebSocket connection (which always traverses school firewalls since it's HTTP-upgraded). LiveKit doesn't natively support this, but it's worth checking if a newer SDK version adds it.

---

## SDK Implementation Notes

- **`singlePeerConnection: true` (default)** → v1 path: PC created before join response → no TURN at creation → TURN added via `setConfiguration()` later → WebKit ignores for ICE
- **`singlePeerConnection: false`** → v0 path: PC created after join response → TURN present at creation
- SDK line 18052: `new RTCPeerConnection(this.config)` — bare global, intercepted by `window.RTCPeerConnection` monkey-patch
- SDK line 21772: `if (serverResponse.iceServers && !rtcConfig.iceServers)` — server ICE only added if `rtcConfig.iceServers` is falsy (don't pre-set iceServers in Room options or server TURN won't be used)
- `setConfiguration()` after PC creation does NOT trigger ICE re-gathering in WebKit (confirmed empirically)
- The `window.RTCPeerConnection` monkey-patch IS intercepting correctly (confirmed by `[ICE split]` log)
