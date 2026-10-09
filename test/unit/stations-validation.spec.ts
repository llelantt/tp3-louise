import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp, type App } from "../../src/app.js";
import { parseConfig } from "../../src/config.js";
import type { Db } from "../../src/db/client.js";
import { createLogger } from "../../src/lib/logger.js";

// La validation des parametres s'execute avant le preHandler d'authentification :
// une entree invalide doit donc repondre 400 sans jamais toucher la base.
const fakeDb = {} as unknown as Db;

describe("GET /stations/cheapest — validation", () => {
  let app: App;

  beforeAll(async () => {
    const config = parseConfig({
      DATABASE_URL: "postgres://user:pass@localhost:5432/carbu",
      API_KEY_PEPPER: "pepper-de-test",
      NODE_ENV: "test",
      LOG_LEVEL: "silent",
    });
    app = await buildApp({ config, logger: createLogger(config), db: fakeDb });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  const base = "lat=48.85&lon=2.35&fuel=gazole";

  async function status(url: string): Promise<number> {
    const response = await app.inject({
      method: "GET",
      url,
      headers: { "x-api-key": "peu-importe" },
    });
    return response.statusCode;
  }

  it("rejette une latitude hors bornes", async () => {
    expect(await status(`/stations/cheapest?lon=2.35&fuel=gazole&lat=999`)).toBe(400);
  });

  it("rejette une longitude hors bornes", async () => {
    expect(await status(`/stations/cheapest?lat=48.85&fuel=gazole&lon=-999`)).toBe(400);
  });

  it("rejette une latitude manquante", async () => {
    expect(await status(`/stations/cheapest?lon=2.35&fuel=gazole`)).toBe(400);
  });

  it("rejette un rayon nul ou negatif", async () => {
    expect(await status(`/stations/cheapest?${base}&radius_km=0`)).toBe(400);
    expect(await status(`/stations/cheapest?${base}&radius_km=-5`)).toBe(400);
  });

  it("rejette un rayon extreme", async () => {
    expect(await status(`/stations/cheapest?${base}&radius_km=100000`)).toBe(400);
  });

  it("rejette des litres negatifs ou nuls", async () => {
    expect(await status(`/stations/cheapest?${base}&liters=-1`)).toBe(400);
    expect(await status(`/stations/cheapest?${base}&liters=0`)).toBe(400);
  });

  it("rejette une consommation non numerique", async () => {
    expect(await status(`/stations/cheapest?${base}&consumption=beaucoup`)).toBe(400);
  });

  it("rejette un carburant inconnu", async () => {
    expect(await status(`/stations/cheapest?lat=48.85&lon=2.35&fuel=essence`)).toBe(400);
  });

  it("rejette une cle de tri inconnue", async () => {
    expect(await status(`/stations/cheapest?${base}&sort=nimportequoi`)).toBe(400);
  });

  it("rejette NaN et Infinity", async () => {
    expect(await status(`/stations/cheapest?lon=2.35&fuel=gazole&lat=NaN`)).toBe(400);
    expect(await status(`/stations/cheapest?${base}&radius_km=Infinity`)).toBe(400);
  });
});
