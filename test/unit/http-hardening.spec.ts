import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp, type App } from "../../src/app.js";
import { parseConfig } from "../../src/config.js";
import type { Db } from "../../src/db/client.js";
import { createLogger } from "../../src/lib/logger.js";

const fakeDb = {} as unknown as Db;
const baseEnv = {
  DATABASE_URL: "postgres://user:pass@localhost:5432/carbu",
  API_KEY_PEPPER: "pepper-de-test",
  NODE_ENV: "test",
  LOG_LEVEL: "silent",
};

describe("durcissement HTTP", () => {
  let app: App;

  beforeAll(async () => {
    const config = parseConfig(baseEnv);
    app = await buildApp({ config, logger: createLogger(config), db: fakeDb });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("repond 404 au format de l'API", async () => {
    const response = await app.inject({ method: "GET", url: "/inconnu" });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: "not_found",
      message: expect.stringContaining("introuvable"),
    });
  });

  it("ajoute les en-tetes de securite (helmet)", async () => {
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["content-security-policy"]).toContain("default-src 'self'");
    expect(response.headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  });

  it("sert le front avec une CSP stricte", async () => {
    const response = await app.inject({ method: "GET", url: "/" });
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-security-policy"]).toContain("script-src 'self'");
  });

  it("refuse un corps trop volumineux (bodyLimit)", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/alerts",
      headers: { "x-api-key": `ck_${"a".repeat(43)}`, "content-type": "application/json" },
      payload: JSON.stringify({ label: "x".repeat(2_000_000) }),
    });
    expect(response.statusCode).toBe(413);
  });

  it("renvoie 503 sur /ready quand la base est indisponible", async () => {
    const response = await app.inject({ method: "GET", url: "/ready" });
    expect(response.statusCode).toBe(503);
    expect(response.json().status).toBe("degraded");
    expect(response.json().db).toBe("down");
  });
});

describe("DOCS_ENABLED", () => {
  async function appWith(docsEnabled: string): Promise<App> {
    const config = parseConfig({ ...baseEnv, DOCS_ENABLED: docsEnabled });
    const app = await buildApp({ config, logger: createLogger(config), db: fakeDb });
    await app.ready();
    return app;
  }

  it("desactive /docs quand false", async () => {
    const app = await appWith("false");
    try {
      const response = await app.inject({ method: "GET", url: "/docs/json" });
      expect(response.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });

  it("expose /docs quand true", async () => {
    const app = await appWith("true");
    try {
      const response = await app.inject({ method: "GET", url: "/docs/json" });
      expect(response.statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });
});
