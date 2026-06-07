import { notFound } from "next/navigation";
import { AvatarRecolorHarness } from "../../../components/avatarRecolor/AvatarRecolorHarness";

const devRouteEnabled =
  process.env.NODE_ENV === "development" ||
  process.env.NEXT_PUBLIC_ENABLE_AVATAR_RECOLOR_DEV === "true";

export default function AvatarRecolorDevPage() {
  if (!devRouteEnabled) {
    notFound();
  }
  return <AvatarRecolorHarness />;
}
