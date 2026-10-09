import { buildApp } from "./app.js";
import { getConfig } from "./config.js";
import { startIngestionWorker } from "./ingestion/worker.js";
import { createLogger } from "./lib/logger.js";

const config = getConfig();
const logger = createLogger(config);

const app = await buildApp({ config, logger });
const stopIngestion = startIngestionWorker({ db: app.db, config, logger });

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    stopIngestion();
    void app.close().then(() => process.exit(0));
  });
}

try {
  const address = await app.listen({ port: config.PORT, host: config.HOST });
  logger.info(`Carbu API a l'ecoute sur ${address}`);
} catch (error) {
  logger.error({ err: error }, "echec du demarrage");
  process.exit(1);
}
