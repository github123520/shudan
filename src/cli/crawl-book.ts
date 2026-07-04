import path from "node:path";

import { config } from "../config.js";
import { crawlBook } from "../crawler/qidiantu.js";
import { writeJson } from "../lib/fs.js";

async function main(): Promise<void> {
  const bookId = process.argv[2];
  const maxPagesArg = process.argv[3];
  const maxPages = maxPagesArg ? Number(maxPagesArg) : undefined;

  if (!bookId) {
    throw new Error("Usage: npm run crawl:book -- <bookId> [maxPages]");
  }

  if (maxPagesArg && (!Number.isInteger(maxPages) || Number(maxPagesArg) <= 0)) {
    throw new Error("maxPages must be a positive integer");
  }

  const result = await crawlBook(bookId, config, maxPages);
  const outputPath = path.join(config.outputDir, `${bookId}.json`);

  await writeJson(outputPath, result);

  console.log(JSON.stringify({
    outputPath,
    title: result.meta.title,
    totalBooklists: result.meta.totalBooklists,
    totalPages: result.meta.totalPages,
    crawledPages: result.crawledPages,
    extractedEntries: result.entries.length,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
