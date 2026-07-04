declare module "@fastify/static" {
  import type { FastifyPluginAsync } from "fastify";

  const plugin: FastifyPluginAsync<Record<string, unknown>>;
  export default plugin;
}
