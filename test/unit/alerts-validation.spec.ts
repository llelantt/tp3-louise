import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp, type App } from "../../src/app.js";
import { parseConfig } from "../../src/config.js";
import type { Db } from "../../src/db/client.js";
import { createLogger } from "../../src/lib/logger.js";

// La validation s'execute avant le preHandler d'authentification : une entree
// invalide doit repondre 400 sans jamais toucher la base.
const fakeDb = {} as unknown as Db;

describe("alertes et detail — validation", () => {
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

  const headers = { "x-api-key": "peu-importe", "content-type": "application/json" };

  async function postAlert(payload: unknown): Promise<number> {
    const response = await app.inject({
      method: "POST",
      url: "/v1/alerts",
      headers,
      payload: JSON.stringify(payload),
    });
    return response.statusCode;
  }

  it("rejette une alerte sans carburant", async () => {
    expect(await postAlert({ lat: 48.85, lon: 2.35, threshold_price: 1.7 })).toBe(400);
  });

  it("rejette une latitude hors bornes", async () => {
    expect(await postAlert({ fuel: "gazole", lat: 200, lon: 2.35, threshold_price: 1.7 })).toBe(
      400,
    );
  });

  it("rejette un seuil negatif", async () => {
    expect(await postAlert({ fuel: "gazole", lat: 48.85, lon: 2.35, threshold_price: -1 })).toBe(
      400,
    );
  });

  it("rejette un rayon extreme", async () => {
    expect(
      await postAlert({
        fuel: "gazole",
        lat: 48.85,
        lon: 2.35,
        radius_km: 9999,
        threshold_price: 1.7,
      }),
    ).toBe(400);
  });

  it("rejette un canal inconnu", async () => {
    expect(
      await postAlert({
        fuel: "gazole",
        lat: 48.85,
        lon: 2.35,
        threshold_price: 1.7,
        channel: "sms",
      }),
    ).toBe(400);
  });

  it("rejette un identifiant de station non numerique", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/stations/abc",
      headers: { "x-api-key": "peu-importe" },
    });
    expect(response.statusCode).toBe(400);
  });

  it("rejette un identifiant d'alerte non uuid", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/alerts/pas-un-uuid/events",
      headers: { "x-api-key": "peu-importe" },
    });
    expect(response.statusCode).toBe(400);
  });
});
