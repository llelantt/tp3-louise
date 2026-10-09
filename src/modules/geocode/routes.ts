import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { RateLimitError, UnauthorizedError } from "../../lib/errors.js";
import { GEOCODE_SOURCE } from "../../lib/source.js";
import { SlidingWindowLimiter } from "../auth/rateLimit.js";
import { geocodeQuerySchema, geocodeResponseSchema } from "./schemas.js";
import { Geocoder } from "./service.js";

/** Route de geocodage d'adresses (proxy vers la Geoplateforme / BAN). */
export const geocodeRoutes: FastifyPluginAsyncZod = async (app) => {
  const limiter = new SlidingWindowLimiter(60_000);
  const geocoder = new Geocoder(app.config, app.fetchImpl);

  app.get(
    "/geocode",
    {
      preHandler: [
        app.authGuard,
        async (request, reply) => {
          const keyId = request.apiKeyId;
          if (!keyId) throw new UnauthorizedError();
          const result = limiter.check(keyId, app.config.GEOCODE_RATE_LIMIT_PER_MIN);
          reply.header("X-RateLimit-Limit", result.limit);
          reply.header("X-RateLimit-Remaining", result.remaining);
          if (!result.allowed) {
            reply.header("Retry-After", result.retryAfterSeconds);
            throw new RateLimitError();
          }
        },
      ],
      schema: {
        tags: ["geocode"],
        summary: "Geocoder une adresse (proxy BAN)",
        description:
          `Proxy serveur vers ${GEOCODE_SOURCE}. L'hote est fixe (aucune URL client), ` +
          "limite par cle plus basse que le reste de l'API.",
        security: [{ apiKey: [] }],
        querystring: geocodeQuerySchema,
        response: { 200: geocodeResponseSchema },
      },
    },
    async (request) => {
      const results = await geocoder.search(request.query.q);
      return { source: GEOCODE_SOURCE, results };
    },
  );
};
