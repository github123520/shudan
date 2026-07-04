import * as cheerio from "cheerio";

import { sha1 } from "../lib/hash.js";
import { sleep } from "../lib/sleep.js";
import type { BookCrawlResult, BookMeta, BooklistEntry, CrawlConfig } from "../types.js";

const PAGE_SIZE = 10;

function bookInfoUrl(baseUrl: string, bookId: string, pageIndex = 0): string {
  if (pageIndex <= 0) {
    return `${baseUrl}/info/${bookId}`;
  }

  return `${baseUrl}/info/${bookId}/${pageIndex}`;
}

async function fetchHtml(url: string, timeoutMs: number): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; BooklistIntel/0.1; +https://example.local)",
        "accept-language": "zh-CN,zh;q=0.9",
      },
    });

    if (!response.ok) {
      throw new Error(`Fetch failed: ${response.status} ${response.statusText}`);
    }

    return await response.text();
  } finally {
    clearTimeout(timeoutId);
  }
}

function parseTitle($: cheerio.CheerioAPI): string {
  return $("h1.h1-table").first().text().trim();
}

function parseTotalBooklists($: cheerio.CheerioAPI): number {
  const alertText = $(".alert.alert-info").first().text().replace(/\s+/g, " ").trim();
  const match = alertText.match(/共被(\d+)份书单收录过/);

  if (!match) {
    throw new Error("Could not parse total booklist count");
  }

  return Number(match[1]);
}

function parseMeta(bookId: string, sourceUrl: string, html: string): BookMeta {
  const $ = cheerio.load(html);
  const title = parseTitle($);
  const totalBooklists = parseTotalBooklists($);
  const totalPages = Math.max(1, Math.ceil(totalBooklists / PAGE_SIZE));

  return {
    bookId,
    title,
    totalBooklists,
    totalPages,
    sourceUrl,
  };
}

function parsePanelEntry(panel: cheerio.Cheerio<any>, page: number, baseUrl: string): BooklistEntry | null {
  const panelBody = panel.find(".panel-body").first();
  const panelFooter = panel.find(".panel-footer").first();

  if (panelBody.length === 0 || panelFooter.length === 0) {
    return null;
  }

  const booklistLink = panelFooter.find("a[href^='/booklist/']").first();

  if (booklistLink.length === 0) {
    return null;
  }

  const booklistHref = booklistLink.attr("href");
  if (!booklistHref) {
    return null;
  }

  const booklistIdMatch = booklistHref.match(/\/booklist\/(\d+)/);
  if (!booklistIdMatch) {
    return null;
  }

  const paragraphs = panelBody
    .find("p")
    .toArray()
    .map((p) => cheerio.load(p).text().replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const bodyText = panelBody.text().replace(/\s+/g, " ").trim();
  const includedAtMatch = bodyText.match(/收录于:([0-9-]+)/);
  const heartsMatch = bodyText.match(/❤️\s*(\d+)/);

  const footerText = panelFooter.text().replace(/\s+/g, " ").trim();
  const countMatch = footerText.match(/\((\d+)本书，(\d+)人关注\)/);

  return {
    page,
    commentText: paragraphs.join("\n"),
    commentParagraphs: paragraphs,
    includedAt: includedAtMatch?.[1] ?? null,
    hearts: heartsMatch ? Number(heartsMatch[1]) : null,
    booklistId: booklistIdMatch[1],
    booklistTitle: booklistLink.text().trim(),
    booklistBookCount: countMatch ? Number(countMatch[1]) : null,
    booklistFollowerCount: countMatch ? Number(countMatch[2]) : null,
    booklistUrl: `${baseUrl}${booklistHref}`,
  };
}

function parseEntries(html: string, page: number, baseUrl: string): BooklistEntry[] {
  const $ = cheerio.load(html);

  return $(".panel.panel-default")
    .toArray()
    .map((panel) => parsePanelEntry($(panel), page, baseUrl))
    .filter((entry): entry is BooklistEntry => entry !== null);
}

function dedupeEntries(entries: BooklistEntry[]): BooklistEntry[] {
  const seen = new Set<string>();

  return entries.filter((entry) => {
    const key = sha1([
      entry.booklistId,
      entry.includedAt ?? "",
      entry.commentText,
    ].join("|"));

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

export async function inspectBookPlan(bookId: string, config: CrawlConfig): Promise<BookMeta> {
  const sourceUrl = bookInfoUrl(config.baseUrl, bookId, 0);
  const html = await fetchHtml(sourceUrl, config.timeoutMs);
  return parseMeta(bookId, sourceUrl, html);
}

export async function crawlBook(bookId: string, config: CrawlConfig, maxPages?: number): Promise<BookCrawlResult> {
  const sourceUrl = bookInfoUrl(config.baseUrl, bookId, 0);
  const firstHtml = await fetchHtml(sourceUrl, config.timeoutMs);
  const meta = parseMeta(bookId, sourceUrl, firstHtml);

  const allEntries: BooklistEntry[] = [];
  allEntries.push(...parseEntries(firstHtml, 1, config.baseUrl));

  const lastPage = maxPages ? Math.min(meta.totalPages, maxPages) : meta.totalPages;

  for (let page = 2; page <= lastPage; page += 1) {
    await sleep(config.delayMs);
    const html = await fetchHtml(bookInfoUrl(config.baseUrl, bookId, page - 1), config.timeoutMs);
    allEntries.push(...parseEntries(html, page, config.baseUrl));
  }

  return {
    meta,
    entries: dedupeEntries(allEntries),
    crawledPages: lastPage,
    crawledAt: new Date().toISOString(),
  };
}
