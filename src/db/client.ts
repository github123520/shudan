import fs from "node:fs";
import path from "node:path";

import postgres from "postgres";

function resolveDatabaseUrl(): string {
  const url = process.env.DATABASE_URL
    ?? process.env.POSTGRES_URL
    ?? process.env.POSTGRES_PRISMA_URL
    ?? process.env.DATABASE_PUBLIC_URL;

  if (!url) {
    throw new Error("DATABASE_URL is required");
  }

  return url;
}

export function hasDatabaseConfig(): boolean {
  return Boolean(
    process.env.DATABASE_URL
      ?? process.env.POSTGRES_URL
      ?? process.env.POSTGRES_PRISMA_URL
      ?? process.env.DATABASE_PUBLIC_URL,
  );
}

let sqlClient: postgres.Sql | null = null;

export function getSql(): postgres.Sql {
  if (!sqlClient) {
    sqlClient = postgres(resolveDatabaseUrl(), {
      max: 5,
      prepare: false,
      idle_timeout: 20,
      connect_timeout: 15,
    });
  }

  return sqlClient;
}

export async function runMigrations(): Promise<void> {
  const schemaPath = path.resolve(process.cwd(), "src/db/schema.sql");
  const schema = fs.readFileSync(schemaPath, "utf8");
  await getSql().unsafe(schema);
}

export async function closeSql(): Promise<void> {
  if (sqlClient) {
    await sqlClient.end({ timeout: 5 });
    sqlClient = null;
  }
}
