export interface CrawlConfig {
  baseUrl: string;
  delayMs: number;
  timeoutMs: number;
  outputDir: string;
}

export interface BookMeta {
  bookId: string;
  title: string;
  totalBooklists: number;
  totalPages: number;
  sourceUrl: string;
}

export interface CrawlBookJobPayload {
  bookId: string;
  maxPages?: number;
}

export interface BooklistEntry {
  page: number;
  commentText: string;
  commentParagraphs: string[];
  includedAt: string | null;
  hearts: number | null;
  booklistId: string;
  booklistTitle: string;
  booklistBookCount: number | null;
  booklistFollowerCount: number | null;
  booklistUrl: string;
}

export interface BookCrawlResult {
  meta: BookMeta;
  entries: BooklistEntry[];
  crawledPages: number;
  crawledAt: string;
}
