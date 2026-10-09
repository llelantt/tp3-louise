import "dotenv/config";
import { z } from "zod";

/** Champ booleen tolerant : "1", "true", "yes", "on" valent vrai. */
function booleanish(defaultValue: "true" | "false" = "false") {
  return z
    .string()
    .default(defaultValue)
    .transform((value) => ["1", "true", "yes", "on"].includes(value.trim().toLowerCase()));
}

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().max(65535).default(3000),
  HOST: z.string().min(1).default("0.0.0.0"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),

  DATABASE_URL: z.string().url(),
  DB_STATEMENT_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),

  CORS_ORIGINS: z.string().default("*"),
  TRUST_PROXY: z.string().default("false"),
  BODY_LIMIT_BYTES: z.coerce.number().int().positive().default(1_048_576),
  REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),

  DOCS_ENABLED: booleanish("true"),

  GEOCODE_BASE_URL: z.string().url().default("https://data.geopf.fr/geocodage"),
  GEOCODE_TIMEOUT_MS: z.coerce.number().int().positive().default(3_000),
  GEOCODE_CACHE_MAX: z.coerce.number().int().positive().default(500),
  GEOCODE_RATE_LIMIT_PER_MIN: z.coerce.number().int().positive().default(30),

  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(120),
  RATE_LIMIT_WINDOW: z.string().min(1).default("1 minute"),

  API_KEY_PEPPER: z.string().min(1),

  MAX_ALERTS_PER_KEY: z.coerce.number().int().positive().default(20),
  WEBHOOK_TIMEOUT_MS: z.coerce.number().int().positive().default(5_000),
  WEBHOOK_MAX_ATTEMPTS: z.coerce.number().int().positive().max(10).default(3),
  WEBHOOK_MAX_FAILURES: z.coerce.number().int().positive().default(5),
  WEBHOOK_MAX_RESPONSE_BYTES: z.coerce.number().int().positive().default(65_536),
  // Autorise les adresses privees/loopback : uniquement pour les tests (jamais en prod).
  WEBHOOK_ALLOW_PRIVATE: booleanish("false"),

  INGEST_INSTANT_URL: z.string().url().default("https://donnees.roulez-eco.fr/opendata/instantane"),
  INGEST_DAILY_URL: z.string().url().default("https://donnees.roulez-eco.fr/opendata/jour"),
  INGEST_INTERVAL_MINUTES: z.coerce.number().int().positive().max(1440).default(12),
  INGEST_ENABLED: booleanish("false"),
  INGEST_MAX_ARCHIVE_BYTES: z.coerce.number().int().positive().default(104_857_600),
  PRICE_STALE_AFTER_DAYS: z.coerce.number().int().positive().default(3),
});

export type AppConfig = z.infer<typeof envSchema>;

export type TrustProxy = boolean | string | string[] | ((address: string, hop: number) => boolean);

/**
 * Analyse TRUST_PROXY : "false"/"true", un nombre de sauts, ou une liste de proxys de
 * confiance separee par des virgules. Un reglage trop large permet de falsifier
 * X-Forwarded-For : ne l'activer que derriere un proxy maitrise (cf. README).
 */
export function parseTrustProxy(raw: string): TrustProxy {
  const value = raw.trim();
  if (value === "" || value.toLowerCase() === "false") return false;
  if (value.toLowerCase() === "true") return true;
  if (/^\d+$/.test(value)) {
    const hops = Number(value);
    return (_address: string, hop: number) => hop < hops;
  }
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

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
