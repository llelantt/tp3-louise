import { eq } from "drizzle-orm";
import type { AppConfig } from "../config.js";
import type { Db } from "../db/client.js";
import { ingestionRuns } from "../db/schema.js";
import type { Logger } from "../lib/logger.js";
import { fetchFeed } from "./fetchFeed.js";
import { markStalePrices } from "./markStale.js";
import { parseStationsXml } from "./parseStations.js";
import { upsertStations } from "./upsert.js";
import { extractXmlFromZip } from "./zip.js";

export interface IngestionDeps {
  db: Db;
  config: AppConfig;
  logger: Logger;
  fetchImpl?: typeof fetch;
}

/**
 * Execute une passe d'ingestion complete et la journalise dans ingestion_runs.
 * Ne leve jamais : une panne du flux ne doit pas faire tomber l'API, on conserve
 * les dernieres donnees valides et on enregistre l'erreur.
 */
export async function runIngestion(deps: IngestionDeps): Promise<void> {
  const { db, config, logger } = deps;
  const [run] = await db
    .insert(ingestionRuns)
    .values({ source: config.INGEST_INSTANT_URL, status: "running" })
    .returning({ id: ingestionRuns.id });
  const runId = run?.id;

  try {
    const archive = await fetchFeed({
      url: config.INGEST_INSTANT_URL,
      maxBytes: config.INGEST_MAX_ARCHIVE_BYTES,
      fetchImpl: deps.fetchImpl,
    });
    const entry = extractXmlFromZip(archive, config.INGEST_MAX_ARCHIVE_BYTES);
    const parsed = parseStationsXml(entry.data.toString("utf8"));
    const result = await upsertStations(db, parsed.stations);
    const stale = await markStalePrices(db, config.PRICE_STALE_AFTER_DAYS);

    if (runId) {
      await db
        .update(ingestionRuns)
        .set({
          status: "success",
          finishedAt: new Date(),
          stationsUpserted: result.stations,
          pricesInserted: result.pricesInserted,
          pricesSkipped: result.pricesSkipped,
        })
        .where(eq(ingestionRuns.id, runId));
    }

    logger.info({ ...result, skipped: parsed.skipped, staleMarked: stale }, "ingestion terminee");
  } catch (error) {
    if (runId) {
      await db
        .update(ingestionRuns)
        .set({
          status: "failed",
          finishedAt: new Date(),
          error: error instanceof Error ? error.message : String(error),
        })
        .where(eq(ingestionRuns.id, runId));
    }
    logger.error({ err: error }, "ingestion en echec : dernieres donnees conservees");
  }
}
