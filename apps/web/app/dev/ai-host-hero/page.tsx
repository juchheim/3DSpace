import { notFound } from "next/navigation";
import { RetroRobotHostHarness } from "../../../components/RetroRobotHostHarness";

// Dev-only route. Available automatically under `next dev`; in a production build
// it 404s unless NEXT_PUBLIC_ENABLE_AI_HOST_DEV=true. Never linked from app nav.
// Renders the RetroRobotHostAvatar (AI World Host) authoring harness. The R3F
// <Canvas> only mounts its scene graph client-side, so the procedural kit (and
// its CanvasTextures) never build during SSR.
const devRouteEnabled =
  process.env.NODE_ENV === "development" ||
  process.env.NEXT_PUBLIC_ENABLE_AI_HOST_DEV === "true";

export default function AiHostHeroDevPage() {
  if (!devRouteEnabled) {
    notFound();
  }
  return <RetroRobotHostHarness />;
}
