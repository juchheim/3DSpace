import type { AppConfig } from "../config.js";
import type { Repository } from "../repository.js";
import { deleteStoredObject } from "../services/storage.js";

export function startAiObjectRetentionReaper(config: AppConfig, repository: Repository) {
  const intervalMs = 60 * 60 * 1000; // hourly

  async function sweep() {
    const retentionMs = config.tuning.aiObjectRetentionDays * 24 * 60 * 60 * 1000;
    const cutoff = new Date(Date.now() - retentionMs).toISOString();
    const expired = await repository.listExpiredAiObjectJobs(cutoff, 100);

    for (const job of expired) {
      try {
        // Delete R2 artifacts
        if (job.glbStorageKey) await deleteStoredObject(config, { storageKey: job.glbStorageKey }).catch(() => {});
        if (job.thumbnailStorageKey) await deleteStoredObject(config, { storageKey: job.thumbnailStorageKey }).catch(() => {});

        // Delete the template (placed objects cascade via room cleanup)
        if (job.templateId) {
          await repository.archiveRoomObjectTemplate(job.templateId).catch(() => {});
        }

        await repository.deleteAiObjectJob(job.id, job.roomId);
      } catch (err) {
        console.error(`[ai-object-reaper] Failed to reap job ${job.id}:`, err);
      }
    }
  }

  // Stagger first run by 5 minutes
  const timer = setTimeout(() => {
    sweep().catch(console.error);
    setInterval(() => sweep().catch(console.error), intervalMs);
  }, 5 * 60 * 1000);

  return timer;
}
