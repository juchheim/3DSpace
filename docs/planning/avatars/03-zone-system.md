# Zone System — Color Zones, Face Mapping, Canvas Textures

## Concept

Each body part is a `BoxGeometry` with a 6-element material array (one per face). Most faces are a single solid color, implemented as a plain `MeshStandardMaterial`. Faces that contain two or three distinct vertical bands (hairline/face/chin, collar/chest/belly, thigh/shin) use a `MeshStandardMaterial` with a small `CanvasTexture` painted with colored rectangles.

The user never sees faces or textures. They see **23 named zones** in the editor UI, each with a color picker. The zone system translates those colors into the correct face materials and canvas textures.

## The 23 named zones

```
Zone key          Visual meaning
────────────────────────────────────────────────────────────
HEAD (6)
  hairTop         Top of head — hair or hat color
  hairFront       Hairline strip at top of the face
  faceSkin        Main face area — dominant skin tone
  faceAccent      Lower face / chin — beard, blush, or same as faceSkin
  headSide        Left and right sides of head — typically hair or skin
  hairBack        Entire back of head — typically hair

BODY (6)
  collar          Narrow strip at top of shirt front — neckline accent
  shirtFront      Main chest area front
  shirtBelly      Lower front of shirt
  shirtBack       Entire back of shirt (single color)
  shirtSide       Left and right sides of torso
  shoulderTop     Top face of body box — visible when looking down at avatar

ARMS (3 — applied identically to left and right)
  shoulderCap     Top face of arm — shoulder cap color
  sleeve          All four sides of the arm — main sleeve color
  hand            Bottom face of arm — hand/skin color at the wrist

LEGS (4 — applied identically to left and right)
  thigh           Upper half of leg front — upper trouser
  shin            Lower half of leg front — lower trouser or boot top
  legSide         Left, right, and back faces of leg — trouser side color
  legBack         Back face of leg (split from legSide if desired — currently same zone)

FEET (4)
  shoeTop         Top face of foot box
  shoeToe         Front face of foot — toe cap color
  shoeSide        Left and right faces of foot
  shoeSole        Bottom face of foot (almost never visible)
```

Note: `legBack` and `legSide` share the same zone key for simplicity. If you want them distinct, add a `legBack` key and split the mapping below.

## Default appearance

When a user has no saved appearance, derive defaults from their existing role color:

```typescript
const DEFAULT_APPEARANCE: AvatarAppearance = {
  hairTop:     "#2a1a0e",   // dark brown hair
  hairFront:   "#2a1a0e",
  headSide:    "#2a1a0e",
  hairBack:    "#2a1a0e",
  faceSkin:    "#f0c090",   // neutral skin tone
  faceAccent:  "#f0c090",   // same as skin by default
  collar:      "#ffffff",   // white collar
  shirtFront:  roleColor,   // use the participant's existing role/group color
  shirtBelly:  roleColor,
  shirtBack:   roleColor,
  shirtSide:   roleColor,
  shoulderTop: roleColor,
  shoulderCap: roleColor,
  sleeve:      roleColor,
  hand:        "#f0c090",   // skin tone
  thigh:       "#2a3a5a",   // dark navy trousers
  shin:        "#2a3a5a",
  legSide:     "#2a3a5a",
  legBack:     "#2a3a5a",
  shoeTop:     "#1a1a1a",   // near-black shoes
  shoeToe:     "#1a1a1a",
  shoeSide:    "#1a1a1a",
  shoeSole:    "#111111",
};
```

## Face-to-zone mapping per part

`BoxGeometry` face indices: 0=+X(right), 1=-X(left), 2=+Y(top), 3=-Y(bottom), 4=+Z(front), 5=-Z(back)

### HEAD — `buildHeadMaterials(z: AvatarAppearance)`

```
Face 0 (+X right)  → single color: z.headSide
Face 1 (-X left)   → single color: z.headSide
Face 2 (+Y top)    → single color: z.hairTop
Face 3 (-Y bottom) → single color: z.faceSkin   (chin underside, rarely visible)
Face 4 (+Z front)  → canvas texture (16×16):
                       y 0–3  : z.hairFront      (top 19% = hairline)
                       y 3–13 : z.faceSkin        (62% = face)
                       y 13–16: z.faceAccent      (19% = chin/lower face)
Face 5 (-Z back)   → single color: z.hairBack
```

### BODY — `buildBodyMaterials(z: AvatarAppearance)`

```
Face 0 (+X right)  → single color: z.shirtSide
Face 1 (-X left)   → single color: z.shirtSide
Face 2 (+Y top)    → single color: z.shoulderTop
Face 3 (-Y bottom) → single color: z.shirtBelly  (hem, rarely visible)
Face 4 (+Z front)  → canvas texture (8×12):
                       y 0–2  : z.collar          (top 17% = collar)
                       y 2–7  : z.shirtFront       (42% = chest)
                       y 7–12 : z.shirtBelly       (41% = belly)
Face 5 (-Z back)   → single color: z.shirtBack
```

### ARM (same materials for left and right) — `buildArmMaterials(z: AvatarAppearance)`

```
Face 0 (+X right)  → single color: z.sleeve
Face 1 (-X left)   → single color: z.sleeve
Face 2 (+Y top)    → single color: z.shoulderCap
Face 3 (-Y bottom) → single color: z.hand
Face 4 (+Z front)  → single color: z.sleeve
Face 5 (-Z back)   → single color: z.sleeve
```

### LEG (same materials for left and right) — `buildLegMaterials(z: AvatarAppearance)`

```
Face 0 (+X right)  → single color: z.legSide
Face 1 (-X left)   → single color: z.legSide
Face 2 (+Y top)    → single color: z.legSide   (hidden inside body)
Face 3 (-Y bottom) → single color: z.legSide   (hidden inside foot)
Face 4 (+Z front)  → canvas texture (4×12):
                       y 0–6  : z.thigh         (top 50%)
                       y 6–12 : z.shin           (bottom 50%)
Face 5 (-Z back)   → single color: z.legSide
```

### FOOT (same materials for left and right) — `buildFootMaterials(z: AvatarAppearance)`

```
Face 0 (+X right)  → single color: z.shoeSide
Face 1 (-X left)   → single color: z.shoeSide
Face 2 (+Y top)    → single color: z.shoeTop
Face 3 (-Y bottom) → single color: z.shoeSole
Face 4 (+Z front)  → single color: z.shoeToe
Face 5 (-Z back)   → single color: z.shoeSide   (heel — same as side)
```

## Canvas texture implementation

### Creating a zone canvas texture

```typescript
type ZoneRect = { color: string; x: number; y: number; w: number; h: number };

function createZoneCanvasTexture(
  width: number,
  height: number,
  zones: ZoneRect[]
): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  for (const zone of zones) {
    ctx.fillStyle = zone.color;
    ctx.fillRect(zone.x, zone.y, zone.w, zone.h);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;  // keep the pixel-art sharpness
  texture.minFilter = THREE.NearestFilter;
  return texture;
}
```

Use `NearestFilter` on both mag and min — this prevents blurring at the zone boundaries, which is the correct look for a blocky avatar.

### Updating a canvas texture in-place (on color change)

Do not create new textures on every color change — reuse the existing canvas:

```typescript
function updateZoneCanvasTexture(
  texture: THREE.CanvasTexture,
  zones: ZoneRect[]
): void {
  const canvas = texture.image as HTMLCanvasElement;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (const zone of zones) {
    ctx.fillStyle = zone.color;
    ctx.fillRect(zone.x, zone.y, zone.w, zone.h);
  }
  texture.needsUpdate = true;  // signals Three.js to re-upload to GPU
}
```

### Building all materials for a part

Example for the head:

```typescript
function buildHeadMaterials(z: AvatarAppearance): THREE.MeshStandardMaterial[] {
  const frontTexture = createZoneCanvasTexture(16, 16, [
    { color: z.hairFront,  x: 0, y: 0,  w: 16, h: 3  },
    { color: z.faceSkin,   x: 0, y: 3,  w: 16, h: 10 },
    { color: z.faceAccent, x: 0, y: 13, w: 16, h: 3  },
  ]);

  const mat = (color: string) =>
    new THREE.MeshStandardMaterial({ color, roughness: 0.7 });

  return [
    mat(z.headSide),   // +X right
    mat(z.headSide),   // -X left
    mat(z.hairTop),    // +Y top
    mat(z.faceSkin),   // -Y bottom (chin underside)
    new THREE.MeshStandardMaterial({ map: frontTexture, roughness: 0.7 }), // +Z front
    mat(z.hairBack),   // -Z back
  ];
}
```

Follow the same pattern for `buildBodyMaterials`, `buildArmMaterials`, `buildLegMaterials`, `buildFootMaterials`.

### Disposing materials on unmount

Each canvas texture and material must be disposed when the avatar component unmounts, to prevent GPU memory leaks:

```typescript
useEffect(() => {
  return () => {
    allMaterials.forEach(mat => {
      if (mat.map) mat.map.dispose();
      mat.dispose();
    });
  };
}, []);
```

## Updating materials when colors change

When `appearance` prop changes (user saved new colors):

1. Call the update variant for canvas-texture faces (don't recreate — call `updateZoneCanvasTexture`).
2. For single-color faces, update `material.color.set(newHex)` directly.
3. Both changes are reflected in the next render frame — no remount needed.

Use a `useEffect` that depends on the `appearance` prop and holds refs to each material instance.

## Zone display names (for the editor UI)

```typescript
export const ZONE_LABELS: Record<keyof AvatarAppearance, string> = {
  hairTop:     "Hair",
  hairFront:   "Hairline",
  headSide:    "Head sides",
  hairBack:    "Hair back",
  faceSkin:    "Face",
  faceAccent:  "Chin / lower face",
  collar:      "Collar",
  shirtFront:  "Chest",
  shirtBelly:  "Belly",
  shirtBack:   "Shirt back",
  shirtSide:   "Shirt sides",
  shoulderTop: "Shoulder top",
  shoulderCap: "Shoulder cap",
  sleeve:      "Sleeves",
  hand:        "Hands",
  thigh:       "Thighs",
  shin:        "Shins",
  legSide:     "Leg sides",
  legBack:     "Leg back",
  shoeTop:     "Shoe top",
  shoeToe:     "Toe cap",
  shoeSide:    "Shoe sides",
  shoeSole:    "Shoe sole",
};
```

## Zone grouping for the editor

Organize zones into collapsible sections in the editor panel:

```typescript
export const ZONE_GROUPS = [
  { label: "Head",     keys: ["hairTop", "hairFront", "headSide", "hairBack", "faceSkin", "faceAccent"] },
  { label: "Body",     keys: ["collar", "shirtFront", "shirtBelly", "shirtBack", "shirtSide", "shoulderTop"] },
  { label: "Arms",     keys: ["shoulderCap", "sleeve", "hand"] },
  { label: "Legs",     keys: ["thigh", "shin", "legSide"] },
  { label: "Feet",     keys: ["shoeTop", "shoeToe", "shoeSide", "shoeSole"] },
] as const;
```
