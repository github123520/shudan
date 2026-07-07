import {
  getDatabaseConfigSource,
  getDatabaseUnavailableReason,
  getSql,
  hasDatabaseConfig,
} from "../db/client.js";
import {
  createCrawlJob,
  findIntersectingBooklists,
  getBookDetails,
  getBookEntries,
  getCrawlJob,
  listBookDetails,
  upsertBookCrawlResult,
  updateCrawlJobProgress,
  updateCrawlJobStatus,
  type IntersectionQuery,
} from "../db/repositories.js";
import type { BookCrawlResult, CrawlProgress } from "../types.js";
import {
  fileCreateCrawlJob,
  fileFindIntersectingBooklists,
  fileGetBookDetails,
  fileGetBookEntries,
  fileGetCrawlJob,
  fileListBookDetails,
  fileUpdateCrawlJobProgress,
  fileUpdateCrawlJobStatus,
  fileUpsertBookCrawlResult,
} from "./file-store.js";

export function getStorageStatus(): {
  driver: "postgres" | "file";
  databaseConfigured: boolean;
  databaseConfigSource: string | null;
  databaseUnavailableReason: string | null;
} {
  const databaseConfigured = hasDatabaseConfig();

  return {
    driver: databaseConfigured ? "postgres" : "file",
    databaseConfigured,
    databaseConfigSource: getDatabaseConfigSource(),
    databaseUnavailableReason: getDatabaseUnavailableReason(),
  };
}

export async function storageCreateCrawlJob(
  jobType: string,
  targetId: string,
  payload: Record<string, unknown>,
) {
  if (hasDatabaseConfig()) {
    return createCrawlJob(getSql(), jobType, targetId, payload);
  }

  return fileCreateCrawlJob(jobType, targetId, payload);
}

export async function storageUpdateCrawlJobStatus(
  jobId: number,
  status: string,
  incrementAttempts = false,
  errorMessage?: string | null,
): Promise<void> {
  if (hasDatabaseConfig()) {
    await updateCrawlJobStatus(getSql(), jobId, status, incrementAttempts, errorMessage);
    return;
  }

  await fileUpdateCrawlJobStatus(jobId, status, incrementAttempts, errorMessage);
}

export async function storageUpdateCrawlJobProgress(jobId: number, progress: CrawlProgress): Promise<void> {
  if (hasDatabaseConfig()) {
    await updateCrawlJobProgress(getSql(), jobId, progress);
    return;
  }

  await fileUpdateCrawlJobProgress(jobId, progress);
}

export async function storageGetCrawlJob(jobId: number) {
  if (hasDatabaseConfig()) {
    return getCrawlJob(getSql(), jobId);
  }

  return fileGetCrawlJob(jobId);
}

export async function storageUpsertBookCrawlResult(result: BookCrawlResult): Promise<void> {
  if (hasDatabaseConfig()) {
    await upsertBookCrawlResult(getSql(), result);
    return;
  }

  await fileUpsertBookCrawlResult(result);
}

export async function storageGetBookDetails(bookId: string) {
  if (hasDatabaseConfig()) {
    return getBookDetails(getSql(), bookId);
  }

  return fileGetBookDetails(bookId);
}

export async function storageListBookDetails() {
  if (hasDatabaseConfig()) {
    return listBookDetails(getSql());
  }

  return fileListBookDetails();
}

export async function storageGetBookEntries(bookId: string, page: number, pageSize: number) {
  if (hasDatabaseConfig()) {
    return getBookEntries(getSql(), bookId, page, pageSize);
  }

  return fileGetBookEntries(bookId, page, pageSize);
}

export async function storageFindIntersectingBooklists(query: IntersectionQuery) {
  if (hasDatabaseConfig()) {
    return findIntersectingBooklists(getSql(), query);
  }

  return fileFindIntersectingBooklists(query);
}
