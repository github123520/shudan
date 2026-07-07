import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { config } from "../config.js";
import { inspectBookPlan, searchBooksByTitle } from "../crawler/qidiantu.js";
import {
  getStorageStatus,
  storageCreateCrawlJob,
  storageFindIntersectingBooklists,
  storageGetBookDetails,
  storageGetBookEntries,
  storageGetCrawlJob,
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

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api", async () => ({
    name: "Qidiantu Booklist Intel API",
    routes: [
      "GET /health",
      "GET /search/books?q=title",
      "GET /books/:bookId/plan",
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

    const results = await searchBooksByTitle(query, config);

    return {
      query,
      total: results.length,
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
