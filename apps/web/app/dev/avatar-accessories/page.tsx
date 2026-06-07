import { notFound } from "next/navigation";
import { AvatarAccessoryHarness } from "../../../components/avatarAccessories/AvatarAccessoryHarness";

// Dev-only route. Available automatically under `next dev`; in a production build it
// 404s unless NEXT_PUBLIC_ENABLE_AVATAR_ACCESSORY_DEV=true. Never linked from app navigation.
const devRouteEnabled =
  process.env.NODE_ENV === "development" ||
  process.env.NEXT_PUBLIC_ENABLE_AVATAR_ACCESSORY_DEV === "true";

export default function AvatarAccessoryDevPage() {
  if (!devRouteEnabled) {
    notFound();
  }
  return <AvatarAccessoryHarness />;
}
