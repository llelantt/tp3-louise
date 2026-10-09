import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import Fastify, { type FastifyError } from "fastify";
import { fileURLToPath } from "node:url";
import {
  hasZodFastifySchemaValidationErrors,
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import type { Pool } from "pg";
import { z } from "zod";
import type { AppConfig } from "./config.js";
import { createDb, createPool, type Db } from "./db/client.js";
import { AppError } from "./lib/errors.js";
import type { Logger } from "./lib/logger.js";
import { DATA_SOURCE } from "./lib/source.js";
import { createApiKeyGuard } from "./modules/auth/apiKey.js";
import { SlidingWindowLimiter } from "./modules/auth/rateLimit.js";
import { alertRoutes } from "./modules/alerts/routes.js";
import { stationRoutes } from "./modules/stations/routes.js";

export interface BuildAppOptions {
  config: AppConfig;
  logger: Logger;
  /** Base injectee (tests). Sinon, un pool est cree depuis la config. */
  db?: Db;
}

function parseCorsOrigins(raw: string): boolean | string[] {
  const value = raw.trim();
  if (value === "*") return true;
  return value
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

/** Construit l'instance Fastify complete (plugins, erreurs, routes). */
export async function buildApp({ config, logger, db }: BuildAppOptions) {
  const app = Fastify({ loggerInstance: logger }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  let pool: Pool | undefined;
  let database = db;
  if (!database) {
    pool = createPool(config);
    database = createDb(pool);
  }

  app.decorate("config", config);
  app.decorate("db", database);
  app.decorate("authGuard", createApiKeyGuard(database, config, new SlidingWindowLimiter()));
  app.addHook("onClose", async () => {
    if (pool) await pool.end();
  });

  await app.register(swagger, {
    openapi: {
      info: {
        title: "Carbu API",
        version: "0.1.0",
        description: `Stations-service les moins cheres autour d'un point GPS. Source : ${DATA_SOURCE}.`,
      },
      tags: [
        { name: "system", description: "Sante du service" },
        { name: "stations", description: "Recherche et detail des stations" },
        { name: "alerts", description: "Alertes de prix" },
      ],
    },
    transform: jsonSchemaTransform,
  });

  await app.register(swaggerUi, { routePrefix: "/docs" });

  await app.register(cors, { origin: parseCorsOrigins(config.CORS_ORIGINS) });

  await app.register(rateLimit, {
    max: config.RATE_LIMIT_MAX,
    timeWindow: config.RATE_LIMIT_WINDOW,
    // Garde-fou global par IP ; la limite propre a la cle est appliquee dans authGuard.
    keyGenerator: (request) => request.ip,
  });

  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (hasZodFastifySchemaValidationErrors(error)) {
      reply.status(400).send({
        error: "validation_error",
        message: "Parametres invalides",
        details: error.validation.map((issue) => ({
          path: issue.instancePath || "(racine)",
          message: issue.message,
        })),
      });
      return;
    }
    if (error instanceof AppError) {
      reply.status(error.statusCode).send({
        error: error.code,
        message: error.message,
        details: error.details,
      });
      return;
    }
    if (typeof error.statusCode === "number" && error.statusCode < 500) {
      reply.status(error.statusCode).send({ error: "request_error", message: error.message });
      return;
    }
    request.log.error({ err: error }, "erreur non geree");
    reply.status(500).send({ error: "internal_error", message: "Erreur interne" });
  });

  app.get(
    "/health",
    {
      schema: {
        tags: ["system"],
        summary: "Sonde de vie",
        response: {
          200: z.object({
            status: z.literal("ok"),
            version: z.string(),
            source: z.string(),
          }),
        },
      },
    },
    async () => ({ status: "ok" as const, version: "0.1.0", source: DATA_SOURCE }),
  );

  await app.register(stationRoutes);
  await app.register(alertRoutes);

  await app.register(fastifyStatic, {
    root: fileURLToPath(new URL("../public", import.meta.url)),
    prefix: "/",
  });

  return app;
}

export type App = Awaited<ReturnType<typeof buildApp>>;
