import fs from "node:fs/promises";
import path from "node:path";

import { config } from "../config.js";
import { sha1 } from "../lib/hash.js";
import type { BookCrawlResult, BooklistEntry, CrawlProgress } from "../types.js";
import type { BookDetails, CrawlJobRecord, IntersectionQuery } from "../db/repositories.js";

interface FileStoreState {
  jobs: CrawlJobRecord[];
}

const statePath = path.join(config.storageDir, "state.json");
const booksDir = path.join(config.storageDir, "books");

async function ensureStore(): Promise<void> {
  await fs.mkdir(booksDir, { recursive: true });
}

async function readJson<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return fallback;
    }

    throw error;
  }
}

async function writeJson(filePath: string, data: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function readState(): Promise<FileStoreState> {
  await ensureStore();
  return readJson<FileStoreState>(statePath, { jobs: [] });
}

async function writeState(state: FileStoreState): Promise<void> {
  await writeJson(statePath, state);
}

function bookPath(bookId: string): string {
  return path.join(booksDir, `${bookId}.json`);
}

function now(): string {
  return new Date().toISOString();
}

function entryKey(entry: BooklistEntry): string {
  return sha1([
    entry.booklistId,
    entry.includedAt ?? "",
    entry.commentText,
  ].join("|"));
}

export async function fileCreateCrawlJob(
  jobType: string,
  targetId: string,
  payload: Record<string, unknown>,
): Promise<CrawlJobRecord> {
  const state = await readState();
  const id = state.jobs.reduce((max, job) => Math.max(max, job.id), 0) + 1;
  const timestamp = now();
  const job: CrawlJobRecord = {
    id,
    job_type: jobType,
    target_id: targetId,
    status: "queued",
    attempts: 0,
    payload,
    error_message: null,
    created_at: timestamp,
    updated_at: timestamp,
  };

  state.jobs.push(job);
  await writeState(state);
  return job;
}

export async function fileUpdateCrawlJobStatus(
  jobId: number,
  status: string,
  incrementAttempts = false,
  errorMessage?: string | null,
): Promise<void> {
  const state = await readState();
  const job = state.jobs.find((item) => item.id === jobId);

  if (!job) {
    return;
  }

  job.status = status;
  job.attempts += incrementAttempts ? 1 : 0;
  job.error_message = errorMessage ?? null;
  job.updated_at = now();
  await writeState(state);
}

export async function fileUpdateCrawlJobProgress(jobId: number, progress: CrawlProgress): Promise<void> {
  const state = await readState();
  const job = state.jobs.find((item) => item.id === jobId);

  if (!job) {
    return;
  }

  job.payload = {
    ...job.payload,
    progress,
  };
  job.updated_at = now();
  await writeState(state);
}

export async function fileGetCrawlJob(jobId: number): Promise<CrawlJobRecord | null> {
  const state = await readState();
  return state.jobs.find((job) => job.id === jobId) ?? null;
}

export async function fileUpsertBookCrawlResult(result: BookCrawlResult): Promise<void> {
  const existing = await readJson<BookCrawlResult | null>(bookPath(result.meta.bookId), null);
  const merged = new Map<string, BooklistEntry>();

  for (const entry of existing?.entries ?? []) {
    merged.set(entryKey(entry), entry);
  }

  for (const entry of result.entries) {
    merged.set(entryKey(entry), entry);
  }

  await writeJson(bookPath(result.meta.bookId), {
    ...result,
    crawledPages: Math.max(existing?.crawledPages ?? 0, result.crawledPages),
    entries: [...merged.values()],
  });
}

export async function fileGetBookDetails(bookId: string): Promise<BookDetails | null> {
  const result = await readJson<BookCrawlResult | null>(bookPath(bookId), null);

  if (!result) {
    return null;
  }

  const includedDates = result.entries
    .map((entry) => entry.includedAt)
    .filter((value): value is string => Boolean(value));

  return {
    id: result.meta.bookId,
    title: result.meta.title,
    qidiantuUrl: result.meta.sourceUrl,
    fetchedAt: result.crawledAt,
    entryCount: result.entries.length,
    latestIncludedAt: includedDates.sort().at(-1) ?? null,
    sourceTotalBooklists: result.meta.totalBooklists,
    sourceTotalPages: result.meta.totalPages,
    crawledPages: result.crawledPages,
  };
}

export async function fileListBookDetails(): Promise<BookDetails[]> {
  await ensureStore();

  let files: string[];
  try {
    files = await fs.readdir(booksDir);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return [];
    }

    throw error;
  }

  const books = await Promise.all(
    files
      .filter((file) => file.endsWith(".json"))
      .map(async (file) => fileGetBookDetails(path.basename(file, ".json"))),
  );

  return books
    .filter((book): book is BookDetails => book !== null)
    .sort((a, b) => String(b.fetchedAt).localeCompare(String(a.fetchedAt)));
}

export async function fileGetBookEntries(
  bookId: string,
  page: number,
  pageSize: number,
): Promise<{ total: number; rows: Array<Record<string, unknown>> }> {
  const result = await readJson<BookCrawlResult | null>(bookPath(bookId), null);

  if (!result) {
    return { total: 0, rows: [] };
  }

  const rows = result.entries
    .slice()
    .sort((a: BooklistEntry, b: BooklistEntry) => (b.includedAt ?? "").localeCompare(a.includedAt ?? ""))
    .slice((page - 1) * pageSize, page * pageSize)
    .map((entry: BooklistEntry, index: number) => ({
      id: index + 1,
      includedAt: entry.includedAt,
      commentText: entry.commentText,
      hearts: entry.hearts,
      page: entry.page,
      booklistId: entry.booklistId,
      booklistTitle: entry.booklistTitle,
      booklistBookCount: entry.booklistBookCount,
      booklistFollowerCount: entry.booklistFollowerCount,
      booklistUrl: entry.booklistUrl,
    }));

  return {
    total: result.entries.length,
    rows,
  };
}

export async function fileFindIntersectingBooklists(
  query: IntersectionQuery,
): Promise<Array<Record<string, unknown>>> {
  const grouped = new Map<string, {
    booklistId: string;
    booklistTitle: string;
    booklistBookCount: number | null;
    booklistFollowerCount: number | null;
    booklistUrl: string;
    matchedBookIds: Set<string>;
  }>();

  for (const bookId of query.bookIds) {
    const result = await readJson<BookCrawlResult | null>(bookPath(bookId), null);

    for (const entry of result?.entries ?? []) {
      const item = grouped.get(entry.booklistId) ?? {
        booklistId: entry.booklistId,
        booklistTitle: entry.booklistTitle,
        booklistBookCount: entry.booklistBookCount,
        booklistFollowerCount: entry.booklistFollowerCount,
        booklistUrl: entry.booklistUrl,
        matchedBookIds: new Set<string>(),
      };

      item.matchedBookIds.add(bookId);
      grouped.set(entry.booklistId, item);
    }
  }

  return [...grouped.values()]
    .filter((item) => item.matchedBookIds.size === query.bookIds.length)
    .sort((a, b) => (b.booklistFollowerCount ?? 0) - (a.booklistFollowerCount ?? 0))
    .slice(0, query.limit)
    .map((item) => ({
      booklistId: item.booklistId,
      booklistTitle: item.booklistTitle,
      booklistBookCount: item.booklistBookCount,
      booklistFollowerCount: item.booklistFollowerCount,
      booklistUrl: item.booklistUrl,
      matchedBooks: item.matchedBookIds.size,
      matchedBookIds: [...item.matchedBookIds],
    }));
}
