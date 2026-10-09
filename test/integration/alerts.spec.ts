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
      VALUES (${hashApiKey(API_KEY, PEPPER)}, 'alerts')
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

  it("cree une alerte, l'evalue et lit les evenements", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/alerts",
      headers: { "x-api-key": API_KEY },
      payload: {
        label: "pas cher",
        fuel: "gazole",
        lat: 48.85,
        lon: 2.35,
        radius_km: 5,
        threshold_price: 1.75,
      },
    });
    expect(created.statusCode).toBe(201);
    const alertId = created.json().alert.id as string;

    const eventsCreated = await evaluateAlerts(db);
    expect(eventsCreated).toBeGreaterThanOrEqual(1);

    const events = await app.inject({
      method: "GET",
      url: `/alerts/${alertId}/events`,
      headers: { "x-api-key": API_KEY },
    });
    expect(events.statusCode).toBe(200);
    const stationIds = events
      .json()
      .events.map((event: { station_id: number }) => event.station_id);
    expect(stationIds).toContain(900301);
    expect(stationIds).not.toContain(900302);

    const list = await app.inject({
      method: "GET",
      url: "/alerts",
      headers: { "x-api-key": API_KEY },
    });
    expect(list.json().alerts.map((alert: { id: string }) => alert.id)).toContain(alertId);

    const deleted = await app.inject({
      method: "DELETE",
      url: `/alerts/${alertId}`,
      headers: { "x-api-key": API_KEY },
    });
    expect(deleted.statusCode).toBe(204);

    const afterDelete = await app.inject({
      method: "GET",
      url: `/alerts/${alertId}/events`,
      headers: { "x-api-key": API_KEY },
    });
    expect(afterDelete.statusCode).toBe(404);
  });

  it("refuse une requete sans cle API", async () => {
    const response = await app.inject({ method: "GET", url: "/alerts" });
    expect(response.statusCode).toBe(401);
  });
});
