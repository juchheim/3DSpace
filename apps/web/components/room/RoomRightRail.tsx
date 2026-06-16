import type { ComponentProps } from "react";
import { AnchorPanel } from "../AnchorPanel";
import { ClassroomPanel } from "../ClassroomPanel";
import { FocusPanel } from "../FocusPanel";
import { GroupsPanel } from "../GroupsPanel";
import { PrivateChecksPanel } from "../PrivateChecksPanel";
import { LessonScriptCard } from "../LessonStudio";
import { LessonRunControls } from "../LessonRunControls";
import { LessonStudentCallout } from "../LessonStudentCallout";
import { LessonTimelinePanel } from "../LessonTimelinePanel";
import { RoomObjectsToolbar } from "../RoomObjectsToolbar";
import { EnvironmentCard } from "../EnvironmentCard";
import { PhysicsCard } from "../PhysicsCard";
import { MeetingNotesPanel } from "../MeetingNotesPanel";
import { TranslationPanel } from "../TranslationPanel";
import { AiWorldHostControls } from "../AiWorldHostControls";
import { AiObjectPanel } from "../AiObjectPanel";

type RoomRightRailProps = {
  lessonStudentCalloutProps?: ComponentProps<typeof LessonStudentCallout> | undefined;
  roomObjectsToolbarProps?: ComponentProps<typeof RoomObjectsToolbar> | undefined;
  classroomPanelProps?: ComponentProps<typeof ClassroomPanel> | undefined;
  lessonRunControlsProps?: ComponentProps<typeof LessonRunControls> | undefined;
  lessonScriptCardProps?: ComponentProps<typeof LessonScriptCard> | undefined;
  lessonTimelinePanelProps?: ComponentProps<typeof LessonTimelinePanel> | undefined;
  privateChecksPanelProps?: ComponentProps<typeof PrivateChecksPanel> | undefined;
  groupsPanelProps?: ComponentProps<typeof GroupsPanel> | undefined;
  focusPanelProps?: ComponentProps<typeof FocusPanel> | undefined;
  anchorPanelProps?: ComponentProps<typeof AnchorPanel> | undefined;
  meetingNotesPanelProps?: ComponentProps<typeof MeetingNotesPanel> | undefined;
  translationPanelProps?: ComponentProps<typeof TranslationPanel> | undefined;
  aiWorldHostControlsProps?: ComponentProps<typeof AiWorldHostControls> | undefined;
  aiObjectPanelProps?: ComponentProps<typeof AiObjectPanel> | undefined;
  environmentCardProps?: ComponentProps<typeof EnvironmentCard> | undefined;
  physicsCardProps?: ComponentProps<typeof PhysicsCard> | undefined;
};

export function RoomRightRail({
  lessonStudentCalloutProps,
  roomObjectsToolbarProps,
  classroomPanelProps,
  lessonRunControlsProps,
  lessonScriptCardProps,
  lessonTimelinePanelProps,
  privateChecksPanelProps,
  groupsPanelProps,
  focusPanelProps,
  anchorPanelProps,
  meetingNotesPanelProps,
  translationPanelProps,
  aiWorldHostControlsProps,
  aiObjectPanelProps,
  environmentCardProps,
  physicsCardProps
}: RoomRightRailProps) {
  return (
    <aside className="room-hud-right" aria-label="Room details">
      <div className="hud-panel">
        {lessonStudentCalloutProps ? <LessonStudentCallout {...lessonStudentCalloutProps} /> : null}
        {roomObjectsToolbarProps ? <RoomObjectsToolbar {...roomObjectsToolbarProps} /> : null}
        {classroomPanelProps ? <ClassroomPanel {...classroomPanelProps} /> : null}
        {lessonRunControlsProps ? <LessonRunControls {...lessonRunControlsProps} /> : null}
        {lessonScriptCardProps ? <LessonScriptCard {...lessonScriptCardProps} /> : null}
        {lessonTimelinePanelProps ? <LessonTimelinePanel {...lessonTimelinePanelProps} /> : null}
        {privateChecksPanelProps ? <PrivateChecksPanel {...privateChecksPanelProps} /> : null}
        {groupsPanelProps ? <GroupsPanel {...groupsPanelProps} /> : null}
        {focusPanelProps ? <FocusPanel {...focusPanelProps} /> : null}
        {anchorPanelProps ? <AnchorPanel {...anchorPanelProps} /> : null}
        {meetingNotesPanelProps ? <MeetingNotesPanel {...meetingNotesPanelProps} /> : null}
        {translationPanelProps ? <TranslationPanel {...translationPanelProps} /> : null}
        {aiWorldHostControlsProps ? <AiWorldHostControls {...aiWorldHostControlsProps} /> : null}
        {aiObjectPanelProps ? <AiObjectPanel {...aiObjectPanelProps} /> : null}
        {environmentCardProps ? <EnvironmentCard {...environmentCardProps} /> : null}
        {physicsCardProps ? <PhysicsCard {...physicsCardProps} /> : null}
      </div>
    </aside>
  );
}
