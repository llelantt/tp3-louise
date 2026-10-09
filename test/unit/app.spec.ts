import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp, type App } from "../../src/app.js";
import { parseConfig } from "../../src/config.js";
import { createLogger } from "../../src/lib/logger.js";

describe("GET /health", () => {
  let app: App;

  beforeAll(async () => {
    const config = parseConfig({
      DATABASE_URL: "postgres://user:pass@localhost:5432/carbu",
      API_KEY_PEPPER: "pepper-de-test",
      NODE_ENV: "test",
      LOG_LEVEL: "silent",
    });
    app = await buildApp({ config, logger: createLogger(config) });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("repond ok et mentionne la source open data", async () => {
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.status).toBe("ok");
    expect(body.source).toContain("data.gouv.fr");
  });

  it("expose la documentation OpenAPI", async () => {
    const response = await app.inject({ method: "GET", url: "/docs/json" });
    expect(response.statusCode).toBe(200);
    expect(response.json().info.title).toBe("Carbu API");
  });
});
