import "dotenv/config";

import path from "node:path";

import type { CrawlConfig } from "./types.js";

export const config: CrawlConfig & { port: number } = {
  port: Number(process.env.PORT ?? 3000),
  baseUrl: process.env.QIDIANTU_BASE_URL ?? "https://www.qidiantu.com",
  delayMs: Number(process.env.QIDIANTU_DELAY_MS ?? 10000),
  timeoutMs: Number(process.env.QIDIANTU_TIMEOUT_MS ?? 20000),
  outputDir: path.resolve(process.cwd(), process.env.OUTPUT_DIR ?? "./data/books"),
};
