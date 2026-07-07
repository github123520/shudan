export interface CrawlConfig {
  baseUrl: string;
  delayMs: number;
  timeoutMs: number;
  outputDir: string;
  storageDir: string;
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

export interface BookSearchResult {
  bookId: string;
  title: string;
  authorName: string | null;
  authorLevel: string | null;
  category: string | null;
  subCategory: string | null;
  status: string | null;
  wordCountText: string | null;
  favoriteCountText: string | null;
  recommendationCountText: string | null;
  leaderCountText: string | null;
  coverUrl: string | null;
  bookUrl: string;
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
