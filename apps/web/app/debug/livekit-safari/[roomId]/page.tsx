import { LiveKitSafariDebug } from "../../../../components/LiveKitSafariDebug";

export default async function LiveKitSafariDebugPage({
  params,
  searchParams
}: {
  params: Promise<{ roomId: string }>;
  searchParams: Promise<{ invite?: string }>;
}) {
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;

  return <LiveKitSafariDebug roomId={resolvedParams.roomId} {...(resolvedSearchParams.invite ? { inviteCode: resolvedSearchParams.invite } : {})} />;
}
