import { MeetingNotesSessionDetailSchema } from "@3dspace/contracts";
import type { AppConfig } from "../config.js";
import { notFound } from "../errors.js";
import type { Repository } from "../repository.js";
import {
  meetingNotesStorageBase,
  summarizeMeetingNotes,
  transcriptSrt,
  transcriptText,
  transcriptVtt,
  writeMeetingNotesArtifacts
} from "./service.js";

export async function buildMeetingNotesDetail(repository: Repository, roomId: string, sessionId: string) {
  const session = await repository.getMeetingNotesSession(roomId, sessionId);
  if (!session) throw notFound("Meeting notes session not found");
  const segments = await repository.listMeetingNotesSegments(sessionId);
  return MeetingNotesSessionDetailSchema.parse({ ...session, segments });
}

export async function finalizeMeetingNotesSession(
  repository: Repository,
  config: AppConfig,
  room: { id: string; name: string; classId: string },
  sessionId: string
) {
  const session = await repository.getMeetingNotesSession(room.id, sessionId);
  if (!session) throw notFound("Meeting notes session not found");
  const segments = await repository.listMeetingNotesSegments(sessionId);
  const memberships = await repository.listMemberships(room.classId);
  const speakerNames = Object.fromEntries(memberships.map((membership) => [membership.userId, membership.displayName]));
  const participantNames = session.participantUserIds.map((userId) => speakerNames[userId] ?? userId);
  const txt = transcriptText(segments, speakerNames);
  const vtt = transcriptVtt(segments, speakerNames);
  const srt = transcriptSrt(segments, speakerNames);
  const summaryMd = await summarizeMeetingNotes(config, {
    roomName: room.name,
    startedAt: session.startedAt,
    participants: participantNames,
    transcriptText: txt
  });
  const storageBase = meetingNotesStorageBase(config, room.name, session.startedAt);
  const stored = await writeMeetingNotesArtifacts(config, {
    storageBase,
    transcriptTxt: txt,
    transcriptVtt: vtt,
    transcriptSrt: srt,
    summaryMd
  });
  return repository.updateMeetingNotesSession(room.id, sessionId, {
    status: "ready",
    endedAt: new Date().toISOString(),
    durationSec: Math.max(0, Math.round((Date.now() - new Date(session.startedAt).getTime()) / 1000)),
    transcriptStorageKeys: { txt: stored.txt, vtt: stored.vtt, srt: stored.srt },
    summaryStorageKey: stored.md,
    summaryGeneratedAt: new Date().toISOString()
  });
}
