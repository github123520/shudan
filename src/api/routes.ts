import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { config } from "../config.js";
import { inspectBookPlan } from "../crawler/qidiantu.js";
import { getSql, hasDatabaseConfig } from "../db/client.js";
import {
  createCrawlJob,
  findIntersectingBooklists,
  getBookDetails,
  getBookEntries,
  getCrawlJob,
} from "../db/repositories.js";
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
      "GET /books/:bookId/plan",
      "POST /jobs/crawl-book",
      "GET /jobs/:jobId",
      "GET /books/:bookId",
      "POST /search/booklists/intersection",
    ],
  }));

  app.get("/health", async () => ({ ok: true }));

  app.get("/books/:bookId/plan", async (request) => {
    const { bookId } = request.params as { bookId: string };
    const meta = await inspectBookPlan(bookId, config);

    return {
      ...meta,
      estimatedSecondsAtConfiguredDelay: meta.totalPages * config.delayMs / 1000,
    };
  });

  app.post("/jobs/crawl-book", async (request, reply) => {
    if (!hasDatabaseConfig()) {
      return reply.code(500).send({ error: "DATABASE_URL is not configured" });
    }

    const payload = createCrawlJobSchema.parse(request.body);
    const sql = getSql();
    const job = await createCrawlJob(sql, "crawl_book", payload.bookId, payload);

    triggerBookCrawlJob(job.id, payload.bookId, payload.maxPages);

    return reply.code(202).send({
      jobId: job.id,
      status: job.status,
    });
  });

  app.get("/jobs/:jobId", async (request, reply) => {
    if (!hasDatabaseConfig()) {
      return reply.code(500).send({ error: "DATABASE_URL is not configured" });
    }

    const { jobId } = request.params as { jobId: string };
    const sql = getSql();
    const job = await getCrawlJob(sql, Number(jobId));

    if (!job) {
      return reply.code(404).send({ error: "Job not found" });
    }

    return job;
  });

  app.get("/books/:bookId", async (request, reply) => {
    if (!hasDatabaseConfig()) {
      return reply.code(500).send({ error: "DATABASE_URL is not configured" });
    }

    const { bookId } = request.params as { bookId: string };
    const page = Number((request.query as { page?: string }).page ?? "1");
    const pageSize = 20;
    const sql = getSql();
    const book = await getBookDetails(sql, bookId);

    if (!book) {
      return reply.code(404).send({ error: "Book not found" });
    }

    const entries = await getBookEntries(sql, bookId, Math.max(1, page), pageSize);

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
    if (!hasDatabaseConfig()) {
      return reply.code(500).send({ error: "DATABASE_URL is not configured" });
    }

    const body = intersectionSchema.parse(request.body);
    const sql = getSql();
    const rows = await findIntersectingBooklists(sql, {
      bookIds: body.bookIds,
      limit: body.limit,
    });

    return {
      query: body,
      results: rows,
    };
  });
}
