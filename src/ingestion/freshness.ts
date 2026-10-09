import { sql } from "drizzle-orm";
import type { Db } from "../db/client.js";

export interface DataFreshness {
  last_success_at: string | null;
  age_seconds: number | null;
}

/** Age de la derniere ingestion reussie : indicateur de fraicheur des donnees. */
export async function getDataFreshness(db: Db): Promise<DataFreshness> {
  const result = await db.execute(sql`
    SELECT finished_at FROM ingestion_runs
    WHERE status = 'success' AND finished_at IS NOT NULL
    ORDER BY finished_at DESC
    LIMIT 1
  `);
  const row = result.rows[0] as { finished_at: Date | string } | undefined;
  if (!row) return { last_success_at: null, age_seconds: null };
  const at = row.finished_at instanceof Date ? row.finished_at : new Date(row.finished_at);
  return {
    last_success_at: at.toISOString(),
    age_seconds: Math.max(0, Math.floor((Date.now() - at.getTime()) / 1000)),
  };
}
