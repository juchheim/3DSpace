"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AiObjectJob, AiObjectRealtimeMessage } from "@3dspace/contracts";
import {
  ApiError,
  cancelAiObjectJob,
  deleteAiObjectJob,
  downloadAiObjectGlb,
  listAiObjectJobs,
  placeAiObject,
  startAiObjectJob
} from "./api";
import type { ApiIdentity } from "./identity";
import type { RealtimeMessage } from "./realtime";

type PublishMessage = (message: RealtimeMessage) => void;
type ApplyLocalMessage = (message: RealtimeMessage) => void;

const ACTIVE_STATUSES = new Set(["queued", "refining", "composing", "validating"]);
const POLL_INTERVAL_MS = 2500;

function mergeJob(jobs: AiObjectJob[], incoming: AiObjectJob): AiObjectJob[] {
  const next = jobs.filter((j) => j.id !== incoming.id);
  next.unshift(incoming);
  next.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  return next;
}

export function useAiObjectGenerator(input: {
  identity: ApiIdentity;
  roomId?: string | null;
  enabled: boolean;
  publish?: PublishMessage;
  applyLocally?: ApplyLocalMessage;
}) {
  const [jobs, setJobs] = useState<AiObjectJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { identity, roomId, enabled, publish, applyLocally } = input;

  const hasActiveJob = jobs.some((j) => ACTIVE_STATUSES.has(j.status));

  const clearPoll = useCallback(() => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const schedulePoll = useCallback(() => {
    clearPoll();
    if (!enabled || !roomId) return;
    pollTimerRef.current = setTimeout(async () => {
      try {
        const response = await listAiObjectJobs(identity, roomId);
        setJobs(response.jobs);
        if (response.jobs.some((j) => ACTIVE_STATUSES.has(j.status))) {
          schedulePoll();
        }
      } catch {
        // silently ignore poll errors
      }
    }, POLL_INTERVAL_MS);
  }, [clearPoll, enabled, identity, roomId]);

  // Initial load
  useEffect(() => {
    if (!enabled || !roomId) return;
    setLoading(true);
    listAiObjectJobs(identity, roomId)
      .then((response) => {
        setJobs(response.jobs);
        if (response.jobs.some((j) => ACTIVE_STATUSES.has(j.status))) {
          schedulePoll();
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    return () => clearPoll();
  }, [clearPoll, enabled, identity, roomId, schedulePoll]);

  const handleRealtimeMessage = useCallback((message: RealtimeMessage): boolean => {
    const type = (message as { type?: string }).type ?? "";
    if (!type.startsWith("room.ai-object.")) return false;
    const msg = message as AiObjectRealtimeMessage;

    if (msg.type === "room.ai-object.started.v1") {
      schedulePoll();
      return true;
    }
    if (msg.type === "room.ai-object.ready.v1" || msg.type === "room.ai-object.error.v1") {
      if (enabled && roomId) {
        listAiObjectJobs(identity, roomId)
          .then((response) => setJobs(response.jobs))
          .catch(() => {});
      }
      clearPoll();
      return true;
    }
    if (msg.type === "room.ai-object.cancelled.v1" || msg.type === "room.ai-object.deleted.v1") {
      setJobs((prev) => prev.filter((j) => j.id !== msg.jobId));
      return true;
    }
    if (msg.type === "room.ai-object.progress.v1") {
      return true;
    }
    return false;
  }, [clearPoll, enabled, identity, roomId, schedulePoll]);

  const generate = useCallback(async (prompt: string, stylePreset?: AiObjectJob["stylePreset"], complexity?: AiObjectJob["complexity"]) => {
    if (!roomId) return;
    setError("");
    setLoading(true);
    try {
      const result = await startAiObjectJob(identity, roomId, {
        prompt,
        ...(stylePreset !== undefined ? { stylePreset } : {}),
        ...(complexity !== undefined ? { complexity } : {})
      });
      setJobs((prev) => mergeJob(prev, result.job));
      for (const msg of result.realtimeMessages) {
        publish?.(msg as RealtimeMessage);
      }
      schedulePoll();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Failed to start generation");
      }
    } finally {
      setLoading(false);
    }
  }, [identity, publish, roomId, schedulePoll]);

  const cancel = useCallback(async (jobId: string) => {
    if (!roomId) return;
    try {
      const result = await cancelAiObjectJob(identity, roomId, jobId);
      setJobs((prev) => mergeJob(prev, result.job));
      for (const msg of result.realtimeMessages) {
        publish?.(msg as RealtimeMessage);
      }
    } catch {
      // silently ignore
    }
  }, [identity, publish, roomId]);

  const remove = useCallback(async (jobId: string) => {
    if (!roomId) return;
    try {
      const result = await deleteAiObjectJob(identity, roomId, jobId);
      setJobs((prev) => prev.filter((j) => j.id !== jobId));
      for (const msg of result.realtimeMessages) {
        publish?.(msg as RealtimeMessage);
      }
    } catch {
      // silently ignore
    }
  }, [identity, publish, roomId]);

  const place = useCallback(async (jobId: string, pose?: { position: { x: number; y: number; z: number }; rotation: { yaw: number; pitch: number; roll: number } }) => {
    if (!roomId) return undefined;
    try {
      const result = await placeAiObject(identity, roomId, jobId, pose ? { position: pose.position, rotation: pose.rotation } : {});
      for (const msg of result.realtimeMessages) {
        applyLocally?.(msg as RealtimeMessage);
        publish?.(msg as RealtimeMessage);
      }
      return result;
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      }
      return undefined;
    }
  }, [applyLocally, identity, publish, roomId]);

  const download = useCallback(async (job: AiObjectJob) => {
    if (!roomId) return;
    const slug = job.prompt.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);
    const filename = slug ? `ai-object-${slug}.glb` : `ai-object-${job.id}.glb`;
    try {
      await downloadAiObjectGlb(identity, roomId, job.id, filename);
    } catch {
      setError("Download failed");
    }
  }, [identity, roomId]);

  return {
    jobs,
    loading,
    error,
    hasActiveJob,
    generate,
    cancel,
    remove,
    place,
    download,
    handleRealtimeMessage
  };
}
