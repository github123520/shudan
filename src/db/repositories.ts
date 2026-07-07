import type { Sql } from "postgres";

import { sha1 } from "../lib/hash.js";
import type { BookCrawlResult, CrawlProgress } from "../types.js";

export interface CrawlJobRecord {
  id: number;
  job_type: string;
  target_id: string;
  status: string;
  attempts: number;
  payload: Record<string, unknown>;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface BookDetails {
  id: string;
  title: string;
  qidiantuUrl: string;
  fetchedAt: string;
  entryCount: number;
  latestIncludedAt: string | null;
  sourceTotalBooklists?: number | null;
  sourceTotalPages?: number | null;
  crawledPages?: number | null;
}

export interface IntersectionQuery {
  bookIds: string[];
  limit: number;
}

export async function upsertBookCrawlResult(sql: Sql, result: BookCrawlResult): Promise<void> {
  await sql.begin(async (tx) => {
    await tx`
      INSERT INTO books (id, title, qidiantu_url, fetched_at)
      VALUES (${result.meta.bookId}, ${result.meta.title}, ${result.meta.sourceUrl}, NOW())
      ON CONFLICT (id)
      DO UPDATE SET
        title = EXCLUDED.title,
        qidiantu_url = EXCLUDED.qidiantu_url,
        fetched_at = NOW()
    `;

    for (const entry of result.entries) {
      await tx`
        INSERT INTO booklists (id, title, book_count, follower_count, qidiantu_url, fetched_at)
        VALUES (
          ${entry.booklistId},
          ${entry.booklistTitle},
          ${entry.booklistBookCount},
          ${entry.booklistFollowerCount},
          ${entry.booklistUrl},
          NOW()
        )
        ON CONFLICT (id)
        DO UPDATE SET
          title = EXCLUDED.title,
          book_count = EXCLUDED.book_count,
          follower_count = EXCLUDED.follower_count,
          qidiantu_url = EXCLUDED.qidiantu_url,
          fetched_at = NOW()
      `;

      const contentHash = sha1([
        result.meta.bookId,
        entry.booklistId,
        entry.includedAt ?? "",
        entry.commentText,
      ].join("|"));

      await tx`
        INSERT INTO booklist_entries (
          book_id,
          booklist_id,
          included_at,
          comment_text,
          hearts,
          source_page,
          content_hash
        )
        VALUES (
          ${result.meta.bookId},
          ${entry.booklistId},
          ${entry.includedAt},
          ${entry.commentText},
          ${entry.hearts},
          ${entry.page},
          ${contentHash}
        )
        ON CONFLICT (book_id, booklist_id, content_hash)
        DO NOTHING
      `;
    }
  });
}

export async function createCrawlJob(
  sql: Sql,
  jobType: string,
  targetId: string,
  payload: Record<string, unknown>,
): Promise<CrawlJobRecord> {
  const [job] = await sql<CrawlJobRecord[]>`
    INSERT INTO crawl_jobs (job_type, target_id, status, payload)
    VALUES (${jobType}, ${targetId}, 'queued', ${sql.json(payload as never)})
    RETURNING *
  `;

  return job;
}

export async function updateCrawlJobStatus(
  sql: Sql,
  jobId: number,
  status: string,
  incrementAttempts = false,
  errorMessage?: string | null,
): Promise<void> {
  await sql`
    UPDATE crawl_jobs
    SET
      status = ${status},
      attempts = attempts + ${incrementAttempts ? 1 : 0},
      error_message = ${errorMessage ?? null},
      updated_at = NOW()
    WHERE id = ${jobId}
  `;
}

export async function updateCrawlJobProgress(
  sql: Sql,
  jobId: number,
  progress: CrawlProgress,
): Promise<void> {
  await sql`
    UPDATE crawl_jobs
    SET
      payload = payload || ${sql.json({ progress } as never)}::jsonb,
      updated_at = NOW()
    WHERE id = ${jobId}
  `;
}

export async function getCrawlJob(sql: Sql, jobId: number): Promise<CrawlJobRecord | null> {
  const [job] = await sql<CrawlJobRecord[]>`
    SELECT *
    FROM crawl_jobs
    WHERE id = ${jobId}
  `;

  return job ?? null;
}

export async function getBookDetails(sql: Sql, bookId: string): Promise<BookDetails | null> {
  const [book] = await sql<BookDetails[]>`
    SELECT
      b.id::text AS id,
      b.title,
      b.qidiantu_url AS "qidiantuUrl",
      b.fetched_at::text AS "fetchedAt",
      COUNT(be.id)::int AS "entryCount",
      MAX(be.included_at)::text AS "latestIncludedAt",
      NULL::int AS "sourceTotalBooklists",
      NULL::int AS "sourceTotalPages",
      NULL::int AS "crawledPages"
    FROM books b
    LEFT JOIN booklist_entries be ON be.book_id = b.id
    WHERE b.id = ${bookId}
    GROUP BY b.id
  `;

  return book ?? null;
}

export async function listBookDetails(sql: Sql): Promise<BookDetails[]> {
  return sql<BookDetails[]>`
    SELECT
      b.id::text AS id,
      b.title,
      b.qidiantu_url AS "qidiantuUrl",
      b.fetched_at::text AS "fetchedAt",
      COUNT(be.id)::int AS "entryCount",
      MAX(be.included_at)::text AS "latestIncludedAt",
      NULL::int AS "sourceTotalBooklists",
      NULL::int AS "sourceTotalPages",
      NULL::int AS "crawledPages"
    FROM books b
    LEFT JOIN booklist_entries be ON be.book_id = b.id
    GROUP BY b.id
    ORDER BY b.fetched_at DESC, b.id DESC
  `;
}

export async function getBookEntries(
  sql: Sql,
  bookId: string,
  page: number,
  pageSize: number,
): Promise<{ total: number; rows: Array<Record<string, unknown>> }> {
  const offset = (page - 1) * pageSize;

  const [countRow] = await sql<{ total: number }[]>`
    SELECT COUNT(*)::int AS total
    FROM booklist_entries
    WHERE book_id = ${bookId}
  `;

  const rows = await sql<Record<string, unknown>[]>`
    SELECT
      be.id,
      be.included_at::text AS "includedAt",
      be.comment_text AS "commentText",
      be.hearts,
      be.source_page AS page,
      bl.id::text AS "booklistId",
      bl.title AS "booklistTitle",
      bl.book_count AS "booklistBookCount",
      bl.follower_count AS "booklistFollowerCount",
      bl.qidiantu_url AS "booklistUrl"
    FROM booklist_entries be
    JOIN booklists bl ON bl.id = be.booklist_id
    WHERE be.book_id = ${bookId}
    ORDER BY COALESCE(be.included_at, DATE '1970-01-01') DESC, be.id DESC
    LIMIT ${pageSize}
    OFFSET ${offset}
  `;

  return {
    total: countRow?.total ?? 0,
    rows,
  };
}

export async function findIntersectingBooklists(
  sql: Sql,
  query: IntersectionQuery,
): Promise<Array<Record<string, unknown>>> {
  const ids = query.bookIds.map((id) => Number(id));
  const requiredCount = ids.length;

  return sql<Record<string, unknown>[]>`
    SELECT
      bl.id::text AS "booklistId",
      bl.title AS "booklistTitle",
      bl.book_count AS "booklistBookCount",
      bl.follower_count AS "booklistFollowerCount",
      bl.qidiantu_url AS "booklistUrl",
      COUNT(DISTINCT be.book_id)::int AS "matchedBooks",
      ARRAY_AGG(DISTINCT be.book_id::text ORDER BY be.book_id::text) AS "matchedBookIds"
    FROM booklist_entries be
    JOIN booklists bl ON bl.id = be.booklist_id
    WHERE be.book_id = ANY(${sql.array(ids)})
    GROUP BY bl.id
    HAVING COUNT(DISTINCT be.book_id) = ${requiredCount}
    ORDER BY COALESCE(bl.follower_count, 0) DESC, COALESCE(bl.book_count, 999999) ASC, bl.id DESC
    LIMIT ${query.limit}
  `;
}
