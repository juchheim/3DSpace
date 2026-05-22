import { notFound } from "next/navigation";
import { SkinHarness } from "../../../components/worldSkins/SkinHarness";

// Dev-only route. Available automatically under `next dev`; in a production build it
// 404s unless NEXT_PUBLIC_ENABLE_WORLD_SKIN_DEV=true. Never linked from app navigation.
// Concept: docs/planning/new-features/CONCEPT_WORLD_SKINS_PHASE_A.md
// Impl plan: docs/planning/new-features/IMPL_WORLD_SKINS_PHASE_A.md
const devRouteEnabled =
  process.env.NODE_ENV === "development" ||
  process.env.NEXT_PUBLIC_ENABLE_WORLD_SKIN_DEV === "true";

export default function WorldSkinHeroDevPage() {
  if (!devRouteEnabled) {
    notFound();
  }
  return <SkinHarness />;
}
