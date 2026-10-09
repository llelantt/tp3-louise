import "dotenv/config";
import { z } from "zod";

/** Champ booleen tolerant : "1", "true", "yes", "on" valent vrai. */
const booleanish = z
  .string()
  .default("false")
  .transform((value) => ["1", "true", "yes", "on"].includes(value.trim().toLowerCase()));

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().max(65535).default(3000),
  HOST: z.string().min(1).default("0.0.0.0"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),

  DATABASE_URL: z.string().url(),

  CORS_ORIGINS: z.string().default("*"),

  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(120),
  RATE_LIMIT_WINDOW: z.string().min(1).default("1 minute"),

  API_KEY_PEPPER: z.string().min(1),

  INGEST_INSTANT_URL: z.string().url().default("https://donnees.roulez-eco.fr/opendata/instantane"),
  INGEST_DAILY_URL: z.string().url().default("https://donnees.roulez-eco.fr/opendata/jour"),
  INGEST_INTERVAL_MINUTES: z.coerce.number().int().positive().max(1440).default(12),
  INGEST_ENABLED: booleanish,
  INGEST_MAX_ARCHIVE_BYTES: z.coerce.number().int().positive().default(104_857_600),
  PRICE_STALE_AFTER_DAYS: z.coerce.number().int().positive().default(3),
});

export type AppConfig = z.infer<typeof envSchema>;

/** Valide un environnement et retourne la config typée, ou leve une erreur lisible. */
export function parseConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join(".") || "(racine)"}: ${issue.message}`)
      .join("; ");
    throw new Error(`Configuration invalide: ${details}`);
  }
  return result.data;
}

let cached: AppConfig | undefined;

/** Retourne la config de l'application, chargée une seule fois. */
export function getConfig(): AppConfig {
  cached ??= parseConfig();
  return cached;
}
