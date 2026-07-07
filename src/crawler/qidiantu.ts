import * as cheerio from "cheerio";

import { sha1 } from "../lib/hash.js";
import { sleep } from "../lib/sleep.js";
import type {
  BookCrawlResult,
  BookMeta,
  BookSearchResult,
  BooklistEntry,
  CrawlBookOptions,
  CrawlConfig,
  CrawlProgress,
} from "../types.js";

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

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function parseTitle($: cheerio.CheerioAPI): string {
  return $("h1.h1-table").first().text().trim();
}

function parseTotalBooklists($: cheerio.CheerioAPI): number {
  const alertText = normalizeText($(".alert.alert-info").first().text());
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
    .map((p) => normalizeText(cheerio.load(p).text()))
    .filter(Boolean);

  const bodyText = normalizeText(panelBody.text());
  const includedAtMatch = bodyText.match(/收录于:([0-9-]+)/);
  const heartsMatch = bodyText.match(/❤️\s*(\d+)/);

  const footerText = normalizeText(panelFooter.text());
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

export async function searchBooksByTitle(query: string, config: CrawlConfig): Promise<BookSearchResult[]> {
  const url = `${config.baseUrl}/bookxyy/${encodeURIComponent(query)}`;
  const html = await fetchHtml(url, config.timeoutMs);
  const $ = cheerio.load(html);
  const results: BookSearchResult[] = [];
  const seen = new Set<string>();

  $("a[href^='/info/'] h4").each((_, heading) => {
    const headingNode = $(heading);
    const bookAnchor = headingNode.closest("a[href^='/info/']");
    const bookHref = bookAnchor.attr("href");
    if (!bookHref) {
      return;
    }

    const match = bookHref.match(/\/info\/(\d+)/);
    if (!match) {
      return;
    }

    const bookId = match[1];
    if (seen.has(bookId)) {
      return;
    }

    const table = headingNode.closest("table");
    const rows = table.find("tr").toArray().map((row) => normalizeText($(row).text()));
    const authorRow = rows.find((row) => row.startsWith("作者：")) ?? "";
    const tagRow = rows.find((row) => row.startsWith("标签:")) ?? "";
    const countRow = rows.find((row) => row.includes("总收藏:")) ?? "";

    const authorMatch = authorRow.match(/^作者：(.+?)(?:\((.*?)\))?$/);
    const tagMatch = tagRow.match(/^标签:([^\s]+)\s+(.+?)\s+状态:(.+)$/);
    const favoriteMatch = countRow.match(/总收藏:([^\s]+)/);
    const recommendationMatch = countRow.match(/总推荐:([^\s]+)/);
    const leaderMatch = countRow.match(/盟主数:([^\s]+)/);
    const wordCountRow = rows.find((row) => row.startsWith("总字数:")) ?? "";
    const wordCountMatch = wordCountRow.match(/总字数:([^\s]+)/);

    const cover = $(`a[href='${bookHref}'] img`).first().attr("src") ?? null;

    results.push({
      bookId,
      title: headingNode.text().trim(),
      authorName: authorMatch?.[1]?.trim() ?? null,
      authorLevel: authorMatch?.[2]?.trim() ?? null,
      category: tagMatch?.[1]?.trim() ?? null,
      subCategory: tagMatch?.[2]?.trim() ?? null,
      status: tagMatch?.[3]?.trim() ?? null,
      wordCountText: wordCountMatch?.[1]?.trim() ?? null,
      favoriteCountText: favoriteMatch?.[1]?.trim() ?? null,
      recommendationCountText: recommendationMatch?.[1]?.trim() ?? null,
      leaderCountText: leaderMatch?.[1]?.trim() ?? null,
      coverUrl: cover,
      bookUrl: `${config.baseUrl}${bookHref}`,
    });

    seen.add(bookId);
  });

  return results;
}

function normalizeCrawlOptions(options?: number | CrawlBookOptions): CrawlBookOptions {
  if (typeof options === "number") {
    return { maxPages: options };
  }

  return options ?? {};
}

async function emitProgress(
  options: CrawlBookOptions,
  progress: Omit<CrawlProgress, "updatedAt">,
): Promise<void> {
  if (!options.onProgress) {
    return;
  }

  await options.onProgress({
    ...progress,
    updatedAt: new Date().toISOString(),
  });
}

export async function crawlBook(
  bookId: string,
  config: CrawlConfig,
  optionsInput?: number | CrawlBookOptions,
): Promise<BookCrawlResult> {
  const options = normalizeCrawlOptions(optionsInput);
  const sourceUrl = bookInfoUrl(config.baseUrl, bookId, 0);
  const firstHtml = await fetchHtml(sourceUrl, config.timeoutMs);
  const meta = parseMeta(bookId, sourceUrl, firstHtml);
  const lastPage = options.maxPages ? Math.min(meta.totalPages, options.maxPages) : meta.totalPages;

  const allEntries: BooklistEntry[] = [];
  await emitProgress(options, {
    phase: "planning",
    currentPage: 0,
    targetPages: lastPage,
    sourceTotalPages: meta.totalPages,
    totalBooklists: meta.totalBooklists,
    crawledEntries: 0,
  });

  allEntries.push(...parseEntries(firstHtml, 1, config.baseUrl));
  await emitProgress(options, {
    phase: "crawling",
    currentPage: 1,
    targetPages: lastPage,
    sourceTotalPages: meta.totalPages,
    totalBooklists: meta.totalBooklists,
    crawledEntries: allEntries.length,
  });

  for (let page = 2; page <= lastPage; page += 1) {
    await sleep(config.delayMs);
    const html = await fetchHtml(bookInfoUrl(config.baseUrl, bookId, page - 1), config.timeoutMs);
    allEntries.push(...parseEntries(html, page, config.baseUrl));
    await emitProgress(options, {
      phase: "crawling",
      currentPage: page,
      targetPages: lastPage,
      sourceTotalPages: meta.totalPages,
      totalBooklists: meta.totalBooklists,
      crawledEntries: allEntries.length,
    });
  }

  const entries = dedupeEntries(allEntries);
  await emitProgress(options, {
    phase: "completed",
    currentPage: lastPage,
    targetPages: lastPage,
    sourceTotalPages: meta.totalPages,
    totalBooklists: meta.totalBooklists,
    crawledEntries: entries.length,
  });

  return {
    meta,
    entries,
    crawledPages: lastPage,
    crawledAt: new Date().toISOString(),
  };
}
