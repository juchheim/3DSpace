import type { AppConfig } from "./config.js";
import type { MeetingNotesAudioStore } from "./meeting-notes/audio-buffer.js";
import type { Repository } from "./repository.js";
import type { RoomObjectGrabLock } from "./room-objects/grab-lock.js";
import type { SessionRateLimiter } from "./rooms-core/session-rate-limit.js";
import type { BuildPlacementRateLimiter } from "./build-pieces/placement-rate-limit.js";
import type { SharedBrowserOrchestrator } from "./shared-browser/orchestrator.js";

export type BuildAppOptions = {
  config?: AppConfig;
  repository?: Repository;
  roomObjectGrabLock?: RoomObjectGrabLock;
  sharedBrowserOrchestrator?: SharedBrowserOrchestrator;
  meetingNotesAudioStore?: MeetingNotesAudioStore;
};

export type AppContext = {
  config: AppConfig;
  repository: Repository;
  roomObjectGrabLock: RoomObjectGrabLock;
  sharedBrowserOrchestrator: SharedBrowserOrchestrator;
  meetingNotesAudioStore: MeetingNotesAudioStore;
  sessionRateLimiter: SessionRateLimiter;
  buildPlacementRateLimiter: BuildPlacementRateLimiter;
};
