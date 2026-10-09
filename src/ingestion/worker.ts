import { type IngestionDeps, runIngestion } from "./runIngestion.js";

/**
 * Demarre le worker d'ingestion periodique et lance une premiere passe.
 * Retourne une fonction d'arret. Sans effet si l'ingestion est desactivee.
 */
export function startIngestionWorker(deps: IngestionDeps): () => void {
  if (!deps.config.INGEST_ENABLED) {
    deps.logger.info("ingestion desactivee (INGEST_ENABLED=false)");
    return () => {};
  }

  const intervalMs = deps.config.INGEST_INTERVAL_MINUTES * 60_000;
  const timer = setInterval(() => {
    void runIngestion(deps);
  }, intervalMs);
  timer.unref();

  void runIngestion(deps);
  deps.logger.info(
    { intervalMinutes: deps.config.INGEST_INTERVAL_MINUTES },
    "worker d'ingestion demarre",
  );

  return () => clearInterval(timer);
}
