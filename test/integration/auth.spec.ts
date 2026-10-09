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
const PEPPER = "auth-pepper";
const ACTIVE_KEY = `ck_${"x".repeat(43)}`;
const EXPIRED_KEY = `ck_${"y".repeat(43)}`;
const REVOKED_KEY = `ck_${"z".repeat(43)}`;
const RATE_KEY = `ck_${"r".repeat(43)}`;

describe.skipIf(!databaseUrl)("authentification (integration)", () => {
  let pool: Pool;
  let app: App;

  beforeAll(async () => {
    const config = parseConfig({
      DATABASE_URL: databaseUrl as string,
      API_KEY_PEPPER: PEPPER,
      NODE_ENV: "test",
      LOG_LEVEL: "silent",
    });

    pool = new Pool({ connectionString: databaseUrl as string });
    const db = createDb(pool);
    await migrate(db, { migrationsFolder: "drizzle" });
    await db.execute(sql`DELETE FROM api_keys WHERE name LIKE 'auth-test-%'`);
    await db.execute(sql`
      INSERT INTO api_keys (key_hash, name, is_active, expires_at, rate_limit_per_min)
      VALUES
        (${hashApiKey(ACTIVE_KEY, PEPPER)}, 'auth-test-active', true, NULL, 120),
        (${hashApiKey(EXPIRED_KEY, PEPPER)}, 'auth-test-expired', true, now() - interval '1 day', 120),
        (${hashApiKey(REVOKED_KEY, PEPPER)}, 'auth-test-revoked', false, NULL, 120),
        (${hashApiKey(RATE_KEY, PEPPER)}, 'auth-test-rate', true, NULL, 2)
    `);

    app = await buildApp({ config, logger: createLogger(config), db });
    await app.ready();
  });

  afterAll(async () => {
    await app?.close();
    await pool?.query("DELETE FROM api_keys WHERE name LIKE 'auth-test-%'").catch(() => undefined);
    await pool?.end();
  });

  const url = "/stations/cheapest?lat=48.85&lon=2.35&fuel=gazole";

  it("accepte une cle active", async () => {
    const response = await app.inject({ method: "GET", url, headers: { "x-api-key": ACTIVE_KEY } });
    expect(response.statusCode).toBe(200);
  });

  it("refuse une cle expiree", async () => {
    const response = await app.inject({
      method: "GET",
      url,
      headers: { "x-api-key": EXPIRED_KEY },
    });
    expect(response.statusCode).toBe(401);
  });

  it("refuse une cle revoquee", async () => {
    const response = await app.inject({
      method: "GET",
      url,
      headers: { "x-api-key": REVOKED_KEY },
    });
    expect(response.statusCode).toBe(401);
  });

  it("applique la limite par cle et expose les en-tetes", async () => {
    const first = await app.inject({ method: "GET", url, headers: { "x-api-key": RATE_KEY } });
    expect(first.statusCode).toBe(200);
    expect(first.headers["x-ratelimit-limit"]).toBe("2");
    expect(first.headers["x-ratelimit-remaining"]).toBe("1");

    const second = await app.inject({ method: "GET", url, headers: { "x-api-key": RATE_KEY } });
    expect(second.statusCode).toBe(200);
    expect(second.headers["x-ratelimit-remaining"]).toBe("0");

    const third = await app.inject({ method: "GET", url, headers: { "x-api-key": RATE_KEY } });
    expect(third.statusCode).toBe(429);
    expect(third.headers["retry-after"]).toBeDefined();
    expect(third.json().error).toBe("rate_limited");
  });
});
