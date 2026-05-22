import { notFound } from "next/navigation";
import { RoomObjectHeroHarness } from "../../../components/roomObjectProcedurals/RoomObjectHeroHarness";

// Dev-only route. Available automatically under `next dev`; in a production build it
// 404s unless NEXT_PUBLIC_ENABLE_ROOM_OBJECT_DEV=true. Never linked from app navigation.
// District demo script: docs/planning/new-features/ROOM_OBJECT_DEMO_SCRIPT.md
const devRouteEnabled =
  process.env.NODE_ENV === "development" ||
  process.env.NEXT_PUBLIC_ENABLE_ROOM_OBJECT_DEV === "true";

export default function RoomObjectHeroDevPage() {
  if (!devRouteEnabled) {
    notFound();
  }
  return <RoomObjectHeroHarness />;
}
