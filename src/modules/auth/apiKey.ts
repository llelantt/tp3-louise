import { eq } from "drizzle-orm";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { AppConfig } from "../../config.js";
import type { Db } from "../../db/client.js";
import { apiKeys } from "../../db/schema.js";
import { hashApiKey, isValidApiKeyFormat } from "../../lib/apiKeys.js";
import { RateLimitError, UnauthorizedError } from "../../lib/errors.js";
import type { SlidingWindowLimiter } from "./rateLimit.js";

/** Verificateur de cle API, utilisable comme preHandler Fastify. */
export type ApiKeyGuard = (request: FastifyRequest, reply: FastifyReply) => Promise<void>;

/**
 * Construit un preHandler qui exige une cle API active et non expiree dans l'en-tete
 * X-API-Key, puis applique la limite de debit propre a la cle (en-tetes X-RateLimit-*).
 * Le format est verifie avant toute requete SQL ; seule l'empreinte HMAC est stockee.
 */
export function createApiKeyGuard(
  db: Db,
  config: AppConfig,
  limiter: SlidingWindowLimiter,
): ApiKeyGuard {
  return async function guard(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const header = request.headers["x-api-key"];
    const raw = Array.isArray(header) ? header[0] : header;
    if (typeof raw !== "string" || !isValidApiKeyFormat(raw)) {
      throw new UnauthorizedError();
    }

    const [key] = await db
      .select({
        id: apiKeys.id,
        isActive: apiKeys.isActive,
        rateLimitPerMin: apiKeys.rateLimitPerMin,
        expiresAt: apiKeys.expiresAt,
      })
      .from(apiKeys)
      .where(eq(apiKeys.keyHash, hashApiKey(raw, config.API_KEY_PEPPER)))
      .limit(1);

    if (!key || !key.isActive) {
      throw new UnauthorizedError();
    }
    if (key.expiresAt !== null && key.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedError("Cle API expiree");
    }

    const result = limiter.check(key.id, key.rateLimitPerMin);
    reply.header("X-RateLimit-Limit", result.limit);
    reply.header("X-RateLimit-Remaining", result.remaining);
    if (!result.allowed) {
      reply.header("Retry-After", result.retryAfterSeconds);
      throw new RateLimitError();
    }

    request.apiKeyId = key.id;
  };
}
