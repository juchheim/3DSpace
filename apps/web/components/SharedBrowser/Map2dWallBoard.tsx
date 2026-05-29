"use client";

import type { CSSProperties } from "react";
import type { WallObject } from "@3dspace/contracts";
import { useInView } from "../../lib/visibility";
import { WallObjectCard } from "../WallObjectCard";
import type { WhiteboardController } from "../../lib/useWhiteboards";
import type { SharedBrowserController } from "../../lib/useSharedBrowser";
import type { ApiIdentity } from "../../lib/identity";

/** 2D map overlay host: only connects Hyperbeam when the board tile is on-screen. */
export function Map2dWallBoard({
  object,
  style,
  whiteboardController,
  whiteboardParticipantNames,
  sharedBrowserController,
  sharedBrowserIdentity,
  sharedBrowserRoomId,
  currentUserId,
  canWriteWhiteboard,
  hideHeader
}: {
  object: WallObject;
  style: CSSProperties;
  whiteboardController?: WhiteboardController;
  whiteboardParticipantNames?: Record<string, string>;
  sharedBrowserController?: SharedBrowserController;
  sharedBrowserIdentity?: ApiIdentity;
  sharedBrowserRoomId?: string;
  currentUserId?: string;
  canWriteWhiteboard?: (object: WallObject) => boolean;
  hideHeader?: boolean;
}) {
  const { ref, inView } = useInView({ threshold: 0.08 });
  const isBrowser = object.type === "web.browser.shared";
  const e2eEmbedAlways = process.env.NEXT_PUBLIC_E2E_MOCK_HYPERBEAM_EMBED === "true";

  return (
    <div
      ref={ref}
      className={`map2d-whiteboard${isBrowser ? " map2d-whiteboard--browser" : ""}`}
      style={style}
    >
      <WallObjectCard
        object={object}
        compact
        surface
        canManage={false}
        {...(currentUserId ? { currentUserId } : {})}
        {...(whiteboardController ? { whiteboardController } : {})}
        {...(whiteboardParticipantNames ? { whiteboardParticipantNames } : {})}
        {...(sharedBrowserController ? { sharedBrowserController } : {})}
        {...(sharedBrowserIdentity ? { sharedBrowserIdentity } : {})}
        {...(sharedBrowserRoomId ? { sharedBrowserRoomId } : {})}
        {...(canWriteWhiteboard ? { canWriteWhiteboard } : {})}
        {...(isBrowser ? { hyperbeamEmbedVisible: e2eEmbedAlways || inView } : {})}
        {...(hideHeader ? { hideHeader } : {})}
      />
    </div>
  );
}
