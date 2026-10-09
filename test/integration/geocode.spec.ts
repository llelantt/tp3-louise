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
const API_KEY = `ck_${"g".repeat(43)}`;
const PEPPER = "geocode-pepper";

function feature(label: string, lon: number, lat: number) {
  return {
    type: "Feature",
    properties: { label, city: "Paris", postcode: "75013" },
    geometry: { type: "Point", coordinates: [lon, lat] },
  };
}

const calls = { count: 0 };
const fetchImpl = (async (input: string | URL | Request) => {
  calls.count += 1;
  if (String(input).includes("fail")) {
    throw Object.assign(new Error("timeout"), { name: "AbortError" });
  }
  return new Response(
    JSON.stringify({
      type: "FeatureCollection",
      features: [feature("10 Rue X 75013 Paris", 2.36, 48.82)],
    }),
    { status: 200 },
  );
}) as typeof fetch;

const baseEnv = {
  DATABASE_URL: databaseUrl ?? "postgres://unused",
  API_KEY_PEPPER: PEPPER,
  NODE_ENV: "test",
  LOG_LEVEL: "silent",
};

describe.skipIf(!databaseUrl)("geocode (integration)", () => {
  let pool: Pool;
  let db: ReturnType<typeof createDb>;
  let app: App;

  beforeAll(async () => {
    const config = parseConfig(baseEnv);
    pool = new Pool({ connectionString: databaseUrl as string });
    db = createDb(pool);
    await migrate(db, { migrationsFolder: "drizzle" });
    await db.execute(sql`
      INSERT INTO api_keys (key_hash, name)
      VALUES (${hashApiKey(API_KEY, PEPPER)}, 'geocode')
      ON CONFLICT (key_hash) DO NOTHING
    `);
    app = await buildApp({ config, logger: createLogger(config), db, fetchImpl });
    await app.ready();
  });

  afterAll(async () => {
    await app?.close();
    await pool?.query("DELETE FROM api_keys WHERE name = 'geocode'").catch(() => undefined);
    await pool?.end();
  });

  const headers = { "x-api-key": API_KEY };

  it("refuse sans cle API", async () => {
    const response = await app.inject({ method: "GET", url: "/v1/geocode?q=10 rue de Rivoli" });
    expect(response.statusCode).toBe(401);
  });

  it("rejette une saisie trop courte ou trop longue", async () => {
    expect((await app.inject({ method: "GET", url: "/v1/geocode?q=ab", headers })).statusCode).toBe(
      400,
    );
    expect(
      (
        await app.inject({
          method: "GET",
          url: `/v1/geocode?q=${"a".repeat(201)}`,
          headers,
        })
      ).statusCode,
    ).toBe(400);
  });

  it("renvoie les resultats via le proxy", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/geocode?q=10 rue de Rivoli",
      headers,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().results[0].label).toContain("Rue");
    expect(response.json().source).toContain("data.geopf.fr");
  });

  it("met en cache (un seul appel upstream)", async () => {
    calls.count = 0;
    await app.inject({ method: "GET", url: "/v1/geocode?q=adresse unique test", headers });
    await app.inject({ method: "GET", url: "/v1/geocode?q=adresse unique test", headers });
    expect(calls.count).toBe(1);
  });

  it("renvoie 502 au format d'erreur si l'upstream est indisponible", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/geocode?q=fail upstream now",
      headers,
    });
    expect(response.statusCode).toBe(502);
    expect(response.json().error).toBe("upstream_error");
  });
});

describe.skipIf(!databaseUrl)("geocode — limite par cle (integration)", () => {
  let pool: Pool;
  let db: ReturnType<typeof createDb>;
  let app: App;

  beforeAll(async () => {
    const config = parseConfig({ ...baseEnv, GEOCODE_RATE_LIMIT_PER_MIN: "2" });
    pool = new Pool({ connectionString: databaseUrl as string });
    db = createDb(pool);
    await migrate(db, { migrationsFolder: "drizzle" });
    await db.execute(sql`
      INSERT INTO api_keys (key_hash, name)
      VALUES (${hashApiKey(API_KEY, PEPPER)}, 'geocode')
      ON CONFLICT (key_hash) DO NOTHING
    `);
    app = await buildApp({ config, logger: createLogger(config), db, fetchImpl });
    await app.ready();
  });

  afterAll(async () => {
    await app?.close();
    await pool?.end();
  });

  it("autorise 2 requetes puis refuse la 3e (429)", async () => {
    const headers = { "x-api-key": API_KEY };
    const url = "/v1/geocode?q=une autre adresse";
    expect((await app.inject({ method: "GET", url, headers })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url, headers })).statusCode).toBe(200);
    const third = await app.inject({ method: "GET", url, headers });
    expect(third.statusCode).toBe(429);
    expect(third.headers["retry-after"]).toBeDefined();
  });
});
