import { Buffer } from "node:buffer";
import { MeetingNotesSegmentSchema } from "@3dspace/contracts";
import type { AppConfig } from "../config.js";
import { notFound } from "../errors.js";
import { newId, nowIso, type Repository } from "../repository.js";
import { transcribeAudioChunk } from "./service.js";

export type MeetingNotesAudioChunk = {
  participantId: string;
  startedAtMs: number;
  endedAtMs: number;
  mimeType: string;
  audio: Buffer;
};

type MeetingNotesLogger = {
  info(payload: Record<string, unknown>, message: string): void;
};

export function meetingNotesTaskKey(roomId: string, sessionId: string) {
  return `${roomId}:${sessionId}`;
}

export class MeetingNotesAudioStore {
  private chunksByTask = new Map<string, MeetingNotesAudioChunk[]>();

  clear(roomId: string, sessionId: string) {
    this.chunksByTask.delete(meetingNotesTaskKey(roomId, sessionId));
  }

  append(roomId: string, sessionId: string, chunk: MeetingNotesAudioChunk) {
    const key = meetingNotesTaskKey(roomId, sessionId);
    const chunks = this.chunksByTask.get(key) ?? [];
    chunks.push(chunk);
    this.chunksByTask.set(key, chunks);
    return {
      bufferedChunks: chunks.length,
      bufferedBytes: chunks.reduce((total, item) => total + item.audio.length, 0)
    };
  }

  async transcribeBuffered(input: {
    roomId: string;
    sessionId: string;
    repository: Repository;
    config: AppConfig;
    logger: MeetingNotesLogger;
  }) {
    const key = meetingNotesTaskKey(input.roomId, input.sessionId);
    const chunks = this.chunksByTask.get(key) ?? [];
    if (chunks.length === 0) {
      input.logger.info({ roomId: input.roomId, sessionId: input.sessionId }, "No buffered meeting notes audio to transcribe");
      return;
    }

    const session = await input.repository.getMeetingNotesSession(input.roomId, input.sessionId);
    if (!session) throw notFound("Meeting notes session not found");

    const participantUserIds = Array.from(new Set([...session.participantUserIds, ...chunks.map((chunk) => chunk.participantId)]));
    if (participantUserIds.length !== session.participantUserIds.length) {
      await input.repository.updateMeetingNotesSession(input.roomId, input.sessionId, { participantUserIds });
    }

    const chunksByParticipant = new Map<string, MeetingNotesAudioChunk[]>();
    for (const chunk of chunks) {
      const participantChunks = chunksByParticipant.get(chunk.participantId) ?? [];
      participantChunks.push(chunk);
      chunksByParticipant.set(chunk.participantId, participantChunks);
    }

    for (const [participantId, participantChunks] of chunksByParticipant.entries()) {
      const ordered = participantChunks.sort((a, b) => a.startedAtMs - b.startedAtMs || a.endedAtMs - b.endedAtMs);
      const audio = Buffer.concat(ordered.map((chunk) => chunk.audio));
      const startMs = Math.min(...ordered.map((chunk) => chunk.startedAtMs));
      const endMs = Math.max(...ordered.map((chunk) => chunk.endedAtMs));
      const mimeType = ordered[0]?.mimeType ?? "audio/webm";
      input.logger.info(
        {
          roomId: input.roomId,
          sessionId: input.sessionId,
          participantId,
          chunkCount: ordered.length,
          audioBytes: audio.length,
          mimeType,
          durationMs: Math.max(0, endMs - startMs)
        },
        "Transcribing buffered meeting notes audio"
      );

      const text = await transcribeAudioChunk(input.config, audio, mimeType);
      if (!text) {
        input.logger.info(
          {
            roomId: input.roomId,
            sessionId: input.sessionId,
            participantId,
            audioBytes: audio.length,
            mimeType
          },
          "Buffered meeting notes audio produced no transcript text"
        );
        continue;
      }

      const segment = MeetingNotesSegmentSchema.parse({
        id: newId("mnseg"),
        sessionId: input.sessionId,
        roomId: input.roomId,
        speakerUserId: participantId,
        startMs,
        endMs,
        text,
        isFinal: true,
        createdAt: nowIso()
      });
      await input.repository.createMeetingNotesSegment(segment);
      input.logger.info(
        {
          roomId: input.roomId,
          sessionId: input.sessionId,
          segmentId: segment.id,
          participantId,
          textLength: segment.text.length,
          startMs: segment.startMs,
          endMs: segment.endMs
        },
        "Transcript segment persisted from buffered meeting notes audio"
      );
    }

    this.clear(input.roomId, input.sessionId);
  }
}
