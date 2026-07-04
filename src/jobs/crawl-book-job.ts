import { config } from "../config.js";
import { crawlBook } from "../crawler/qidiantu.js";
import { getSql } from "../db/client.js";
import { upsertBookCrawlResult, updateCrawlJobStatus } from "../db/repositories.js";

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
    const sql = getSql();

    try {
      await updateCrawlJobStatus(sql, jobId, "running", true);
      const result = await crawlBook(bookId, config, maxPages);
      await upsertBookCrawlResult(sql, result);
      await updateCrawlJobStatus(sql, jobId, "completed");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await updateCrawlJobStatus(sql, jobId, "failed", false, message);
    } finally {
      runningJobs.delete(jobId);
    }
  })();
}
