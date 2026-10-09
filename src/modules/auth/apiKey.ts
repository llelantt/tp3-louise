import { eq } from "drizzle-orm";
import type { FastifyRequest } from "fastify";
import type { AppConfig } from "../../config.js";
import type { Db } from "../../db/client.js";
import { apiKeys } from "../../db/schema.js";
import { hashApiKey } from "../../lib/apiKeys.js";
import { UnauthorizedError } from "../../lib/errors.js";

/** Verificateur de cle API, utilisable comme preHandler Fastify. */
export type ApiKeyGuard = (request: FastifyRequest) => Promise<void>;

/**
 * Construit un preHandler qui exige une cle API active dans l'en-tete X-API-Key.
 * La cle est comparee par empreinte poivree ; elle n'est jamais stockee en clair.
 */
export function createApiKeyGuard(db: Db, config: AppConfig): ApiKeyGuard {
  return async function guard(request: FastifyRequest): Promise<void> {
    const header = request.headers["x-api-key"];
    const raw = Array.isArray(header) ? header[0] : header;
    if (typeof raw !== "string" || raw.length === 0) {
      throw new UnauthorizedError();
    }

    const [key] = await db
      .select({ id: apiKeys.id, isActive: apiKeys.isActive })
      .from(apiKeys)
      .where(eq(apiKeys.keyHash, hashApiKey(raw, config.API_KEY_PEPPER)))
      .limit(1);

    if (!key || !key.isActive) {
      throw new UnauthorizedError();
    }

    request.apiKeyId = key.id;
  };
}
