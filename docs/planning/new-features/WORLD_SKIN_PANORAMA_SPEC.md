# World Skin — Wall panorama asset spec (authoritative)

**Status:** Accepted for Phase A production art and catalog entries.  
**Applies to:** All five launch skins (`mars-surface`, `cell-interior`, `roman-forum`, `rainforest-canopy`, `art-studio`).  
**Supersedes:** Per-wall `wall-<id>.webp` files in older IMPL drafts.

---

## One size for all walls

Deliver **one** WebP that wraps the entire classroom interior:

| File | Pixel size | Format |
| --- | --- | --- |
| **`panorama.webp`** | **8192 × 1024** | WebP, sRGB, quality 80–85 |

- **Width (8192):** full square room unwrap (120 m perimeter: 30+30+30+30 at ~68 px/m along the strip).
- **Height (1024):** all wall panels are 8 m tall at **128 px/m**.

Do **not** ship eight separate wall files for production skins.

### Horizon (fixed, not trial and error)

Paint **one horizontal line** across the **entire** width at:

**640 px from the bottom** (5 m ÷ 8 m = 62.5% of image height)

That line is **5 m above the floor** in the 3D room on every wall.

### Floor (still a second file)

Walls and floor are separate meshes. Required companion file:

| File | Pixel size |
| --- | --- |
| **`floor.webp`** | **2048 × 2048** (seamless tile) |

Optional: `map2d.webp` (2048 × 2048), `ambient.ogg`, `thumbnail.png`.

---

## Unwrap order (left → right in the image)

Paint the panorama in this order. Column widths are **exact pixel ranges** in the 8192-wide master.

| Segment | `wall.id` | Direction in image | World width (m) | **x start** | **x end** (px) |
| --- | --- | --- | ---: | ---: | ---: |
| 1 | `wall-left` | front → back | 30.0 | 0 | 2047 |
| 2 | `wall-back-lo` | left → right | 6.0 | 2048 | 2457 |
| 3 | `wall-back-li` | left → right | 6.0 | 2458 | 2867 |
| 4 | `wall-back-c` | left → right | 6.0 | 2868 | 3276 |
| 5 | `wall-back-ri` | left → right | 6.0 | 3277 | 3686 |
| 6 | `wall-back-ro` | left → right | 6.0 | 3687 | 4095 |
| 7 | `wall-right` | front → back | 30.0 | 4096 | 6143 |
| 8 | `wall-front` | left → right | 30.0 | 6144 | 8191 |

**Back wall:** segments 2–6 are collinear panels and must blend continuously at column boundaries.

**Authoring note:** The room is a **30 m × 30 m** square. Four logical wall panels are equal-width columns: left (2048 px), back (2048 px), right (2048 px), front (2048 px). The engine splits the back wall into five 6 m meshes only for anchors/UV compatibility; paint it as one continuous 30 m back wall across px 2048–4095.

**Front wall (segment 8):** keep the board zone visually calmer/darker — main board anchor sits on `wall-front`.

---

## Engine UV slices (catalog JSON)

Normalized UVs for `overrides.panoramaWall.slices` (v0 is always **0**):

| `wall.id` | `u0` | `u1` | `v1` | Wall height (m) |
| --- | ---: | ---: | ---: | ---: |
| `wall-left` | 0.0000 | 0.2500 | 1.0000 | 8 |
| `wall-back-lo` | 0.2500 | 0.3000 | 1.0000 | 8 |
| `wall-back-li` | 0.3000 | 0.3500 | 1.0000 | 8 |
| `wall-back-c` | 0.3500 | 0.4000 | 1.0000 | 8 |
| `wall-back-ri` | 0.4000 | 0.4500 | 1.0000 | 8 |
| `wall-back-ro` | 0.4500 | 0.5000 | 1.0000 | 8 |
| `wall-right` | 0.5000 | 0.7500 | 1.0000 | 8 |
| `wall-front` | 0.7500 | 1.0000 | 1.0000 | 8 |

R2 path: `world-skins/<slug>/v1/panorama.webp`

**Operator upload UI:** `http://localhost:3000/dev/world-skin-upload` (password from API env `WORLD_SKIN_UPLOADER_PASSWORD`; see `.env.example`).

---

## R2 layout per skin

```text
world-skins/<slug>/v1/
  panorama.webp    ← 8192 × 1024 (required)
  floor.webp       ← 2048 × 2048 (required)
  map2d.webp       ← optional
  ambient.ogg      ← optional
```

---

## Phase 0 / Phase 1 implementer notes

| Phase | Impact |
| --- | --- |
| **Phase 0 (done)** | Color-only harness is still valid. When you add Mars textures, use **`panorama.webp` at 8192×1024** — not eight wall files. |
| **Phase 1 (done)** | Core schemas unchanged. **`panoramaWall`** was added in contracts as an optional additive field (Phase 2 catalog); existing `walls` color map in `hero-draft.json` still validates. |

---

## QA before upload

- [ ] File is exactly **8192 × 1024** px.
- [ ] Horizon is a straight line at **640 px** from the bottom, full width.
- [ ] Back wall columns 1733–4095 align at ground and sky color.
- [ ] `wall-front` zone (px 5829–8191) readable behind where a white board will sit.
- [ ] WebP compresses to a reasonable size (target &lt; 4 MB for panorama alone; whole skin pack budget may exceed legacy 3 MB when using this resolution).
