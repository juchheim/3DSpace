import { RoomClient } from "../../../components/RoomClient";

export default async function RoomPage({
  params,
  searchParams
}: {
  params: Promise<{ roomId: string }>;
  searchParams: Promise<{ invite?: string }>;
}) {
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;
  return (
    <RoomClient
      roomId={resolvedParams.roomId}
      {...(resolvedSearchParams.invite ? { inviteCode: resolvedSearchParams.invite } : {})}
    />
  );
}
