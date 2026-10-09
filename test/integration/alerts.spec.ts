import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp, type App } from "../../src/app.js";
import { parseConfig } from "../../src/config.js";
import { createDb } from "../../src/db/client.js";
import { hashApiKey } from "../../src/lib/apiKeys.js";
import { createLogger } from "../../src/lib/logger.js";
import { evaluateAlerts } from "../../src/modules/alerts/service.js";

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const API_KEY = `ck_${"a".repeat(43)}`;
const OTHER_KEY = `ck_${"o".repeat(43)}`;
const PEPPER = "alerts-pepper";

describe.skipIf(!databaseUrl)("alertes (integration)", () => {
  let pool: Pool;
  let app: App;
  let db: ReturnType<typeof createDb>;

  beforeAll(async () => {
    const config = parseConfig({
      DATABASE_URL: databaseUrl as string,
      API_KEY_PEPPER: PEPPER,
      NODE_ENV: "test",
      LOG_LEVEL: "silent",
      MAX_ALERTS_PER_KEY: "2",
    });

    pool = new Pool({ connectionString: databaseUrl as string });
    db = createDb(pool);
    await migrate(db, { migrationsFolder: "drizzle" });
    await db.execute(sql`DELETE FROM stations WHERE id >= 900000`);
    await db.execute(sql`
      INSERT INTO stations (id, name, lat, lon, geom)
      VALUES (900301, 'Pas chere', 48.85, 2.35, ST_SetSRID(ST_MakePoint(2.35, 48.85), 4326)),
             (900302, 'Chere', 48.87, 2.36, ST_SetSRID(ST_MakePoint(2.36, 48.87), 4326))
    `);
    await db.execute(sql`
      INSERT INTO station_fuels (station_id, fuel, price, observed_at)
      VALUES (900301, 'gazole', 1.60, now()), (900302, 'gazole', 1.90, now())
    `);
    await db.execute(sql`
      INSERT INTO api_keys (key_hash, name)
      VALUES (${hashApiKey(API_KEY, PEPPER)}, 'alerts'),
             (${hashApiKey(OTHER_KEY, PEPPER)}, 'alerts-other')
      ON CONFLICT (key_hash) DO NOTHING
    `);

    app = await buildApp({ config, logger: createLogger(config), db });
    await app.ready();
  });

  afterAll(async () => {
    await app?.close();
    await db?.execute(sql`DELETE FROM stations WHERE id >= 900000`).catch(() => undefined);
    await pool?.end();
  });

  async function createAlert(key: string, payload: Record<string, unknown>) {
    return app.inject({
      method: "POST",
      url: "/v1/alerts",
      headers: { "x-api-key": key },
      payload,
    });
  }

  it("cree une alerte, l'evalue (idempotent) et lit les evenements", async () => {
    const created = await createAlert(API_KEY, {
      label: "pas cher",
      fuel: "gazole",
      lat: 48.85,
      lon: 2.35,
      radius_km: 5,
      threshold_price: 1.75,
    });
    expect(created.statusCode).toBe(201);
    const alertId = created.json().alert.id as string;

    expect(await evaluateAlerts(db)).toBeGreaterThanOrEqual(1);
    // Rejouer l'evaluation ne cree pas de doublon.
    expect(await evaluateAlerts(db)).toBe(0);

    const events = await app.inject({
      method: "GET",
      url: `/v1/alerts/${alertId}/events`,
      headers: { "x-api-key": API_KEY },
    });
    expect(events.statusCode).toBe(200);
    const stationIds = events
      .json()
      .events.map((event: { station_id: number }) => event.station_id);
    expect(stationIds).toContain(900301);
    expect(stationIds).not.toContain(900302);

    const deleted = await app.inject({
      method: "DELETE",
      url: `/v1/alerts/${alertId}`,
      headers: { "x-api-key": API_KEY },
    });
    expect(deleted.statusCode).toBe(204);
  });

  it("isole les alertes entre cles (404, pas 403)", async () => {
    const created = await createAlert(API_KEY, {
      fuel: "gazole",
      lat: 48.85,
      lon: 2.35,
      threshold_price: 1.8,
    });
    const alertId = created.json().alert.id as string;

    const events = await app.inject({
      method: "GET",
      url: `/v1/alerts/${alertId}/events`,
      headers: { "x-api-key": OTHER_KEY },
    });
    expect(events.statusCode).toBe(404);

    const remove = await app.inject({
      method: "DELETE",
      url: `/v1/alerts/${alertId}`,
      headers: { "x-api-key": OTHER_KEY },
    });
    expect(remove.statusCode).toBe(404);

    const list = await app.inject({
      method: "GET",
      url: "/v1/alerts",
      headers: { "x-api-key": OTHER_KEY },
    });
    expect(list.json().alerts).toEqual([]);

    await app.inject({
      method: "DELETE",
      url: `/v1/alerts/${alertId}`,
      headers: { "x-api-key": API_KEY },
    });
  });

  it("plafonne le nombre d'alertes par cle", async () => {
    const first = await createAlert(API_KEY, {
      fuel: "gazole",
      lat: 48.85,
      lon: 2.35,
      threshold_price: 1.8,
    });
    const second = await createAlert(API_KEY, {
      fuel: "sp95",
      lat: 48.85,
      lon: 2.35,
      threshold_price: 1.9,
    });
    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);

    const third = await createAlert(API_KEY, {
      fuel: "e10",
      lat: 48.85,
      lon: 2.35,
      threshold_price: 1.9,
    });
    expect(third.statusCode).toBe(409);
    expect(third.json().error).toBe("conflict");

    for (const id of [first.json().alert.id, second.json().alert.id]) {
      await app.inject({
        method: "DELETE",
        url: `/v1/alerts/${id}`,
        headers: { "x-api-key": API_KEY },
      });
    }
  });

  it("renvoie le secret webhook une seule fois", async () => {
    const created = await createAlert(API_KEY, {
      fuel: "gazole",
      lat: 48.85,
      lon: 2.35,
      threshold_price: 1.8,
      channel: "webhook",
      webhook_url: "https://example.com/hook",
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().alert.webhook_secret).toMatch(/^whsec_/);

    const list = await app.inject({
      method: "GET",
      url: "/v1/alerts",
      headers: { "x-api-key": API_KEY },
    });
    const listed = list
      .json()
      .alerts.find((alert: { id: string }) => alert.id === created.json().alert.id);
    expect(listed.webhook_url).toBe("https://example.com/hook");
    expect(listed.webhook_secret).toBeUndefined();

    await app.inject({
      method: "DELETE",
      url: `/v1/alerts/${created.json().alert.id}`,
      headers: { "x-api-key": API_KEY },
    });
  });

  it("refuse une requete sans cle API", async () => {
    const response = await app.inject({ method: "GET", url: "/v1/alerts" });
    expect(response.statusCode).toBe(401);
  });
});
