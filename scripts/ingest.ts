import { getConfig } from "../src/config.js";
import { createDb, createPool } from "../src/db/client.js";
import { createLogger } from "../src/lib/logger.js";
import { runIngestion } from "../src/ingestion/runIngestion.js";

/** Lance une passe d'ingestion unique (usage manuel ou cron externe). */
async function main(): Promise<void> {
  const config = getConfig();
  const logger = createLogger(config);
  const pool = createPool(config);
  try {
    await runIngestion({ db: createDb(pool), config, logger });
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error("echec de l'ingestion:", error);
  process.exit(1);
});
