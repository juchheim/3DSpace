# Avatar GLB Recolor — Implementation Status

**Planning:** [PLAN_AVATAR_GLB_RECOLOR.md](PLAN_AVATAR_GLB_RECOLOR.md), [IMPL_AVATAR_GLB_RECOLOR.md](IMPL_AVATAR_GLB_RECOLOR.md)  
**Branch target:** `feature/avatar-glb-recolor`  
**Last updated:** 2026-06-07  
**Flag (default off):** `NEXT_PUBLIC_ENABLE_AVATAR_GLB_RECOLOR`

---

## Overall progress

| Phase | Description | Status |
| --- | --- | --- |
| 0 | Neutral albedo + zone mask assets + generation scripts | ⬜ Not started |
| 1 | Zone registry + `appearanceToZoneColorArray` | ⬜ Not started |
| 2 | `onBeforeCompile` recolor shader module | ⬜ Not started |
| 3 | `BlockyAvatar` integration + feature flag | ⬜ Not started |
| 4 | `/dev/avatar-recolor` harness | ⬜ Not started |
| 5 | Mask refinement + visual QA sign-off | ⬜ Not started |
| 6 | Unit tests + Playwright E2E | ⬜ Not started |
| 7 | Rollout docs + staging enable | ⬜ Not started |

---

## Problem being solved

The **Your Avatar** editor saves and broadcasts 23 zone colors, but `BlockyAvatar` ignores `appearance` because the Azure Vanguard GLB uses a single full-color baked JPEG. This feature applies **neutral albedo + UV zone mask + luminance recolor shader** so picks like “red shirt” produce truly red results.

**Default look preserved:** users who have never saved (`avatar.appearance === null`) keep the original baked GLB until their first `PATCH` save. Editor dirty draft enables local live preview only.

---

## Rollout checklist

- [ ] `NEXT_PUBLIC_ENABLE_AVATAR_GLB_RECOLOR` documented in `.env.example` files
- [ ] `apps/web/public/avatars/RECOLOR_SOURCES.md` committed
- [ ] `azure-vanguard-albedo-neutral.jpg` + `azure-vanguard-zone-mask.png` shipped
- [ ] Mask validation script passes (all zone IDs 1–23 present)
- [ ] Visual sign-off on plan §6.1 acceptance criteria
- [ ] Staging enable (`NEXT_PUBLIC_ENABLE_AVATAR_GLB_RECOLOR=true`)
- [ ] Production enable

---

## Validation commands

```bash
node scripts/generate-avatar-recolor-assets.mjs --albedo-only
node scripts/validate-avatar-zone-mask.mjs apps/web/public/avatars/azure-vanguard-zone-mask.png
npm run typecheck -w @3dspace/web
npm run test -- apps/web/tests/avatar-zone-registry.test.ts
npm run test -- apps/web/tests/avatar-recolor-shader.test.ts
NEXT_PUBLIC_ENABLE_AVATAR_GLB_RECOLOR=true npx playwright test apps/web/test/avatar-recolor.spec.ts
```

---

## Where to find things (planned)

| Thing | Location |
| --- | --- |
| Zone ID registry | `apps/web/lib/avatarZoneRegistry.ts` |
| Recolor shader patch | `apps/web/lib/avatarRecolorShader.ts` |
| Avatar render integration | `apps/web/components/BlockyAvatar.tsx` |
| Neutral albedo | `apps/web/public/avatars/azure-vanguard-albedo-neutral.jpg` |
| Zone mask | `apps/web/public/avatars/azure-vanguard-zone-mask.png` |
| Asset scripts | `scripts/generate-avatar-recolor-assets.mjs`, `scripts/validate-avatar-zone-mask.mjs` |
| Dev harness | `/dev/avatar-recolor` |
| E2E spec | `apps/web/test/avatar-recolor.spec.ts` |
| Editor (unchanged) | `apps/web/components/AvatarEditorPanel.tsx` |
