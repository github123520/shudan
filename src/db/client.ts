import fs from "node:fs";
import path from "node:path";

import postgres from "postgres";

const DATABASE_URL_ENV_KEYS = [
  "DATABASE_URL",
  "POSTGRES_CONNECTION_STRING",
  "POSTGRES_URI",
  "POSTGRES_URL",
  "POSTGRES_PRISMA_URL",
  "DATABASE_PUBLIC_URL",
] as const;

function getDirectDatabaseUrl(): string | undefined {
  for (const key of DATABASE_URL_ENV_KEYS) {
    const value = process.env[key]?.trim();

    if (value) {
      return value;
    }
  }

  return undefined;
}

function buildDatabaseUrlFromParts(): string | undefined {
  const host = process.env.POSTGRES_HOST?.trim();
  const port = process.env.POSTGRES_PORT?.trim() ?? "5432";
  const user = (process.env.POSTGRES_USER ?? process.env.POSTGRES_USERNAME)?.trim();
  const password = process.env.POSTGRES_PASSWORD?.trim();
  const database = (process.env.POSTGRES_DATABASE ?? process.env.POSTGRES_DB)?.trim();

  if (!host || !user || !password || !database) {
    return undefined;
  }

  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${encodeURIComponent(database)}`;
}

function resolveDatabaseUrl(): string {
  const url = getDirectDatabaseUrl() ?? buildDatabaseUrlFromParts();

  if (!url) {
    throw new Error("A PostgreSQL connection string is required");
  }

  return url;
}

export function hasDatabaseConfig(): boolean {
  return Boolean(getDirectDatabaseUrl() ?? buildDatabaseUrlFromParts());
}

export function getDatabaseConfigSource(): string | null {
  for (const key of DATABASE_URL_ENV_KEYS) {
    if (process.env[key]?.trim()) {
      return key;
    }
  }

  return buildDatabaseUrlFromParts() ? "POSTGRES_*" : null;
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
