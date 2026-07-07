import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { config } from "../config.js";
import { inspectBookPlan, searchBooksByTitle } from "../crawler/qidiantu.js";
import type { BookSearchResult } from "../types.js";
import {
  getStorageStatus,
  storageCreateCrawlJob,
  storageFindIntersectingBooklists,
  storageGetBookDetails,
  storageGetBookEntries,
  storageGetCrawlJob,
  storageListBookDetails,
} from "../storage/index.js";
import { triggerBookCrawlJob } from "../jobs/crawl-book-job.js";

const createCrawlJobSchema = z.object({
  bookId: z.string().regex(/^\d+$/),
  maxPages: z.number().int().positive().max(1000).optional(),
});

const intersectionSchema = z.object({
  bookIds: z.array(z.string().regex(/^\d+$/)).min(2).max(10),
  limit: z.number().int().positive().max(100).default(20),
});

function parseMetric(value: string | null): number {
  const text = String(value ?? "").replaceAll(",", "").replaceAll("，", "").trim();
  const match = text.match(/[\d.]+/);
  if (!match) {
    return 0;
  }

  let number = Number(match[0]);
  if (!Number.isFinite(number)) {
    return 0;
  }

  if (text.includes("亿")) number *= 100000000;
  if (text.includes("万")) number *= 10000;
  if (text.includes("千")) number *= 1000;
  return number;
}

function rankBookSearchResults(results: BookSearchResult[]): Array<BookSearchResult & { autoScore: number }> {
  const rows = results.map((book) => ({
    book,
    word: parseMetric(book.wordCountText),
    favorite: parseMetric(book.favoriteCountText),
    recommendation: parseMetric(book.recommendationCountText),
  }));
  const maxWord = Math.max(...rows.map((item) => item.word), 1);
  const maxFavorite = Math.max(...rows.map((item) => item.favorite), 1);
  const maxRecommendation = Math.max(...rows.map((item) => item.recommendation), 1);

  return rows
    .map((item) => ({
      ...item.book,
      autoScore:
        (item.favorite / maxFavorite) * 4 +
        (item.recommendation / maxRecommendation) * 3 +
        (item.word / maxWord) * 2,
    }))
    .sort((a, b) => b.autoScore - a.autoScore);
}

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api", async () => ({
    name: "Qidiantu Booklist Intel API",
    routes: [
      "GET /health",
      "GET /search/books?q=title",
      "GET /books",
      "GET /books/:bookId/plan",
      "GET /books/:bookId/update-check",
      "POST /jobs/crawl-book",
      "GET /jobs/:jobId",
      "GET /books/:bookId",
      "POST /search/booklists/intersection",
    ],
  }));

  app.get("/health", async () => ({
    ok: true,
    ...getStorageStatus(),
  }));

  app.get("/search/books", async (request, reply) => {
    const { q } = request.query as { q?: string };
    const query = q?.trim();

    if (!query || query.length < 2) {
      return reply.code(400).send({ error: "Query must be at least 2 characters" });
    }

    const results = rankBookSearchResults(await searchBooksByTitle(query, config));

    return {
      query,
      total: results.length,
      best: results[0] ?? null,
      results,
    };
  });

  app.get("/books/:bookId/plan", async (request) => {
    const { bookId } = request.params as { bookId: string };
    const meta = await inspectBookPlan(bookId, config);

    return {
      ...meta,
      estimatedSecondsAtConfiguredDelay: (meta.totalPages * config.delayMs) / 1000,
    };
  });

  app.get("/books", async () => {
    const books = await storageListBookDetails();

    return {
      total: books.length,
      books,
    };
  });

  app.get("/books/:bookId/update-check", async (request, reply) => {
    const { bookId } = request.params as { bookId: string };
    const local = await storageGetBookDetails(bookId);

    if (!local) {
      return reply.code(404).send({ error: "Book not found in local library" });
    }

    const remote = await inspectBookPlan(bookId, config);
    const localCrawledPages = local.crawledPages ?? Math.ceil(local.entryCount / 10);
    const localKnownTotal = local.sourceTotalBooklists ?? local.entryCount;
    const needsCompletion = localCrawledPages < remote.totalPages;
    const newBooklists = Math.max(0, remote.totalBooklists - localKnownTotal);
    const hasUpdate = needsCompletion || newBooklists > 0;
    const suggestedRefreshPages = needsCompletion
      ? remote.totalPages
      : newBooklists > 0
        ? Math.min(remote.totalPages, Math.max(1, Math.ceil(newBooklists / 10) + 1))
        : 0;

    return {
      local,
      remote,
      hasUpdate,
      needsCompletion,
      newBooklists,
      localCrawledPages,
      suggestedRefreshPages,
      estimatedSecondsAtConfiguredDelay: suggestedRefreshPages
        ? (suggestedRefreshPages * config.delayMs) / 1000
        : 0,
    };
  });

  app.post("/jobs/crawl-book", async (request, reply) => {
    const payload = createCrawlJobSchema.parse(request.body);
    const job = await storageCreateCrawlJob("crawl_book", payload.bookId, payload);

    triggerBookCrawlJob(job.id, payload.bookId, payload.maxPages);

    return reply.code(202).send({
      jobId: job.id,
      status: job.status,
    });
  });

  app.get("/jobs/:jobId", async (request, reply) => {
    const { jobId } = request.params as { jobId: string };
    const job = await storageGetCrawlJob(Number(jobId));

    if (!job) {
      return reply.code(404).send({ error: "Job not found" });
    }

    return job;
  });

  app.get("/books/:bookId", async (request, reply) => {
    const { bookId } = request.params as { bookId: string };
    const page = Number((request.query as { page?: string }).page ?? "1");
    const pageSize = 20;
    const book = await storageGetBookDetails(bookId);

    if (!book) {
      return reply.code(404).send({ error: "Book not found" });
    }

    const entries = await storageGetBookEntries(bookId, Math.max(1, page), pageSize);

    return {
      book,
      pagination: {
        page: Math.max(1, page),
        pageSize,
        total: entries.total,
      },
      entries: entries.rows,
    };
  });

  app.post("/search/booklists/intersection", async (request, reply) => {
    const body = intersectionSchema.parse(request.body);
    const rows = await storageFindIntersectingBooklists({
      bookIds: body.bookIds,
      limit: body.limit,
    });

    return {
      query: body,
      results: rows,
    };
  });
}
