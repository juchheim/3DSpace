import { RoomAiHostFileSchema, type RoomAiHostFile, type RoomSettings } from "@3dspace/contracts";
import type { AuthContext } from "../auth.js";
import type { AppConfig } from "../config.js";
import { aiHostFileNotFound, aiHostFileRejected, forbidden } from "../errors.js";
import type { Repository } from "../repository.js";
import { newId, nowIso } from "../repository.js";
import {
  createUploadTarget,
  deleteStoredObject,
  readStoredObject,
  writeStoredObject
} from "../services/storage.js";
import { chunkText } from "./chunker.js";
import { extractTextFromBuffer } from "./extract-text.js";
import {
  buildAiHostFileRemovedMessage,
  buildAiHostFileUpdatedMessage
} from "./realtime-outbox.js";

function storagePrefix(config: AppConfig) {
  return config.tuning.aiWorldHostStoragePrefix.replace(/\/?$/, "/");
}

export function aiHostFileRawStorageKey(
  config: AppConfig,
  input: { roomId: string; fileId: string; fileName: string }
) {
  const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 120);
  return `${storagePrefix(config)}rooms/${input.roomId}/files/${input.fileId}/${safeName}`;
}

export function aiHostFileExtractedStorageKey(
  config: AppConfig,
  input: { roomId: string; fileId: string }
) {
  return `${storagePrefix(config)}rooms/${input.roomId}/files/${input.fileId}/extracted.txt`;
}

function aiHostSettings(room: { settings: RoomSettings }) {
  return room.settings.aiWorldHost ?? {
    enabled: true,
    maxFilesPerRoom: 10,
    maxFileSizeBytes: 5_000_000,
    maxMessagesPerUserPerHour: 60,
    maxContextMessages: 20,
    allowedMimeTypes: ["application/pdf", "text/plain", "text/markdown"]
  };
}

export function assertAiHostFileUploadAllowed(
  room: { settings: RoomSettings },
  input: { contentType: string; sizeBytes: number; currentFileCount: number }
) {
  const settings = aiHostSettings(room);
  if (!settings.allowedMimeTypes.includes(input.contentType)) {
    throw aiHostFileRejected("File type is not allowed for study uploads", {
      contentType: input.contentType
    });
  }
  if (input.sizeBytes > settings.maxFileSizeBytes) {
    throw aiHostFileRejected(`File exceeds the ${settings.maxFileSizeBytes} byte limit`, {
      sizeBytes: input.sizeBytes,
      maxFileSizeBytes: settings.maxFileSizeBytes
    });
  }
  if (input.currentFileCount >= settings.maxFilesPerRoom) {
    throw aiHostFileRejected("This room has reached the study file limit", {
      maxFilesPerRoom: settings.maxFilesPerRoom
    });
  }
}

export async function createAiHostFileUploadTarget(
  config: AppConfig,
  input: {
    roomId: string;
    fileName: string;
    contentType: string;
    sizeBytes: number;
  }
) {
  const fileId = newId("aihostfile");
  const storageKey = aiHostFileRawStorageKey(config, {
    roomId: input.roomId,
    fileId,
    fileName: input.fileName
  });
  const upload = await createUploadTarget(config, {
    storageKey,
    contentType: input.contentType
  });
  return { fileId, storageKey, upload };
}

export function createAiHostFileRecord(input: {
  roomId: string;
  fileId: string;
  uploadedByUserId: string;
  originalFileName: string;
  contentType: string;
  sizeBytes: number;
  storageKey: string;
  status?: RoomAiHostFile["status"];
  errorMessage?: string | undefined;
}): RoomAiHostFile {
  const now = nowIso();
  return RoomAiHostFileSchema.parse({
    id: input.fileId,
    roomId: input.roomId,
    uploadedByUserId: input.uploadedByUserId,
    originalFileName: input.originalFileName,
    contentType: input.contentType,
    sizeBytes: input.sizeBytes,
    storageKey: input.storageKey,
    status: input.status ?? "processing",
    ...(input.errorMessage ? { errorMessage: input.errorMessage } : {}),
    createdAt: now,
    updatedAt: now
  });
}

export async function processAiHostFileExtraction(
  config: AppConfig,
  repository: Repository,
  file: RoomAiHostFile
): Promise<RoomAiHostFile> {
  const object = await readStoredObject(config, { storageKey: file.storageKey });
  if (!object) {
    return repository.updateAiHostFile(file.roomId, file.id, {
      ...file,
      status: "failed",
      errorMessage: "Uploaded file was not found in storage",
      updatedAt: nowIso()
    });
  }

  try {
    const extracted = await extractTextFromBuffer(file.contentType, object.body);
    if (!extracted.text.trim()) {
      return repository.updateAiHostFile(file.roomId, file.id, {
        ...file,
        status: "failed",
        errorMessage: "No text found in this file",
        updatedAt: nowIso()
      });
    }
    const extractedTextStorageKey = aiHostFileExtractedStorageKey(config, {
      roomId: file.roomId,
      fileId: file.id
    });
    await writeStoredObject(config, {
      storageKey: extractedTextStorageKey,
      body: Buffer.from(extracted.text, "utf8"),
      contentType: "text/plain; charset=utf-8"
    });
    const chunks = chunkText({
      roomId: file.roomId,
      fileId: file.id,
      text: extracted.text
    });
    await repository.replaceAiHostFileChunks(file.roomId, file.id, chunks);

    return repository.updateAiHostFile(file.roomId, file.id, {
      ...file,
      extractedTextStorageKey,
      status: "ready",
      charCount: extracted.text.length,
      ...(extracted.pageCount !== undefined ? { pageCount: extracted.pageCount } : {}),
      errorMessage: undefined,
      updatedAt: nowIso()
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not read this file. Try .txt or .md, or a simpler PDF.";
    return repository.updateAiHostFile(file.roomId, file.id, {
      ...file,
      status: "failed",
      errorMessage: message,
      updatedAt: nowIso()
    });
  }
}

function isPdfContentType(contentType: string) {
  const baseType = contentType.split(";")[0]?.trim().toLowerCase() ?? contentType.toLowerCase();
  return baseType === "application/pdf";
}

export function assertCanDeleteAiHostFile(
  file: RoomAiHostFile,
  auth: AuthContext,
  classTeacherUserId: string,
  membership?: { role: string } | null
) {
  if (file.uploadedByUserId === auth.userId) return;
  if (classTeacherUserId === auth.userId) return;
  if (membership?.role === "teacher") return;
  throw forbidden("You can only delete study files you uploaded");
}

export function scheduleAiHostFileExtraction(
  config: AppConfig,
  repository: Repository,
  file: RoomAiHostFile
) {
  void processAiHostFileExtraction(config, repository, file).catch(() => undefined);
}

export async function reprocessAiHostFile(
  config: AppConfig,
  repository: Repository,
  roomId: string,
  fileId: string
) {
  const file = await repository.getAiHostFile(roomId, fileId);
  if (!file) throw aiHostFileNotFound();
  if (file.status !== "failed") {
    throw aiHostFileRejected("Only failed study files can be reprocessed");
  }
  const processing = await repository.updateAiHostFile(roomId, fileId, {
    ...file,
    status: "processing",
    errorMessage: undefined,
    updatedAt: nowIso()
  });
  if (isPdfContentType(file.contentType)) {
    scheduleAiHostFileExtraction(config, repository, processing);
    return processing;
  }
  return processAiHostFileExtraction(config, repository, processing);
}

export async function registerAiHostFile(
  config: AppConfig,
  repository: Repository,
  input: {
    roomId: string;
    userId: string;
    fileId: string;
    storageKey: string;
    originalFileName: string;
    contentType: string;
    sizeBytes: number;
  }
) {
  const prefix = `${storagePrefix(config)}rooms/${input.roomId}/files/${input.fileId}/`;
  if (!input.storageKey.startsWith(prefix)) {
    throw aiHostFileRejected("storageKey does not match the issued upload target");
  }

  const pending = createAiHostFileRecord({
    roomId: input.roomId,
    fileId: input.fileId,
    uploadedByUserId: input.userId,
    originalFileName: input.originalFileName,
    contentType: input.contentType,
    sizeBytes: input.sizeBytes,
    storageKey: input.storageKey,
    status: "processing"
  });
  await repository.createAiHostFile(pending);
  if (isPdfContentType(input.contentType)) {
    scheduleAiHostFileExtraction(config, repository, pending);
    return pending;
  }
  return processAiHostFileExtraction(config, repository, pending);
}

export async function deleteAiHostFileWithAssets(
  config: AppConfig,
  repository: Repository,
  roomId: string,
  fileId: string
) {
  const file = await repository.getAiHostFile(roomId, fileId);
  if (!file) throw aiHostFileNotFound();

  await deleteStoredObject(config, { storageKey: file.storageKey }).catch(() => undefined);
  if (file.extractedTextStorageKey) {
    await deleteStoredObject(config, { storageKey: file.extractedTextStorageKey }).catch(() => undefined);
  }
  await repository.deleteAiHostChatMessagesForFile(roomId, fileId);
  await repository.deleteAiHostFile(roomId, fileId);
}

export function fileRealtimeUpdated(file: RoomAiHostFile, senderId: string) {
  return buildAiHostFileUpdatedMessage({ roomId: file.roomId, file, senderId });
}

export function fileRealtimeRemoved(roomId: string, fileId: string, senderId: string) {
  return buildAiHostFileRemovedMessage({ roomId, fileId, senderId });
}
