# Animation System

All animation runs inside a single `useFrame` callback on the `BlockyAvatar` component using React Three Fiber. There is no separate animation mixer or keyframe system — everything is procedural math driven by `state.clock.getElapsedTime()`.

## Refs required

```typescript
const leftArmPivotRef  = useRef<THREE.Group>(null);
const rightArmPivotRef = useRef<THREE.Group>(null);
const leftLegPivotRef  = useRef<THREE.Group>(null);
const rightLegPivotRef = useRef<THREE.Group>(null);
const bodyGroupRef     = useRef<THREE.Group>(null);
const headGroupRef     = useRef<THREE.Group>(null);
```

## Persistent animation state (useRef, not useState — no re-renders)

```typescript
const walkBlendRef   = useRef(0);        // 0=idle, 1=walking — interpolated
const wavePhaseRef   = useRef(0);        // 0..1 progress through wave emote
const waveActiveRef  = useRef(false);    // true while wave is playing
```

## Priority system

When multiple animations want to control the same limb, they resolve by priority (highest wins):

```
Priority 1 (highest): Wave emote (right arm)
Priority 2:           Raise hand (right arm)
Priority 3:           Walk cycle (all limbs)
Priority 4 (lowest):  Idle — limbs at rest, body bobs
```

The walk cycle is always computed but blended by `walkBlendRef`. Raise hand and wave override the right arm pivot's computed walk value.

## useFrame implementation

```typescript
useFrame((state, delta) => {
  const t = state.clock.getElapsedTime();
  const la = leftArmPivotRef.current;
  const ra = rightArmPivotRef.current;
  const ll = leftLegPivotRef.current;
  const rl = rightLegPivotRef.current;
  const body = bodyGroupRef.current;
  const head = headGroupRef.current;
  if (!la || !ra || !ll || !rl) return;

  // ── Walk blend ────────────────────────────────────────────────────────────
  const targetBlend = movement === "walking" ? 1 : 0;
  walkBlendRef.current = THREE.MathUtils.lerp(walkBlendRef.current, targetBlend, delta * 8);
  const blend = walkBlendRef.current;

  // ── Walk cycle ────────────────────────────────────────────────────────────
  const WALK_FREQ = 2.5;                           // cycles per second
  const WALK_AMP  = Math.PI / 6;                   // 30° max swing
  const walkPhase = t * WALK_FREQ * Math.PI * 2;
  const rawSwing  = Math.sin(walkPhase) * WALK_AMP;
  const swing     = rawSwing * blend;

  // Left arm and right leg swing together (forward)
  // Right arm and left leg swing opposite
  const leftArmWalk  =  swing;
  const rightArmWalk = -swing;
  const leftLegWalk  = -swing;
  const rightLegWalk =  swing;

  // ── Idle bob ──────────────────────────────────────────────────────────────
  const BOB_AMP  = 0.004;   // meters
  const BOB_FREQ = 0.8;     // cycles per second
  if (body) {
    body.position.y = Math.sin(t * BOB_FREQ * Math.PI * 2) * BOB_AMP * (1 - blend);
  }

  // ── Speaking bob ──────────────────────────────────────────────────────────
  const isSpeaking = media?.speaking ?? false;
  if (head) {
    const SPEAK_AMP  = 0.008;
    const SPEAK_FREQ = 4;
    head.position.y = isSpeaking
      ? Math.sin(t * SPEAK_FREQ * Math.PI * 2) * SPEAK_AMP
      : 0;
  }

  // ── Raise hand ────────────────────────────────────────────────────────────
  // Right arm rotates forward and up. At rotation.x = +π the arm points straight up.
  // Target ≈ 0.8π (arm raised at ~144° from hanging, slightly past horizontal).
  const RAISE_TARGET = Math.PI * 0.80;

  // ── Wave emote ────────────────────────────────────────────────────────────
  // One-shot: plays for WAVE_DURATION seconds then auto-completes.
  const WAVE_DURATION = 2.0;   // seconds
  const WAVE_FREQ     = 3.5;   // oscillations per second
  const WAVE_AMP      = Math.PI / 5;
  const WAVE_BASE     = -Math.PI / 2;  // arm held out to side (up = negative X rot)

  if (waveTriggered && !waveActiveRef.current) {
    waveActiveRef.current = true;
    wavePhaseRef.current  = 0;
  }

  if (waveActiveRef.current) {
    wavePhaseRef.current += delta / WAVE_DURATION;
    if (wavePhaseRef.current >= 1) {
      wavePhaseRef.current = 0;
      waveActiveRef.current = false;
      onWaveComplete();
    }
  }

  const waveProgress = wavePhaseRef.current;  // 0..1

  // ── Apply rotations (priority order) ─────────────────────────────────────

  // Left arm — only walk affects it
  la.rotation.x = leftArmWalk;
  la.rotation.z = 0;

  // Left leg — only walk affects it
  ll.rotation.x = leftLegWalk;

  // Right leg — only walk affects it
  rl.rotation.x = rightLegWalk;

  // Right arm — wave > raise hand > walk
  if (waveActiveRef.current) {
    // Smoothly enter wave position, oscillate, then smoothly exit
    const envelope = Math.sin(waveProgress * Math.PI);        // 0→1→0 fade
    const oscillation = Math.sin(waveProgress * WAVE_DURATION * WAVE_FREQ * Math.PI * 2) * WAVE_AMP;
    ra.rotation.x = THREE.MathUtils.lerp(ra.rotation.x, WAVE_BASE + oscillation * envelope, delta * 8);
    ra.rotation.z = THREE.MathUtils.lerp(ra.rotation.z, -Math.PI / 3 * envelope, delta * 8); // arm out to side
  } else if (helpRequestActive) {
    ra.rotation.x = THREE.MathUtils.lerp(ra.rotation.x, RAISE_TARGET, delta * 6);
    ra.rotation.z = THREE.MathUtils.lerp(ra.rotation.z, 0, delta * 6);
  } else {
    ra.rotation.x = THREE.MathUtils.lerp(ra.rotation.x, rightArmWalk, delta * 8);
    ra.rotation.z = THREE.MathUtils.lerp(ra.rotation.z, 0, delta * 8);
  }
});
```

## Rotation direction reference

For a limb pivot at the shoulder/hip with the mesh hanging DOWN in local -Y:

- `rotation.x = 0`        → arm/leg hangs straight down (rest)
- `rotation.x = +π/2`     → arm/leg points forward horizontally (+Z)
- `rotation.x = +π`       → arm/leg points straight up (+Y)
- `rotation.x = -π/2`     → arm/leg points backward horizontally (-Z)
- `rotation.z = -π/3`     → arm tilts out to the right (for right arm = away from body)

For walking, arms and legs swing ±30° (`WALK_AMP = π/6`) around `rotation.x = 0`.

## Tuning constants (adjust during implementation)

| Constant | Value | What to tune |
|---|---|---|
| `WALK_FREQ` | 2.5 Hz | How fast the walk cycle feels — try 2.0–3.0 |
| `WALK_AMP` | π/6 (30°) | How big the swing is — try π/8 to π/4 |
| Walk blend speed | `delta * 8` | How quickly walk→idle transitions — try 5–12 |
| `BOB_AMP` | 0.004 m | Idle breathing height — very subtle |
| `BOB_FREQ` | 0.8 Hz | Breathing speed |
| `SPEAK_AMP` | 0.008 m | Speaking head bob intensity |
| `SPEAK_FREQ` | 4 Hz | Speaking bob rate |
| `RAISE_TARGET` | π * 0.80 | How high the raised hand goes — try 0.75–0.90 |
| `WAVE_DURATION` | 2.0 s | Total wave animation time |
| `WAVE_FREQ` | 3.5 Hz | Oscillation speed of wave |
| `WAVE_AMP` | π/5 | How much the arm swings during wave |
| `WAVE_BASE` | -π/2 | Starting angle for wave (arm pointing back/up) |

## Triggering the wave emote

The wave emote is triggered from the editor UI or a future button. It's a one-shot animation — the parent component sets `waveTriggered = true` once, the animation runs, and `onWaveComplete` is called to reset it. The parent must set `waveTriggered` back to `false` in `onWaveComplete`.

```typescript
const [waveTriggered, setWaveTriggered] = useState(false);

function triggerWave() {
  setWaveTriggered(true);
}

function handleWaveComplete() {
  setWaveTriggered(false);
}
```

## Raise hand integration

The `helpRequestActive` prop should be `true` when:
- The local participant has an active help request with status `"raised"` or `"acknowledged"`

For remote participants, their `helpRequest` status is visible in the classroom state. The `BlockyAvatar` component should receive this as a simple boolean — the parent is responsible for deriving it from classroom state.

```typescript
// In the parent (RoomView3D or Avatar call site):
const helpRequestActive = classroom.state?.helpRequests?.some(
  r => r.participantId === participant.participantId && r.status !== "closed"
) ?? false;
```
