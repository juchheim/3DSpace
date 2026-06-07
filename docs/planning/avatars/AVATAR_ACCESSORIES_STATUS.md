
---

## Avatar accessories (GLB attachments) — Phases 0–6 complete ✅

**Planning:** [PLAN_AVATAR_ACCESSORIES.md](PLAN_AVATAR_ACCESSORIES.md), [IMPL_AVATAR_ACCESSORIES.md](IMPL_AVATAR_ACCESSORIES.md)  
**Branch target:** `feature/avatar-accessories`  
**Last updated:** 2026-06-06  
**Flags (default off):** `ENABLE_AVATAR_ACCESSORIES` / `NEXT_PUBLIC_ENABLE_AVATAR_ACCESSORIES`

| Phase | Description | Status |
| --- | --- | --- |
| 0 | Catalog package + public GLB (`bowler-hat`) | ✅ Done |
| 1 | Contracts, realtime message, env docs | ✅ Done |
| 2 | API routes + Mongo persistence | ✅ Done |
| 3 | 3D bone attach + `/dev/avatar-accessories` harness | ✅ Done |
| 4 | Client state + LiveKit `avatar.accessories.v1` | ✅ Done |
| 5 | Avatar editor Accessories section | ✅ Done |
| 6 | Playwright E2E + rollout docs | ✅ Done |

### What shipped

- **Catalog:** `packages/avatar-accessories` — builtin `bowler-hat` on `Head` bone; served at `/avatar-accessories/bowler-hat.glb`.
- **Persistence:** `user.avatar.accessories` (`{ head: slug | null }`); `PATCH /v1/users/me/accessories`, `GET /v1/avatar-accessories`.
- **Realtime:** reliable `avatar.accessories.v1` on join + on save (flag-gated publish).
- **Render:** `AvatarAccessoryLayer` on Azure Vanguard skeleton; hidden in first-person local view.
- **Editor:** Accessories section in `AvatarEditorPanel` — Head: None · Bowler hat; live preview; lesson lock respected.
- **E2E:** `apps/web/test/avatar-accessories.spec.ts` (editor equip/unequip peer sync + API PATCH persistence).
- **Client catalog:** `@3dspace/avatar-accessories/browser` (JSON import; no `node:fs` in browser bundle).

### Rollout checklist

- [x] Flags in `.env.example`, `apps/api/.env.example`, `apps/web/.env.example`
- [x] `apps/web/public/avatar-accessories/SOURCES.md` for bowler-hat
- [ ] Thumbnail PNG for editor (`/avatar-accessories/thumbnails/bowler-hat.png`) — optional v1 (text-only radio works)
- [ ] Staging enable + visual sign-off on attach offset (tune via `/dev/avatar-accessories`)
- [ ] Production enable

### Validation commands

```bash
npm run typecheck
npm run test -- packages/contracts/tests/avatar-accessories.test.ts
npm run test -- apps/api/tests/routes/avatar-accessories.test.ts
npm run test -- apps/web/tests/avatar-accessories-realtime.test.ts
npx playwright test apps/web/test/avatar-accessories.spec.ts
```

### Where to find things

| Thing | Location |
| --- | --- |
| Catalog package | `packages/avatar-accessories/` |
| Accessory GLB + SOURCES | `apps/web/public/avatar-accessories/` |
| 3D attach | `apps/web/components/AvatarAccessoryGlb.tsx`, `AvatarAccessoryLayer.tsx` |
| Client hook | `apps/web/lib/useAvatarAccessories.ts` |
| Editor hook | `apps/web/lib/useAvatarAccessoryEditor.ts` |
| API routes | `apps/api/src/routes/avatar-accessories.ts` |
| Contracts | `AvatarAccessoriesMessageSchema`, `AvatarEquippedAccessoriesSchema` |
| E2E spec | `apps/web/test/avatar-accessories.spec.ts` |
| Dev tuning page | `/dev/avatar-accessories` |
