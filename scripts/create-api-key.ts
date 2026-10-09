import { getConfig } from "../src/config.js";
import { createDb, createPool } from "../src/db/client.js";
import { apiKeys } from "../src/db/schema.js";
import { generateApiKey, hashApiKey } from "../src/lib/apiKeys.js";

/** Cree une cle API, l'affiche une seule fois et ne stocke que son empreinte. */
async function main(): Promise<void> {
  const name = process.argv[2];
  if (!name) {
    console.error("usage: npm run create-key -- <nom-de-la-cle>");
    process.exit(1);
  }

  const config = getConfig();
  const pool = createPool(config);
  try {
    const key = generateApiKey();
    const [row] = await createDb(pool)
      .insert(apiKeys)
      .values({ keyHash: hashApiKey(key, config.API_KEY_PEPPER), name })
      .returning({ id: apiKeys.id });

    console.log(`Cle API creee pour "${name}" (id ${row?.id ?? "?"}).`);
    console.log(`Cle (a conserver, non re-affichable) : ${key}`);
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error("echec de la creation de cle:", error);
  process.exit(1);
});
