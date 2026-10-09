import { describe, expect, it } from "vitest";
import { parseConfig } from "../../src/config.js";

const base = {
  DATABASE_URL: "postgres://user:pass@localhost:5432/carbu",
  API_KEY_PEPPER: "pepper-de-test",
};

describe("parseConfig", () => {
  it("applique les valeurs par defaut", () => {
    const config = parseConfig(base);
    expect(config.PORT).toBe(3000);
    expect(config.NODE_ENV).toBe("development");
    expect(config.INGEST_ENABLED).toBe(false);
    expect(config.PRICE_STALE_AFTER_DAYS).toBe(3);
  });

  it("coerce les nombres et les booleens", () => {
    const config = parseConfig({
      ...base,
      PORT: "8080",
      INGEST_ENABLED: "true",
      RATE_LIMIT_MAX: "50",
    });
    expect(config.PORT).toBe(8080);
    expect(config.INGEST_ENABLED).toBe(true);
    expect(config.RATE_LIMIT_MAX).toBe(50);
  });

  it("rejette une DATABASE_URL manquante", () => {
    expect(() => parseConfig({ API_KEY_PEPPER: "pepper" })).toThrow(/DATABASE_URL/);
  });

  it("rejette un PORT non numerique", () => {
    expect(() => parseConfig({ ...base, PORT: "abc" })).toThrow(/PORT/);
  });

  it("rejette une DATABASE_URL malformee", () => {
    expect(() => parseConfig({ ...base, DATABASE_URL: "pas-une-url" })).toThrow(/DATABASE_URL/);
  });
});
