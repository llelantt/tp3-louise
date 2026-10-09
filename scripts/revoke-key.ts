import { eq } from "drizzle-orm";
import { getConfig } from "../src/config.js";
import { createDb, createPool } from "../src/db/client.js";
import { apiKeys } from "../src/db/schema.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Revoque une cle API (desactive son usage) par identifiant ou par nom.
 * Usage : npm run revoke-key -- <id-ou-nom>
 */
async function main(): Promise<void> {
  const target = process.argv[2];
  if (!target) {
    console.error("usage: npm run revoke-key -- <id-ou-nom>");
    process.exit(1);
  }

  const config = getConfig();
  const pool = createPool(config);
  try {
    const db = createDb(pool);
    const where = UUID_PATTERN.test(target) ? eq(apiKeys.id, target) : eq(apiKeys.name, target);
    const revoked = await db
      .update(apiKeys)
      .set({ isActive: false })
      .where(where)
      .returning({ id: apiKeys.id });

    console.log(`Cles revoquees : ${revoked.length}`);
    for (const row of revoked) console.log(`  - ${row.id}`);
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error("echec de la revocation:", error);
  process.exit(1);
});
