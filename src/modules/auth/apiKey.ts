import { eq } from "drizzle-orm";
import type { FastifyRequest } from "fastify";
import type { AppConfig } from "../../config.js";
import type { Db } from "../../db/client.js";
import { apiKeys } from "../../db/schema.js";
import { hashApiKey } from "../../lib/apiKeys.js";
import { RateLimitError, UnauthorizedError } from "../../lib/errors.js";
import type { SlidingWindowLimiter } from "./rateLimit.js";

/** Verificateur de cle API, utilisable comme preHandler Fastify. */
export type ApiKeyGuard = (request: FastifyRequest) => Promise<void>;

/**
 * Construit un preHandler qui exige une cle API active dans l'en-tete X-API-Key,
 * puis applique la limite de debit propre a la cle.
 * La cle est comparee par empreinte poivree ; elle n'est jamais stockee en clair.
 */
export function createApiKeyGuard(
  db: Db,
  config: AppConfig,
  limiter: SlidingWindowLimiter,
): ApiKeyGuard {
  return async function guard(request: FastifyRequest): Promise<void> {
    const header = request.headers["x-api-key"];
    const raw = Array.isArray(header) ? header[0] : header;
    if (typeof raw !== "string" || raw.length === 0) {
      throw new UnauthorizedError();
    }

    const [key] = await db
      .select({
        id: apiKeys.id,
        isActive: apiKeys.isActive,
        rateLimitPerMin: apiKeys.rateLimitPerMin,
      })
      .from(apiKeys)
      .where(eq(apiKeys.keyHash, hashApiKey(raw, config.API_KEY_PEPPER)))
      .limit(1);

    if (!key || !key.isActive) {
      throw new UnauthorizedError();
    }
    if (!limiter.consume(key.id, key.rateLimitPerMin)) {
      throw new RateLimitError();
    }

    request.apiKeyId = key.id;
  };
}
