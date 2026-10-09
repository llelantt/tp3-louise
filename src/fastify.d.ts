import type { AppConfig } from "./config.js";
import type { Db } from "./db/client.js";
import type { ApiKeyGuard } from "./modules/auth/apiKey.js";

declare module "fastify" {
  interface FastifyInstance {
    db: Db;
    config: AppConfig;
    authGuard: ApiKeyGuard;
  }
  interface FastifyRequest {
    apiKeyId?: string;
  }
}
