# World Skin — Wall panorama asset spec (authoritative)

**Status:** Accepted for Phase A production art and catalog entries.  
**Applies to:** All five launch skins (`mars-surface`, `cell-interior`, `roman-forum`, `rainforest-canopy`, `art-studio`).  
**Supersedes:** Per-wall `wall-<id>.webp` files in older IMPL drafts.

---

## One size for all walls

Deliver **one** WebP that wraps the entire theater interior:

| File | Pixel size | Format |
| --- | --- | --- |
| **`panorama.webp`** | **8192 × 1024** | WebP, sRGB, quality 80–85 |

- **Width (8192):** full room unwrap (~100.5 m at ~81 px/m along the strip).
- **Height (1024):** tallest wall (front, 8 m) at **128 px/m**.

Do **not** ship eight separate wall files for production skins.

### Horizon (fixed, not trial and error)

Paint **one horizontal line** across the **entire** width at:

**640 px from the bottom** (5 m ÷ 8 m = 62.5% of image height)

That line is **5 m above the floor** in the 3D room on every wall. Shorter walls only sample the lower portion of the texture (see UV table below).

### Floor (still a second file)

Walls and floor are separate meshes. Required companion file:

| File | Pixel size |
| --- | --- |
| **`floor.webp`** | **2048 × 2048** (seamless tile) |

Optional: `map2d.webp` (2048 × 2048), `ambient.ogg`, `thumbnail.png`.

---

## Unwrap order (left → right in the image)

Paint the panorama in this order. Column widths are **exact pixel ranges** in the 8192-wide master.

| Segment | `wall.id` | World width (m) | **x start** | **x end** (px) |
| --- | --- | ---: | ---: | ---: |
| 1 | `wall-left` | 20.0 | 0 | 1631 |
| 2 | `wall-back-lo` | 5.22 | 1632 | 2055 |
| 3 | `wall-back-li` | 6.02 | 2056 | 2543 |
| 4 | `wall-back-c` | 8.00 | 2544 | 3391 |
| 5 | `wall-back-ri` | 6.02 | 3392 | 3879 |
| 6 | `wall-back-ro` | 5.22 | 3880 | 4303 |
| 7 | `wall-right` | 20.0 | 4304 | 5935 |
| 8 | `wall-front` | 30.0 | 5936 | 8191 |

**Back arc:** segments 2–6 must blend continuously at column boundaries (no visible vertical cuts).

**Front wall (segment 8):** keep the board zone visually calmer/darker — main board anchor sits on `wall-front`.

---

## Engine UV slices (catalog JSON)

Normalized UVs for `overrides.panoramaWall.slices` (v0 is always **0**):

| `wall.id` | `u0` | `u1` | `v1` | Wall height (m) |
| --- | ---: | ---: | ---: | ---: |
| `wall-left` | 0.0000 | 0.1990 | 0.7500 | 6 |
| `wall-back-lo` | 0.1990 | 0.2509 | 0.6250 | 5 |
| `wall-back-li` | 0.2509 | 0.3108 | 0.6250 | 5 |
| `wall-back-c` | 0.3108 | 0.3904 | 0.6250 | 5 |
| `wall-back-ri` | 0.3904 | 0.4503 | 0.6250 | 5 |
| `wall-back-ro` | 0.4503 | 0.5022 | 0.6250 | 5 |
| `wall-right` | 0.5022 | 0.7013 | 0.7500 | 6 |
| `wall-front` | 0.7013 | 1.0000 | 1.0000 | 8 |

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
- [ ] Back arc columns 1632–4303 align at ground and sky color.
- [ ] `wall-front` zone (px 5936–8191) readable behind where a white board will sit.
- [ ] WebP compresses to a reasonable size (target &lt; 4 MB for panorama alone; whole skin pack budget may exceed legacy 3 MB when using this resolution).
