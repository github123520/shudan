import "dotenv/config";

import { closeSql, hasDatabaseConfig, runMigrations } from "../db/client.js";

async function main(): Promise<void> {
  if (!hasDatabaseConfig()) {
    throw new Error("DATABASE_URL is required for migrations");
  }

  await runMigrations();
  await closeSql();
  console.log("Migrations applied.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
