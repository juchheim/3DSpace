import { SharedBrowserSessionSchema, type SharedBrowserSession } from "@3dspace/contracts";

/** Strip server-only fields before returning a session to clients. */
export function sanitizeSharedBrowserSession(session: SharedBrowserSession): SharedBrowserSession {
  return SharedBrowserSessionSchema.parse(session);
}

export function sanitizeSharedBrowserSessionResponse(result: {
  session: SharedBrowserSession;
  realtimeMessages: unknown[];
}) {
  return {
    session: sanitizeSharedBrowserSession(result.session),
    realtimeMessages: result.realtimeMessages
  };
}
