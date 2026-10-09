import { buildApp } from "./app.js";
import { getConfig } from "./config.js";
import { createLogger } from "./lib/logger.js";

const config = getConfig();
const logger = createLogger(config);

const app = await buildApp({ config, logger });

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
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
