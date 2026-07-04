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
