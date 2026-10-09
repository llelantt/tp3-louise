import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp, type App } from "../../src/app.js";
import { parseConfig } from "../../src/config.js";
import { createDb } from "../../src/db/client.js";
import { hashApiKey } from "../../src/lib/apiKeys.js";
import { createLogger } from "../../src/lib/logger.js";

// Test d'integration : ne s'execute que si une base PostgreSQL/PostGIS est fournie
// (CI, ou TEST_DATABASE_URL en local). Sans base, le fichier est ignore.
const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const API_KEY = `ck_${"s".repeat(43)}`;
const PEPPER = "integration-pepper";

describe.skipIf(!databaseUrl)("GET /stations/cheapest (integration)", () => {
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
      INSERT INTO stations (id, name, brand, address, city, postal_code, lat, lon, geom, is_closed)
      VALUES
        (900001, 'Station Proche', 'A', '1 rue', 'Paris', '75001', 48.85, 2.35,
          ST_SetSRID(ST_MakePoint(2.35, 48.85), 4326), false),
        (900002, 'Station Loin Pas Chere', 'B', '2 rue', 'Paris', '75002', 48.87, 2.36,
          ST_SetSRID(ST_MakePoint(2.36, 48.87), 4326), false),
        (900003, 'Station Fermee', 'C', '3 rue', 'Paris', '75003', 48.851, 2.351,
          ST_SetSRID(ST_MakePoint(2.351, 48.851), 4326), true)
    `);
    await db.execute(sql`
      INSERT INTO station_fuels (station_id, fuel, price, observed_at, is_stale, is_rupture)
      VALUES
        (900001, 'gazole', 1.90, now(), false, false),
        (900002, 'gazole', 1.70, now(), false, false),
        (900003, 'gazole', 1.50, now(), false, false)
    `);
    await db.execute(sql`
      INSERT INTO api_keys (key_hash, name)
      VALUES (${hashApiKey(API_KEY, PEPPER)}, 'integration')
      ON CONFLICT (key_hash) DO NOTHING
    `);

    // Zone dense : 550 stations (500 proches cheres, 50 lointaines bon marche).
    // Objectif : verifier que la moins chere n'est jamais exclue par le LIMIT.
    const denseStations: string[] = [];
    const denseFuels: string[] = [];
    for (let i = 0; i < 550; i += 1) {
      const lat = 45 + i * 0.001;
      const price = i < 500 ? 1.9 : 1.2;
      denseStations.push(
        `(${900400 + i}, 'Dense ${i}', ${lat}, 4, ST_SetSRID(ST_MakePoint(4, ${lat}), 4326))`,
      );
      denseFuels.push(`(${900400 + i}, 'gazole', ${price}, now())`);
    }
    await db.execute(
      sql.raw(`INSERT INTO stations (id, name, lat, lon, geom) VALUES ${denseStations.join(", ")}`),
    );
    await db.execute(
      sql.raw(
        `INSERT INTO station_fuels (station_id, fuel, price, observed_at) VALUES ${denseFuels.join(", ")}`,
      ),
    );

    app = await buildApp({ config, logger: createLogger(config), db });
    await app.ready();
  });

  afterAll(async () => {
    await app?.close();
    await db?.execute(sql`DELETE FROM stations WHERE id >= 900000`).catch(() => undefined);
    await pool?.end();
  });

  it("repond 401 sans cle API", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/stations/cheapest?lat=48.85&lon=2.35&fuel=gazole",
    });
    expect(response.statusCode).toBe(401);
  });

  it("classe par cout total et exclut la station fermee", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/stations/cheapest?lat=48.85&lon=2.35&fuel=gazole&radius_km=5",
      headers: { "x-api-key": API_KEY },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    const ids = body.stations.map((station: { id: number }) => station.id);

    expect(ids).toContain(900001);
    expect(ids).toContain(900002);
    expect(ids).not.toContain(900003);
    expect(body.source).toContain("data.gouv.fr");

    const near = body.stations.find((station: { id: number }) => station.id === 900001);
    expect(near.economy_vs_nearest).toBe(0);
  });

  it("respecte sort=distance", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/stations/cheapest?lat=48.85&lon=2.35&fuel=gazole&radius_km=5&sort=distance",
      headers: { "x-api-key": API_KEY },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().stations[0].id).toBe(900001);
  });

  it("zone dense : la station la moins chere n'est jamais exclue", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/stations/cheapest?lat=45&lon=4&fuel=gazole&radius_km=100&sort=total_cost&limit=20",
      headers: { "x-api-key": API_KEY },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.stations).toHaveLength(20);
    expect(body.stations[0].price).toBeCloseTo(1.2, 3);
    expect(body.truncated).toBe(true);
  });

  it("zone dense : sort=price met la moins chere au litre en tete", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/stations/cheapest?lat=45&lon=4&fuel=gazole&radius_km=100&sort=price&limit=5",
      headers: { "x-api-key": API_KEY },
    });
    expect(response.json().stations[0].price).toBeCloseTo(1.2, 3);
  });

  it("zone dense : sort=distance met la plus proche en tete", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/stations/cheapest?lat=45&lon=4&fuel=gazole&radius_km=100&sort=distance&limit=5",
      headers: { "x-api-key": API_KEY },
    });
    expect(response.json().stations[0].price).toBeCloseTo(1.9, 3);
  });
});
