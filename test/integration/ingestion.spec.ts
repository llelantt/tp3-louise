import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb } from "../../src/db/client.js";
import { markStalePrices } from "../../src/ingestion/markStale.js";
import { parseStationsXml } from "../../src/ingestion/parseStations.js";
import { upsertStations } from "../../src/ingestion/upsert.js";

// Test d'integration : ne s'execute qu'avec une base PostgreSQL/PostGIS (CI).
const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;

const xml = `<?xml version="1.0" encoding="utf-8"?>
<pdv_liste>
  <pdv id="900101" latitude="4885000" longitude="235000" cp="75001" adresse="1 rue" ville="Paris">
    <prix nom="Gazole" valeur="1.799" maj="2026-10-08T10:00:00Z"/>
    <prix nom="SP95" valeur="1.899" maj="2026-10-08T10:00:00Z"/>
  </pdv>
  <pdv id="900102" latitude="4887000" longitude="236000" cp="75002" adresse="2 rue" ville="Paris">
    <prix nom="Gazole" valeur="1.699" maj="2026-10-08T09:00:00Z"/>
  </pdv>
</pdv_liste>`;

describe.skipIf(!databaseUrl)("ingestion (integration)", () => {
  let pool: Pool;
  let db: ReturnType<typeof createDb>;

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

  it("insere les stations, l'etat courant et l'historique", async () => {
    const parsed = parseStationsXml(xml);
    const result = await upsertStations(db, parsed.stations);

    expect(result.stations).toBe(2);
    expect(result.pricesInserted).toBe(3);
    expect(result.pricesSkipped).toBe(0);

    const fuels = await db.execute(sql`
      SELECT count(*)::int AS n FROM station_fuels WHERE station_id >= 900000
    `);
    expect((fuels.rows[0] as { n: number }).n).toBe(3);
  });

  it("est idempotent : rejouer le flux n'ajoute pas d'historique", async () => {
    const parsed = parseStationsXml(xml);
    const second = await upsertStations(db, parsed.stations);

    expect(second.pricesInserted).toBe(0);
    expect(second.pricesSkipped).toBe(3);

    const history = await db.execute(sql`
      SELECT count(*)::int AS n FROM fuel_price_history WHERE station_id >= 900000
    `);
    expect((history.rows[0] as { n: number }).n).toBe(3);
  });

  it("marque comme perimes les prix trop anciens", async () => {
    await db.execute(sql`
      UPDATE station_fuels
      SET observed_at = now() - interval '10 days', is_stale = false
      WHERE station_id >= 900000
    `);

    const marked = await markStalePrices(db, 3);
    expect(marked).toBeGreaterThan(0);

    const stale = await db.execute(sql`
      SELECT count(*)::int AS n FROM station_fuels
      WHERE station_id >= 900000 AND is_stale = true
    `);
    expect((stale.rows[0] as { n: number }).n).toBe(3);
  });
});
