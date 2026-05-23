import { notFound } from "next/navigation";
import { WorldSkinUploader } from "../../../components/worldSkins/WorldSkinUploader";

const devRouteEnabled =
  process.env.NODE_ENV === "development" ||
  process.env.NEXT_PUBLIC_ENABLE_WORLD_SKIN_DEV === "true" ||
  process.env.NEXT_PUBLIC_ENABLE_WORLD_SKIN_UPLOADER === "true";

export default function WorldSkinUploadDevPage() {
  if (!devRouteEnabled) {
    notFound();
  }
  return <WorldSkinUploader />;
}
