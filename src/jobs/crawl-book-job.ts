import { config } from "../config.js";
import { crawlBook } from "../crawler/qidiantu.js";
import {
  storageUpdateCrawlJobProgress,
  storageUpdateCrawlJobStatus,
  storageUpsertBookCrawlResult,
} from "../storage/index.js";

const runningJobs = new Set<number>();

export function isJobRunning(jobId: number): boolean {
  return runningJobs.has(jobId);
}

export function triggerBookCrawlJob(jobId: number, bookId: string, maxPages?: number): void {
  if (runningJobs.has(jobId)) {
    return;
  }

  runningJobs.add(jobId);

  void (async () => {
    try {
      await storageUpdateCrawlJobStatus(jobId, "running", true);
      const result = await crawlBook(bookId, config, {
        maxPages,
        onProgress: (progress) => storageUpdateCrawlJobProgress(jobId, progress),
      });
      await storageUpsertBookCrawlResult(result);
      await storageUpdateCrawlJobStatus(jobId, "completed");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await storageUpdateCrawlJobStatus(jobId, "failed", false, message);
    } finally {
      runningJobs.delete(jobId);
    }
  })();
}
