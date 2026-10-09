import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.spec.ts", "test/**/*.test.ts"],
    environment: "node",
    // Les tests d'integration partagent une meme base : on serialise les fichiers
    // pour eviter qu'ils ne se suppriment mutuellement leurs donnees.
    fileParallelism: false,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
    },
  },
});
