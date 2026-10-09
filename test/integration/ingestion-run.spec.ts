import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseConfig } from "../../src/config.js";
import { createDb } from "../../src/db/client.js";
import { runIngestion } from "../../src/ingestion/runIngestion.js";
import { createLogger } from "../../src/lib/logger.js";
import { buildZip } from "../helpers/zip.js";

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;

const xml = `<?xml version="1.0" encoding="utf-8"?>
<pdv_liste>
  <pdv id="900501" latitude="4885000" longitude="235000" adresse="1 rue" ville="Paris">
    <prix nom="Gazole" valeur="1.80" maj="2026-10-09T09:00:00Z"/>
  </pdv>
  <pdv id="900502" latitude="9999999" longitude="235000" adresse="invalide" ville="Nul">
    <prix nom="Gazole" valeur="1.5" maj="2026-10-09T09:00:00Z"/>
  </pdv>
</pdv_liste>`;

function validZip(): Buffer {
  return buildZip([{ name: "prix.xml", content: Buffer.from(xml, "utf8"), method: 8 }]);
}

describe.skipIf(!databaseUrl)("ingestion — robustesse (integration)", () => {
  let pool: Pool;
  let db: ReturnType<typeof createDb>;

  const config = parseConfig({
    DATABASE_URL: databaseUrl ?? "postgres://unused",
    API_KEY_PEPPER: "ingest-pepper",
    NODE_ENV: "test",
    LOG_LEVEL: "silent",
    INGEST_MAX_ARCHIVE_BYTES: "4096",
  });
  const logger = createLogger(config);

  beforeAll(async () => {
    pool = new Pool({ connectionString: databaseUrl as string });
    db = createDb(pool);
    await migrate(db, { migrationsFolder: "drizzle" });
    await db.execute(sql`DELETE FROM stations WHERE id >= 900000`);
  });

  afterAll(async () => {
    await db?.execute(sql`DELETE FROM stations WHERE id >= 900000`).catch(() => undefined);
    await pool?.end();
  });

  async function lastRun(): Promise<{ status: string; error: string | null }> {
    const result = await db.execute(sql`
      SELECT status, error FROM ingestion_runs ORDER BY id DESC LIMIT 1
    `);
    const row = result.rows[0] as { status: string; error: string | null } | undefined;
    if (!row) throw new Error("aucun ingestion_run enregistre");
    return row;
  }

  async function run(fetchImpl: typeof fetch): Promise<void> {
    await runIngestion({ db, config, logger, fetchImpl });
  }

  it("reussit sur un flux valide et ignore les points invalides", async () => {
    await run(async () => new Response(validZip()));
    expect((await lastRun()).status).toBe("success");
    const stations = await db.execute(
      sql`SELECT count(*)::int AS n FROM stations WHERE id >= 900000`,
    );
    expect((stations.rows[0] as { n: number }).n).toBe(1);
  });

  it("echoue proprement sur HTTP 500", async () => {
    await run(async () => new Response("erreur", { status: 500 }));
    const row = await lastRun();
    expect(row.status).toBe("failed");
    expect(row.error).toMatch(/HTTP 500/);
  });

  it("echoue proprement sur ZIP corrompu", async () => {
    await run(async () => new Response(Buffer.from("pas un zip")));
    expect((await lastRun()).status).toBe("failed");
  });

  it("echoue proprement sur timeout", async () => {
    await run(async () => {
      throw Object.assign(new Error("aborted"), { name: "AbortError" });
    });
    const row = await lastRun();
    expect(row.status).toBe("failed");
    expect(row.error).toMatch(/Delai/);
  });

  it("echoue proprement sur flux trop volumineux", async () => {
    await run(
      async () =>
        new Response(new Uint8Array(10), { headers: { "content-length": String(1_000_000) } }),
    );
    const row = await lastRun();
    expect(row.status).toBe("failed");
    expect(row.error).toMatch(/volumineux/);
  });

  it("conserve les dernieres donnees valides apres un echec", async () => {
    await run(async () => new Response("erreur", { status: 503 }));
    const stations = await db.execute(
      sql`SELECT count(*)::int AS n FROM stations WHERE id = 900501`,
    );
    expect((stations.rows[0] as { n: number }).n).toBe(1);
  });

  it("reste idempotent au rejeu", async () => {
    await run(async () => new Response(validZip()));
    const before = await db.execute(
      sql`SELECT count(*)::int AS n FROM fuel_price_history WHERE station_id >= 900000`,
    );
    await run(async () => new Response(validZip()));
    const after = await db.execute(
      sql`SELECT count(*)::int AS n FROM fuel_price_history WHERE station_id >= 900000`,
    );
    expect((after.rows[0] as { n: number }).n).toBe((before.rows[0] as { n: number }).n);
  });
});
