import { AccessToken } from "livekit-server-sdk";
import type { Role } from "@3dspace/contracts";
import type { AppConfig } from "../config";
import { livekitConfigured } from "../config";

export async function mintLiveKitToken(
  config: AppConfig,
  input: {
    roomId: string;
    participantIdentity: string;
    displayName: string;
    role: Role;
  }
) {
  if (!livekitConfigured(config)) {
    return `dev-token-${input.roomId}-${input.participantIdentity}`;
  }

  const token = new AccessToken(config.livekitApiKey!, config.livekitApiSecret!, {
    identity: input.participantIdentity,
    name: input.displayName,
    ttl: "15m",
    metadata: JSON.stringify({ role: input.role })
  });

  token.addGrant({
    room: input.roomId,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true
  });

  return token.toJwt();
}
