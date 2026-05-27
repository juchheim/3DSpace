import { Buffer } from "node:buffer";
import type { MeetingNotesSegment } from "@3dspace/contracts";
import type { AppConfig } from "../config.js";
import { HttpError } from "../errors.js";
import { writeStoredObject } from "../services/storage.js";

type SummaryInput = {
  roomName: string;
  startedAt: string;
  participants: string[];
  transcriptText: string;
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 40) || "room";
}

function fileTimestamp(iso: string) {
  const date = new Date(iso);
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const min = String(date.getUTCMinutes()).padStart(2, "0");
  return `${yyyy}${mm}${dd}-${hh}${min}`;
}

function toCueTimestamp(ms: number, decimalSeparator: "." | ",") {
  const totalMs = Math.max(0, ms);
  const hours = Math.floor(totalMs / 3_600_000);
  const minutes = Math.floor((totalMs % 3_600_000) / 60_000);
  const seconds = Math.floor((totalMs % 60_000) / 1_000);
  const millis = totalMs % 1_000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}${decimalSeparator}${String(millis).padStart(3, "0")}`;
}

export function transcriptText(segments: MeetingNotesSegment[], speakerNames: Record<string, string>) {
  return segments
    .map((segment) => {
      const speaker = speakerNames[segment.speakerUserId] ?? segment.speakerUserId;
      return `[${toCueTimestamp(segment.startMs, ".")}] ${speaker}: ${segment.text}`;
    })
    .join("\n");
}

export function transcriptVtt(segments: MeetingNotesSegment[], speakerNames: Record<string, string>) {
  const cues = segments.map((segment, index) => {
    const speaker = speakerNames[segment.speakerUserId] ?? segment.speakerUserId;
    return [
      String(index + 1),
      `${toCueTimestamp(segment.startMs, ".")} --> ${toCueTimestamp(Math.max(segment.endMs, segment.startMs + 1), ".")}`,
      `${speaker}: ${segment.text}`
    ].join("\n");
  });
  return ["WEBVTT", "", ...cues].join("\n\n");
}

export function transcriptSrt(segments: MeetingNotesSegment[], speakerNames: Record<string, string>) {
  return segments.map((segment, index) => {
    const speaker = speakerNames[segment.speakerUserId] ?? segment.speakerUserId;
    return [
      String(index + 1),
      `${toCueTimestamp(segment.startMs, ",")} --> ${toCueTimestamp(Math.max(segment.endMs, segment.startMs + 1), ",")}`,
      `${speaker}: ${segment.text}`
    ].join("\n");
  }).join("\n\n");
}

function fallbackSummaryMarkdown(input: SummaryInput) {
  const highlights = input.transcriptText
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 8)
    .map((line) => `- ${line.replace(/^\[[^\]]+\]\s*/, "")}`);
  const participantLines = input.participants.length > 0 ? input.participants.map((name) => `- ${name}`) : ["- Unknown"];
  return [
    `# Meeting Notes - ${input.roomName} - ${new Date(input.startedAt).toISOString()}`,
    "",
    "## Participants",
    ...participantLines,
    "",
    "## TL;DR",
    highlights.length > 0 ? "Transcript captured successfully. Review the discussion highlights below." : "Transcript captured successfully.",
    "",
    "## Discussion highlights",
    ...(highlights.length > 0 ? highlights : ["- No transcript highlights were available."])
  ].join("\n");
}

export async function summarizeMeetingNotes(config: AppConfig, input: SummaryInput) {
  if (!config.openAiApiKey) return fallbackSummaryMarkdown(input);

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${config.openAiApiKey}`
    },
    body: JSON.stringify({
      model: config.tuning.openAiSummaryModel,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content: "Summarize meeting transcripts in Markdown. Do not fabricate participants, decisions, or action items. Omit unsupported sections."
        },
        {
          role: "user",
          content: [
            `Room: ${input.roomName}`,
            `Started at: ${input.startedAt}`,
            `Participants: ${input.participants.join(", ") || "Unknown"}`,
            "",
            input.transcriptText
          ].join("\n")
        }
      ]
    })
  });

  if (!response.ok) return fallbackSummaryMarkdown(input);
  const payload = await response.json() as {
    choices?: Array<{ message?: { content?: string | null } }>;
  };
  const content = payload.choices?.[0]?.message?.content?.trim();
  return content || fallbackSummaryMarkdown(input);
}

export async function transcribeAudioChunk(config: AppConfig, audio: Buffer, mimeType: string) {
  if (!config.openAiApiKey) {
    console.error("[meeting-notes] OpenAI transcription requested without OPENAI_API_KEY", {
      model: config.tuning.openAiTranscriptionModel,
      audioBytes: audio.length,
      mimeType
    });
    throw new HttpError(503, "OpenAI transcription is not configured", "meeting-notes-transcription-unavailable");
  }

  const baseType = (mimeType.split(";")[0] ?? mimeType).trim();
  const ext = baseType.includes("mp4") ? "m4a" : "webm";
  const body = new FormData();
  body.set("model", config.tuning.openAiTranscriptionModel);
  body.set("file", new Blob([new Uint8Array(audio)], { type: baseType }), `chunk.${ext}`);

  console.info("[meeting-notes] Sending audio chunk to OpenAI transcription", {
    model: config.tuning.openAiTranscriptionModel,
    audioBytes: audio.length,
    mimeType
  });

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.openAiApiKey}`
    },
    body
  });

  if (!response.ok) {
    const bodyText = await response.text().catch(() => "");
    console.error("[meeting-notes] OpenAI transcription failed", {
      status: response.status,
      statusText: response.statusText,
      model: config.tuning.openAiTranscriptionModel,
      audioBytes: audio.length,
      mimeType,
      body: bodyText.slice(0, 1000)
    });
    throw new HttpError(502, `OpenAI transcription request failed (${response.status} ${response.statusText})`, "meeting-notes-transcription-failed", {
      status: response.status,
      statusText: response.statusText
    });
  }
  const payload = await response.json() as { text?: string };
  const text = payload.text?.trim() ?? "";
  console.info("[meeting-notes] OpenAI transcription completed", {
    model: config.tuning.openAiTranscriptionModel,
    audioBytes: audio.length,
    mimeType,
    textLength: text.length
  });
  return text;
}

export function meetingNotesStorageBase(config: AppConfig, roomName: string, startedAt: string) {
  return `${config.tuning.aiMeetingNotesStoragePrefix.replace(/\/?$/, "/")}${slugify(roomName)}-${fileTimestamp(startedAt)}`;
}

export async function writeMeetingNotesArtifacts(
  config: AppConfig,
  input: {
    storageBase: string;
    transcriptTxt: string;
    transcriptVtt: string;
    transcriptSrt: string;
    summaryMd: string;
  }
) {
  const txt = `${input.storageBase}.txt`;
  const vtt = `${input.storageBase}.vtt`;
  const srt = `${input.storageBase}.srt`;
  const md = `${input.storageBase}.md`;
  await Promise.all([
    writeStoredObject(config, { storageKey: txt, body: Buffer.from(input.transcriptTxt, "utf8"), contentType: "text/plain; charset=utf-8" }),
    writeStoredObject(config, { storageKey: vtt, body: Buffer.from(input.transcriptVtt, "utf8"), contentType: "text/vtt; charset=utf-8" }),
    writeStoredObject(config, { storageKey: srt, body: Buffer.from(input.transcriptSrt, "utf8"), contentType: "application/x-subrip; charset=utf-8" }),
    writeStoredObject(config, { storageKey: md, body: Buffer.from(input.summaryMd, "utf8"), contentType: "text/markdown; charset=utf-8" })
  ]);
  return { txt, vtt, srt, md };
}
