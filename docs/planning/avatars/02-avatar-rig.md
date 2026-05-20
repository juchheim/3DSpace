# Avatar Rig — Three.js Box Hierarchy

## Coordinate system

Three.js uses a right-handed coordinate system: X = right, Y = up, Z = toward the viewer. The avatar root group sits at the avatar's world-space position (ground level, y=0). All dimensions below are in meters.

## Part dimensions (width × height × depth)

```
Part         W      H      D      Notes
─────────────────────────────────────────────────────
Head         0.40   0.40   0.40
Body         0.44   0.50   0.22
Left Arm     0.16   0.44   0.16   mirrored from Right Arm
Right Arm    0.16   0.44   0.16
Left Leg     0.18   0.40   0.18   mirrored from Right Leg
Right Leg    0.18   0.40   0.18
Left Foot    0.22   0.12   0.32   longer front-to-back (shoes)
Right Foot   0.22   0.12   0.32
```

Total standing height: 0.12 (foot) + 0.40 (leg) + 0.50 (body) + 0.40 (head) = **1.42 m**

## Scenegraph hierarchy

```
<group name="avatarRoot" position={worldPos} rotation-y={yaw}>

  <group name="headGroup" position={[0, 1.22, 0]}>
    <mesh name="head">
      <boxGeometry args={[0.40, 0.40, 0.40]} />
      <meshStandardMaterial[] />  {/* 6-element material array — see zone doc */}
    </mesh>
  </group>

  <group name="bodyGroup" position={[0, 0.77, 0]}>
    <mesh name="body">
      <boxGeometry args={[0.44, 0.50, 0.22]} />
      <meshStandardMaterial[] />
    </mesh>
  </group>

  {/* Arm pivots sit at the shoulder joint. The mesh hangs below the pivot. */}
  <group name="leftArmPivot" position={[-0.30, 0.97, 0]}>
    <mesh name="leftArm" position={[0, -0.22, 0]}>
      <boxGeometry args={[0.16, 0.44, 0.16]} />
      <meshStandardMaterial[] />
    </mesh>
  </group>

  <group name="rightArmPivot" position={[0.30, 0.97, 0]}>
    <mesh name="rightArm" position={[0, -0.22, 0]}>
      <boxGeometry args={[0.16, 0.44, 0.16]} />
      <meshStandardMaterial[] />
    </mesh>
  </group>

  {/* Leg pivots sit at the hip joint. The mesh hangs below. */}
  <group name="leftLegPivot" position={[-0.11, 0.52, 0]}>
    <mesh name="leftLeg" position={[0, -0.20, 0]}>
      <boxGeometry args={[0.18, 0.40, 0.18]} />
      <meshStandardMaterial[] />
    </mesh>
    {/* Foot is a child of the leg pivot so it swings with it */}
    <mesh name="leftFoot" position={[0, -0.46, 0.05]}>
      <boxGeometry args={[0.22, 0.12, 0.32]} />
      <meshStandardMaterial[] />
    </mesh>
  </group>

  <group name="rightLegPivot" position={[0.11, 0.52, 0]}>
    <mesh name="rightLeg" position={[0, -0.20, 0]}>
      <boxGeometry args={[0.18, 0.40, 0.18]} />
      <meshStandardMaterial[] />
    </mesh>
    <mesh name="rightFoot" position={[0, -0.46, 0.05]}>
      <boxGeometry args={[0.22, 0.12, 0.32]} />
      <meshStandardMaterial[] />
    </mesh>
  </group>

</group>
```

## Position math

### Head

Center at y = 0.12 (foot) + 0.40 (leg) + 0.50 (body) + 0.40/2 (half head) = **1.22**

### Body

Center at y = 0.12 (foot) + 0.40 (leg) + 0.50/2 (half body) = **0.77**

### Arm pivots (shoulder joint)

The shoulder joint is at the top of the arm, level with the top of the body.
- y = 0.12 + 0.40 + 0.50 - 0.03 (slight inset) = **0.97**
- x = ±(0.44/2 + 0.16/2) = ±(0.22 + 0.08) = **±0.30**

Arm mesh center in local space: `position={[0, -0.22, 0]}` (half of arm height below pivot)

### Leg pivots (hip joint)

Hip joint is at the top of the legs, which is the bottom of the body.
- y = 0.12 (foot) + 0.40 (leg) = **0.52**
- x = ±(0.18/2 + gap) ≈ ±(0.09 + 0.02) = **±0.11**

Leg mesh center in local space: `position={[0, -0.20, 0]}` (half of leg height below pivot)

### Foot

Foot is a child of the leg pivot group, so it swings with the leg.
- Local y = -0.46 (below pivot: 0.40 leg height + 0.12/2 foot center)
- Local z = +0.05 (shifted slightly forward — shoes extend forward more than back)

## Refs for animation

All animated groups need React refs:

```typescript
const headGroupRef = useRef<THREE.Group>(null);
const leftArmPivotRef = useRef<THREE.Group>(null);
const rightArmPivotRef = useRef<THREE.Group>(null);
const leftLegPivotRef = useRef<THREE.Group>(null);
const rightLegPivotRef = useRef<THREE.Group>(null);
```

The body mesh ref is optional — only needed for idle bob:
```typescript
const bodyGroupRef = useRef<THREE.Group>(null);
```

## Material arrays

`BoxGeometry` in Three.js maps six materials to six faces in this order:

```
Index 0 → +X face (right side)
Index 1 → -X face (left side)
Index 2 → +Y face (top)
Index 3 → -Y face (bottom)
Index 4 → +Z face (front — faces +Z = toward viewer when rotation.y = 0)
Index 5 → -Z face (back)
```

To apply a material array to a mesh in R3F:
```tsx
<mesh>
  <boxGeometry args={[w, h, d]} />
  {materials.map((mat, i) => (
    <primitive key={i} object={mat} attach={`material-${i}`} />
  ))}
</mesh>
```

Each material is a `THREE.MeshStandardMaterial`. Faces that map to a single zone use `new THREE.MeshStandardMaterial({ color: '#hexval', roughness: 0.7 })`. Faces that contain multiple sub-zones use a material with a canvas texture: `new THREE.MeshStandardMaterial({ map: canvasTexture, roughness: 0.7 })`. See `03-zone-system.md` for the full mapping.

## Roughness values

All parts: `roughness: 0.7`. No metalness. This gives a matte, toy-like look consistent with the blocky aesthetic. The nameplate and camera feed billboard carry over unchanged from the existing implementation.

## Nameplate and camera feed

Keep the existing `<Billboard>` + `<Html>` nameplate above the avatar. Position it at `y = 1.52` (above head center + 0.20 clearance). The camera feed billboard position moves up proportionally: `y = 1.46`. No changes to nameplate logic.

## React component signature

```typescript
type BlockyAvatarProps = {
  participant: ParticipantView;
  groupColor?: string;
  appearance: AvatarAppearance;       // the 23-zone color object
  helpRequestActive: boolean;          // drives raise-hand animation
  waveTriggered: boolean;              // one-shot wave emote trigger
  onWaveComplete: () => void;          // callback to reset waveTriggered
};

function BlockyAvatar(props: BlockyAvatarProps): JSX.Element
```
