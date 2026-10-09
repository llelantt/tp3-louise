import { describe, expect, it } from "vitest";
import { parseConfig, parseTrustProxy } from "../../src/config.js";

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
    expect(config.DOCS_ENABLED).toBe(true);
    expect(config.TRUST_PROXY).toBe("false");
    expect(config.BODY_LIMIT_BYTES).toBe(1_048_576);
    expect(config.REQUEST_TIMEOUT_MS).toBe(15_000);
    expect(config.DB_STATEMENT_TIMEOUT_MS).toBe(10_000);
  });

  it("coerce les nombres et les booleens", () => {
    const config = parseConfig({
      ...base,
      PORT: "8080",
      INGEST_ENABLED: "true",
      RATE_LIMIT_MAX: "50",
      DOCS_ENABLED: "false",
    });
    expect(config.PORT).toBe(8080);
    expect(config.INGEST_ENABLED).toBe(true);
    expect(config.RATE_LIMIT_MAX).toBe(50);
    expect(config.DOCS_ENABLED).toBe(false);
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

describe("parseTrustProxy", () => {
  it("desactive le proxy par defaut", () => {
    expect(parseTrustProxy("false")).toBe(false);
    expect(parseTrustProxy("")).toBe(false);
  });

  it("accepte true, un nombre de sauts ou une liste", () => {
    expect(parseTrustProxy("true")).toBe(true);
    const hops = parseTrustProxy("2");
    expect(typeof hops).toBe("function");
    if (typeof hops === "function") {
      expect(hops("1.2.3.4", 0)).toBe(true);
      expect(hops("1.2.3.4", 2)).toBe(false);
    }
    expect(parseTrustProxy("10.0.0.1, 10.0.0.2")).toEqual(["10.0.0.1", "10.0.0.2"]);
  });
});
