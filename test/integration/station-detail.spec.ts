import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp, type App } from "../../src/app.js";
import { parseConfig } from "../../src/config.js";
import { createDb } from "../../src/db/client.js";
import { hashApiKey } from "../../src/lib/apiKeys.js";
import { createLogger } from "../../src/lib/logger.js";

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const API_KEY = `ck_${"d".repeat(43)}`;
const PEPPER = "detail-pepper";

describe.skipIf(!databaseUrl)("GET /stations/:id (integration)", () => {
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
      INSERT INTO stations (id, name, brand, address, city, postal_code, lat, lon, geom, services)
      VALUES (900201, 'Detail Station', 'X', '10 rue', 'Lyon', '69001', 45.76, 4.83,
        ST_SetSRID(ST_MakePoint(4.83, 45.76), 4326), '["Boutique"]'::jsonb)
    `);
    await db.execute(sql`
      INSERT INTO station_fuels (station_id, fuel, price, observed_at)
      VALUES (900201, 'gazole', 1.75, now()), (900201, 'sp95', 1.85, now())
    `);
    await db.execute(sql`
      INSERT INTO fuel_price_history (station_id, fuel, price, observed_at)
      VALUES (900201, 'gazole', 1.80, now() - interval '2 days'),
             (900201, 'gazole', 1.75, now())
    `);
    await db.execute(sql`
      INSERT INTO api_keys (key_hash, name)
      VALUES (${hashApiKey(API_KEY, PEPPER)}, 'detail')
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

  it("renvoie le detail et l'historique des prix", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/stations/900201",
      headers: { "x-api-key": API_KEY },
    });
    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(body.station.id).toBe(900201);
    expect(body.station.services).toEqual(["Boutique"]);
    expect(body.station.fuels).toHaveLength(2);

    const gazole = body.station.fuels.find((fuel: { fuel: string }) => fuel.fuel === "gazole");
    expect(gazole.price).toBe(1.75);
    expect(gazole.history.length).toBeGreaterThanOrEqual(2);
  });

  it("renvoie 404 pour une station inconnue", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/stations/999999",
      headers: { "x-api-key": API_KEY },
    });
    expect(response.statusCode).toBe(404);
  });
});
