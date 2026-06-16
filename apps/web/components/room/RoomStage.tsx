import type { ReactNode } from "react";

type RoomStageProps = {
  walkToastVisible: boolean;
  worldSkinsEnabled: boolean;
  dynamicBoardPlacementActive: boolean;
  dynamicBoardPlacementBusy: boolean;
  dynamicBoardPlacementMessage: string;
  buildPiecesEnabled: boolean;
  onCancelDynamicBoardPlacement(): void;
  aiWorldHostPlacementActive: boolean;
  aiWorldHostPlacementMode: "summon" | "reposition" | "idle";
  aiWorldHostBusy: boolean;
  onCancelAiWorldHostPlacement(): void;
  leaving: boolean;
  manifestReady: boolean;
  sessionReady: boolean;
  viewMode: "2d" | "3d";
  threeDView: ReactNode;
  twoDView: ReactNode;
};

export function RoomStage({
  walkToastVisible,
  worldSkinsEnabled,
  dynamicBoardPlacementActive,
  dynamicBoardPlacementBusy,
  dynamicBoardPlacementMessage,
  buildPiecesEnabled,
  onCancelDynamicBoardPlacement,
  aiWorldHostPlacementActive,
  aiWorldHostPlacementMode,
  aiWorldHostBusy,
  onCancelAiWorldHostPlacement,
  leaving,
  manifestReady,
  sessionReady,
  viewMode,
  threeDView,
  twoDView
}: RoomStageProps) {
  return (
    <div className="room-stage" aria-label="Shared classroom">
      {worldSkinsEnabled && walkToastVisible ? (
        <div className="world-skin-walk-toast" role="status" aria-live="polite">
          Lower gravity — you move slower.
        </div>
      ) : null}
      {dynamicBoardPlacementActive ? (
        <div className="dynamic-board-placement-toast" role="status" aria-live="polite">
          <strong>Place board</strong>
          <span>
            {dynamicBoardPlacementMessage ||
              (buildPiecesEnabled
                ? "Click a wall in the 3D room. Built walls merge into longer surfaces for larger boards."
                : "Click a wall in the 3D room.")}
          </span>
          <button
            type="button"
            className="dynamic-board-placement-toast__cancel"
            disabled={dynamicBoardPlacementBusy}
            onClick={onCancelDynamicBoardPlacement}
          >
            Cancel
          </button>
        </div>
      ) : null}
      {aiWorldHostPlacementActive ? (
        <div
          className="dynamic-board-placement-toast ai-world-host-placement-toast"
          role="status"
          aria-live="polite"
        >
          <strong>{aiWorldHostPlacementMode === "summon" ? "Place AI guide" : "Reposition AI guide"}</strong>
          <span>Click the ground in the 3D room, then confirm in the AI guide card.</span>
          <button
            type="button"
            className="dynamic-board-placement-toast__cancel"
            disabled={aiWorldHostBusy}
            onClick={onCancelAiWorldHostPlacement}
          >
            Cancel
          </button>
        </div>
      ) : null}
      {leaving ? (
        <div className="fallback-view">Leaving...</div>
      ) : !manifestReady || !sessionReady ? (
        <div className="fallback-view">Joining...</div>
      ) : viewMode === "3d" ? (
        threeDView
      ) : (
        twoDView
      )}
    </div>
  );
}
