import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp, type App } from "../../src/app.js";
import { parseConfig } from "../../src/config.js";
import type { Db } from "../../src/db/client.js";
import { createLogger } from "../../src/lib/logger.js";

// Base espionne : prouve qu'un format de cle invalide est rejete AVANT toute requete SQL.
let selectCalls = 0;
const spyDb = {
  select: () => {
    selectCalls += 1;
    throw new Error("la base ne doit pas etre interrogee pour un format invalide");
  },
} as unknown as Db;

describe("garde d'authentification — format de cle", () => {
  let app: App;

  beforeAll(async () => {
    const config = parseConfig({
      DATABASE_URL: "postgres://user:pass@localhost:5432/carbu",
      API_KEY_PEPPER: "pepper-de-test",
      NODE_ENV: "test",
      LOG_LEVEL: "silent",
    });
    app = await buildApp({ config, logger: createLogger(config), db: spyDb });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  const url = "/stations/cheapest?lat=48.85&lon=2.35&fuel=gazole";

  it("rejette un format invalide sans toucher la base", async () => {
    selectCalls = 0;
    const response = await app.inject({
      method: "GET",
      url,
      headers: { "x-api-key": "pas-une-cle" },
    });
    expect(response.statusCode).toBe(401);
    expect(selectCalls).toBe(0);
  });

  it("laisse passer un format valide jusqu'a la base", async () => {
    selectCalls = 0;
    const response = await app.inject({
      method: "GET",
      url,
      headers: { "x-api-key": `ck_${"a".repeat(43)}` },
    });
    expect(response.statusCode).toBe(500);
    expect(selectCalls).toBe(1);
  });
});
