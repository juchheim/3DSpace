import type { ReactNode } from "react";

type RoomOverlayStackProps = {
  guideDock?: ReactNode | undefined;
  objectInspectorDock?: ReactNode | undefined;
  lessonStudio?: ReactNode | undefined;
  peopleDetailPanel?: ReactNode | undefined;
  lessonRecap?: ReactNode | undefined;
  avatarEditor?: ReactNode | undefined;
  fullscreenWallObject?: ReactNode | undefined;
  liveCaptionsDock?: ReactNode | undefined;
  translationDock?: ReactNode | undefined;
  interactionPrompt?: ReactNode | undefined;
  seatedNotebook?: ReactNode | undefined;
  podiumNotebook?: ReactNode | undefined;
  logicInteractionPrompt?: ReactNode | undefined;
  playModeDock?: ReactNode | undefined;
  logicAuthoringOverlay?: ReactNode | undefined;
  buildControls?: ReactNode | undefined;
};

export function RoomOverlayStack({
  guideDock,
  objectInspectorDock,
  lessonStudio,
  peopleDetailPanel,
  lessonRecap,
  avatarEditor,
  fullscreenWallObject,
  liveCaptionsDock,
  translationDock,
  interactionPrompt,
  seatedNotebook,
  podiumNotebook,
  logicInteractionPrompt,
  playModeDock,
  logicAuthoringOverlay,
  buildControls
}: RoomOverlayStackProps) {
  return (
    <>
      {guideDock}
      {objectInspectorDock}
      {lessonStudio}
      {peopleDetailPanel}
      {lessonRecap}
      {avatarEditor}
      {fullscreenWallObject}
      {liveCaptionsDock}
      {translationDock}
      {interactionPrompt}
      {seatedNotebook}
      {podiumNotebook}
      {logicInteractionPrompt}
      {playModeDock}
      {logicAuthoringOverlay}
      {buildControls}
    </>
  );
}
