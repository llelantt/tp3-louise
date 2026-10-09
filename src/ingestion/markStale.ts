import { sql } from "drizzle-orm";
import type { Db } from "../db/client.js";

/** Marque comme perimes les prix dont la derniere mise a jour depasse le delai. */
export async function markStalePrices(db: Db, staleAfterDays: number): Promise<number> {
  const result = await db.execute(sql`
    UPDATE station_fuels
    SET is_stale = true
    WHERE is_stale = false
      AND observed_at < now() - (${staleAfterDays}::int * interval '1 day')
  `);
  return result.rowCount ?? 0;
}
