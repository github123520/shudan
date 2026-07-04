import path from "node:path";

import fastifyStatic from "@fastify/static";
import Fastify from "fastify";

import { config } from "./config.js";
import { registerRoutes } from "./api/routes.js";
import { hasDatabaseConfig, runMigrations } from "./db/client.js";

async function main(): Promise<void> {
  if (hasDatabaseConfig()) {
    await runMigrations();
  }

  const app = Fastify({
    logger: true,
  });

  await app.register(fastifyStatic, {
    root: path.resolve(process.cwd(), "public"),
    prefix: "/",
    index: ["index.html"],
  });

  await registerRoutes(app);

  await app.listen({
    host: "0.0.0.0",
    port: config.port,
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
