import path from "node:path";

import fastifyStatic from "@fastify/static";
import Fastify from "fastify";

import { config } from "./config.js";
import { registerRoutes } from "./api/routes.js";
import { hasDatabaseConfig, markDatabaseUnavailable, runMigrations } from "./db/client.js";

async function main(): Promise<void> {
  if (hasDatabaseConfig()) {
    try {
      await runMigrations();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      markDatabaseUnavailable(message);
      console.warn(`PostgreSQL unavailable, falling back to file storage: ${message}`);
    }
  }

  const app = Fastify({
    logger: true,
  });

  await registerRoutes(app);

  await app.register(fastifyStatic, {
    root: path.resolve(process.cwd(), "public"),
    prefix: "/",
    index: ["index.html"],
  });

  await app.listen({
    host: "0.0.0.0",
    port: config.port,
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
