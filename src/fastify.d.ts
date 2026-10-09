import type { AppConfig } from "./config.js";
import type { Db } from "./db/client.js";

declare module "fastify" {
  interface FastifyInstance {
    db: Db;
    config: AppConfig;
  }
  interface FastifyRequest {
    apiKeyId?: string;
  }
}
