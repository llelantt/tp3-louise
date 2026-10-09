import { pino } from "pino";
import type { AppConfig } from "../config.js";

/** Construit le logger applicatif (JSON en prod, pretty en dev). */
export function createLogger(config: AppConfig) {
  const pretty = config.NODE_ENV === "development";
  return pino({
    level: config.LOG_LEVEL,
    redact: {
      paths: [
        "req.headers['x-api-key']",
        "req.headers.authorization",
        "*.apiKey",
        "*.webhookSecret",
        "*.webhook_secret",
        "webhookSecret",
        "secret",
      ],
      censor: "[redacted]",
    },
    transport: pretty
      ? {
          target: "pino-pretty",
          options: { translateTime: "HH:MM:ss", ignore: "pid,hostname" },
        }
      : undefined,
  });
}

export type Logger = ReturnType<typeof createLogger>;
