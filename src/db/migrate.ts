import { migrate } from "drizzle-orm/node-postgres/migrator";
import { getConfig } from "../config.js";
import { createDb, createPool } from "./client.js";

/** Applique les migrations SQL du dossier drizzle/ puis ferme le pool. */
async function main(): Promise<void> {
  const config = getConfig();
  const pool = createPool(config);
  try {
    await migrate(createDb(pool), { migrationsFolder: "drizzle" });
    console.log("migrations appliquees");
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error("echec des migrations:", error);
  process.exit(1);
});
