# Implementation — Avatar Accessories

Plan: [`./PLAN_AVATAR_ACCESSORIES.md`](./PLAN_AVATAR_ACCESSORIES.md)
Branch target: `feature/avatar-accessories`
Last updated: 2026-06-06

---

## Status / Scope

- **v1 slot:** `head` only.
- **Pilot accessory:** `bowler-hat` (`GLBs/bowler-hat.glb` → `/avatar-accessories/bowler-hat.glb`).
- **Avatar rig:** Azure Vanguard (`BlockyAvatar`); attach to `Head` bone.
- **Persistence:** `user.avatar.accessories` in MongoDB.
- **Realtime:** new reliable `avatar.accessories.v1` LiveKit message.
- **Editor:** Accessories section inside existing `AvatarEditorPanel`.
- **Flags:** `ENABLE_AVATAR_ACCESSORIES` / `NEXT_PUBLIC_ENABLE_AVATAR_ACCESSORIES` (default off).

**Out of scope:** custom uploads, extra slots, 2D hat rendering, accessory animations.

---

## Codebase context (2026-06-06)

| Area | Location |
| --- | --- |
| Avatar render | `apps/web/components/BlockyAvatar.tsx` |
| Appearance hook | `apps/web/lib/useAvatarAppearance.ts` |
| Appearance broadcast | `apps/web/components/RoomClient.tsx` — search `avatar.appearance.v1` |
| Editor | `apps/web/components/AvatarEditorPanel.tsx`, `apps/web/lib/useAvatarEditor.ts` |
| User PATCH | `apps/api/src/routes/users.ts` — `PATCH /v1/users/me/avatar` |
| User schema | `packages/contracts/src/index.ts` — `UserSchema`, `AvatarAppearanceSchema` |
| Repo update | `apps/api/src/repository.ts` — `updateUserAvatarAppearance` |
| Lesson lock | `avatarEditorLocked` on `ClassroomStateSchema` |
| GLB attach pattern | `apps/web/components/GlbHostAvatar.tsx` — clone, `nativeGroundY`, bone-free |
| Optimize script | `scripts/optimize-lp-glb.mjs` (works on any GLB path) |
| Pilot asset | `GLBs/bowler-hat.glb` (~3.4 MB optimized) |

---

## Phase 0 — Asset commit + catalog package

**Goal:** Bowler hat is a validated public asset with typed catalog metadata.

**Files:**

- `GLBs/bowler-hat.glb` — already optimized; keep as source of truth.
- `apps/web/public/avatar-accessories/bowler-hat.glb` — copy from `GLBs/`.
- `packages/avatar-accessories/package.json` — workspace package.
- `packages/avatar-accessories/src/index.ts` — types + `BUILTIN_AVATAR_ACCESSORIES`.
- `packages/avatar-accessories/catalog/builtin.json` — bowler-hat entry.
- `apps/web/public/avatar-accessories/SOURCES.md` — provenance + license note.

**Catalog entry (initial tuning values — refine in Phase 3):**

```json
{
  "slug": "bowler-hat",
  "displayName": "Bowler hat",
  "slot": "head",
  "glbUrl": "/avatar-accessories/bowler-hat.glb",
  "attachBone": "Head",
  "localPosition": { "x": 0, "y": 0.08, "z": 0 },
  "localRotation": { "x": 0, "y": 0, "z": 0 },
  "localScale": 1,
  "thumbnailUrl": "/avatar-accessories/thumbnails/bowler-hat.png"
}
```

**Steps:**

1. `mkdir -p packages/avatar-accessories/catalog apps/web/public/avatar-accessories/thumbnails`
2. Copy GLB to `apps/web/public/avatar-accessories/bowler-hat.glb`.
3. Export `AvatarAccessorySlotSchema`, `AvatarAccessoryCatalogEntrySchema`, `AvatarEquippedAccessoriesSchema`, `getBuiltinAvatarAccessoryCatalog()` from package (JSON import or inline TS — match `packages/world-skins` / `packages/room-objects` convention).
4. Optional: add `apps/api/tests/avatar-accessories/bowler-hat-glb.test.ts` — file size + triangle count smoke (no room-object validator required for static props, but reuse if useful).

**Checkpoint:** `npm run typecheck -w @3dspace/avatar-accessories` (after package wired into workspaces).

---

## Phase 1 — Contracts + feature flags

**Goal:** Schemas, realtime message, user shape, env docs.

**Files:**

- `packages/contracts/src/index.ts`
- `.env.example`, `apps/api/.env.example`, `apps/web/.env.example`

**Steps:**

1. Add schemas:

   ```ts
   export const AvatarAccessorySlotSchema = z.enum(["head"]);

   export const AvatarAccessoryCatalogEntrySchema = z.object({
     slug: z.string().min(1),
     displayName: z.string().min(1),
     slot: AvatarAccessorySlotSchema,
     glbUrl: z.string().min(1),
     attachBone: z.string().min(1),
     localPosition: Vector3Schema,
     localRotation: z.object({ x: z.number(), y: z.number(), z: z.number() }),
     localScale: z.number().positive().default(1),
     nativeGroundY: z.number().optional(),
     thumbnailUrl: z.string().optional()
   });

   export const AvatarEquippedAccessoriesSchema = z.object({
     head: z.string().nullable().optional()
   }).default({ head: null });

   export const AvatarAccessoriesMessageSchema = z.object({
     type: z.literal("avatar.accessories.v1"),
     participantId: z.string(),
     accessories: AvatarEquippedAccessoriesSchema
   });
   ```

2. Extend `UserSchema.avatar` with `accessories: AvatarEquippedAccessoriesSchema.nullable().optional()`.

3. Add API request/response schemas:

   ```ts
   export const PatchUserAvatarAccessoriesRequestSchema = z.object({
     accessories: AvatarEquippedAccessoriesSchema
   });
   export const ListAvatarAccessoriesResponseSchema = z.object({
     items: z.array(AvatarAccessoryCatalogEntrySchema)
   });
   ```

4. Register OpenAPI entries for `GET /v1/avatar-accessories`, `PATCH /v1/users/me/accessories`.

5. Add config flags:

   - API: `ENABLE_AVATAR_ACCESSORIES` (default `false`)
   - Web: `NEXT_PUBLIC_ENABLE_AVATAR_ACCESSORIES` (default `false`)

6. Add `packages/contracts/tests/avatar-accessories.test.ts`:
   - Default equipped parses as `{ head: null }`.
   - Unknown slug in equipped object still parses (validation is API responsibility) OR equip schema validates against catalog at API layer only — **prefer API validation**, contract accepts string|null for head.

**Checkpoint:** `npm run typecheck -w @3dspace/contracts && npm run test -- packages/contracts/tests/avatar-accessories.test.ts`

---

## Phase 2 — API routes + persistence

**Goal:** Catalog list, user accessory PATCH, Mongo round-trip.

**Files:**

- `apps/api/src/config.ts` — `enableAvatarAccessories`
- `apps/api/src/routes/avatar-accessories.ts` — new
- `apps/api/src/routes/users.ts` — or keep accessories on dedicated route only
- `apps/api/src/repository.ts` — `updateUserAvatarAccessories`
- `apps/api/src/models/mongoose.ts` — `avatar.accessories` on user schema
- `apps/api/src/app.ts` — register routes when flag on
- `apps/api/tests/routes/avatar-accessories.test.ts`

**Steps:**

1. `GET /v1/avatar-accessories` — returns built-in catalog from `packages/avatar-accessories`; 404 when flag off.

2. `PATCH /v1/users/me/accessories` — `requireUser`, parse body, validate:
   - Each non-null slug exists in catalog.
   - Slug's `slot` matches the equipped key (e.g. `bowler-hat` → `head`).
   - Reject unknown slots in body.

3. `updateUserAvatarAccessories(userId, accessories)` on repository interface + memory + mongo implementations.

4. `GET /v1/users/me` — already returns full user; accessories appear after schema extension.

5. Tests:
   - Equip bowler-hat → GET me returns `{ head: "bowler-hat" }`.
   - Unequip `{ head: null }`.
   - Invalid slug → 400.
   - Flag off → 404.

**Checkpoint:** `npm run test -- apps/api/tests/routes/avatar-accessories.test.ts`

---

## Phase 3 — 3D rendering + dev harness

**Goal:** Hat visible on all participants; attach offset tuned.

**Files:**

- `apps/web/components/AvatarAccessoryGlb.tsx` — new (generic bone-attached GLB)
- `apps/web/components/AvatarAccessoryLayer.tsx` — maps equipped slugs → catalog entries
- `apps/web/components/BlockyAvatar.tsx` — render layer inside `AvatarModel` group
- `apps/web/app/dev/avatar-accessories/page.tsx` — dev-only harness (orbit + offset sliders)
- `apps/web/lib/avatarAccessoryCatalog.ts` — client catalog loader (static import from package or fetch GET catalog)

**`AvatarAccessoryGlb` behavior:**

1. `useGLTF(url)` + clone materials.
2. Receive `bone: Bone` from parent skeleton traverse.
3. Create child `group` on bone with catalog `localPosition` / `localRotation` / `localScale`.
4. Apply `nativeGroundY` offset inside accessory if catalog specifies it.

**`BlockyAvatar` integration:**

- Pass `accessories: AvatarEquippedAccessories` prop.
- Inside `AvatarModel`, after cloning skeleton, call `AvatarAccessoryLayer` with `root={model}` and equipped map.
- Gate with `CLIENT_TUNING.enableAvatarAccessories`.
- When `hidden` (first-person local), skip accessory layer.

**Dev harness (`/dev/avatar-accessories`):**

- Renders Azure Vanguard + bowler hat.
- Sliders for `localPosition.y` / `localRotation` — copy final values into `builtin.json`.

**Checkpoint:**

- `npm run typecheck -w @3dspace/web`
- Manual: hat sits on head in dev harness under `next dev`.

---

## Phase 4 — Client state + realtime

**Goal:** Everyone sees everyone else's accessories.

**Files:**

- `apps/web/lib/useAvatarAccessories.ts` — new (mirror `useAvatarAppearance`)
- `apps/web/lib/api.ts` — `listAvatarAccessories`, `patchAvatarAccessories`
- `apps/web/lib/config.ts` — `CLIENT_TUNING.enableAvatarAccessories`
- `apps/web/components/RoomClient.tsx` — wire hook, publish on join/save, subscribe handler

**Steps:**

1. `useAvatarAccessories()`:
   - `receiveAccessories(participantId, accessories)`
   - `setLocalAccessories(accessories)`
   - `getAccessories(participantId)` → default `{ head: null }`

2. On session bootstrap: seed local map from `user.avatar.accessories`.

3. On room join (after LiveKit connect): publish `avatar.accessories.v1` reliable.

4. Realtime handler: parse `AvatarAccessoriesMessageSchema`, call `receiveAccessories`.

5. Pass `getAccessories(participant.id)` into `BlockyAvatar` in `RoomView3D`.

**Checkpoint:** `npm run test -- apps/web/tests/avatar-accessories-realtime.test.ts` (unit test for hook merge + message parse).

---

## Phase 5 — Avatar editor UI

**Goal:** Users equip/unequip from the existing editor.

**Files:**

- `apps/web/components/AvatarEditorPanel.tsx`
- `apps/web/lib/useAvatarEditor.ts` — extend draft/save for accessories OR sibling `useAvatarAccessoryEditor`
- `apps/web/components/RoomClient.tsx` — draft accessories for live preview

**UX:**

```
Accessories
  Head:  ( ) None   (•) Bowler hat
```

**Steps:**

1. Fetch catalog on editor open (`GET /v1/avatar-accessories` or static builtin).
2. Draft state: `draftAccessories` parallel to `draftAppearance`.
3. `onDraftAccessoriesChange` → `RoomClient` local preview (search pattern: `localDraftAppearance`).
4. Save button:
   - `patchAvatarAccessories` (accessories only) — **or** combined save that PATCHes both appearance + accessories sequentially.
   - Publish `avatar.accessories.v1`.
5. Respect `avatarEditorLocked` — disable section.

**Checkpoint:** Manual equip → save → reload room → hat persists.

**Checkpoint (automated):** `npx playwright test apps/web/test/avatar-accessories.spec.ts`

---

## Phase 6 — Polish, E2E, rollout

**Goal:** Production-ready behind flags.

**Files:**

- `apps/web/test/avatar-accessories.spec.ts` — Playwright
- `apps/web/playwright.config.ts` — enable flag for spec
- `docs/planning/avatars/AVATAR_STATUS.md` — status section
- `.cursor/memory.md` — index entry

**E2E flow:**

1. User A equips bowler hat in editor.
2. User B sees hat on User A in 3D.
3. User A unequips → hat disappears for B.

**Rollout checklist:**

- [ ] Flags documented in `.env.example` files
- [ ] `SOURCES.md` for bowler-hat committed
- [ ] Thumbnail PNG for editor (optional v1 — can use text-only button)
- [ ] Staging enable + visual sign-off on attach offset
- [ ] Production enable

---

## Files-to-touch summary

| Phase | New | Modified |
| --- | --- | --- |
| 0 | `packages/avatar-accessories/*`, public GLB, SOURCES | `package.json` workspaces |
| 1 | contracts test | `packages/contracts/src/index.ts`, `.env.example` ×3 |
| 2 | `routes/avatar-accessories.ts`, API test | `config.ts`, `repository.ts`, `mongoose.ts`, `app.ts` |
| 3 | `AvatarAccessoryGlb.tsx`, `AvatarAccessoryLayer.tsx`, dev page | `BlockyAvatar.tsx` |
| 4 | `useAvatarAccessories.ts`, realtime test | `RoomClient.tsx`, `RoomView3D.tsx`, `api.ts`, `config.ts` |
| 5 | — | `AvatarEditorPanel.tsx`, `useAvatarEditor.ts` |
| 6 | Playwright spec | `AVATAR_STATUS.md`, memory |

---

## Validation commands (fill in as phases complete)

```bash
npm run typecheck
npm run test -- packages/contracts/tests/avatar-accessories.test.ts
npm run test -- apps/api/tests/routes/avatar-accessories.test.ts
npm run test -- apps/web/tests/avatar-accessories-realtime.test.ts
npx playwright test apps/web/test/avatar-accessories.spec.ts
```

---

## Resolved decisions

| Question | Decision |
| --- | --- |
| Message shape | Separate `avatar.accessories.v1` |
| API route | Dedicated `PATCH /v1/users/me/accessories` |
| Attach mechanism | Parent to `Head` bone on cloned skeleton |
| First-person | Hide local accessories when `hidden` |
| Catalog source | `packages/avatar-accessories` builtin JSON, API mirrors for GET |
| Bowler hat optimize | Already run via `optimize-lp-glb.mjs`; re-run before commit if source changes |
