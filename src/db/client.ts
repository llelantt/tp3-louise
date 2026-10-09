import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import type { AppConfig } from "../config.js";
import * as schema from "./schema.js";

/** Cree le pool de connexions PostgreSQL, avec un delai maximal par requete. */
export function createPool(config: AppConfig): Pool {
  return new Pool({
    connectionString: config.DATABASE_URL,
    max: 10,
    statement_timeout: config.DB_STATEMENT_TIMEOUT_MS,
  });
}

/** Instancie Drizzle sur un pool existant, avec le schema complet. */
export function createDb(pool: Pool) {
  return drizzle(pool, { schema });
}

export type Db = ReturnType<typeof createDb>;
