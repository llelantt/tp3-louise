// Checks post-ecriture : des qu'un agent ecrit un fichier .ts, on relance
// typecheck + lint + tests unitaires et on colle la sortie dans le resultat de
// l'outil, pour que l'agent voie le rouge sans qu'on ait a le lui demander.
//
// Charge depuis .opencode/plugins/ (emplacement documente) sur l'evenement
// "tool.execute.after". Un check rouge interrompt l'agent (throw) : un filet qui
// n'arrete personne ne protege de rien.
//
// Portabilite : on appelle les scripts npm directement (pas de `bash script.sh`),
// pour que le hook fonctionne aussi sous Windows.
export const ChecksPlugin = async ({ $, directory }) => {
  return {
    "tool.execute.after": async (input, output) => {
      if (input.tool !== "edit" && input.tool !== "write") return;
      const file = input.args?.filePath ?? input.args?.path ?? "";
      if (!file.endsWith(".ts")) return;

      const typecheck = await $`npm run --silent typecheck`.cwd(directory).quiet().nothrow();
      const lint = await $`npm run --silent lint`.cwd(directory).quiet().nothrow();
      const tests = await $`npm run --silent test:unit`.cwd(directory).quiet().nothrow();

      const report = [
        "--- checks post-ecriture ---",
        `--- typecheck (exit ${typecheck.exitCode})`,
        typecheck.stdout.toString(),
        typecheck.stderr.toString(),
        `--- lint (exit ${lint.exitCode})`,
        lint.stdout.toString(),
        lint.stderr.toString(),
        `--- tests (exit ${tests.exitCode})`,
        tests.stdout.toString(),
        tests.stderr.toString(),
      ].join("\n");

      output.output += "\n\n" + report;

      const failed = typecheck.exitCode !== 0 || lint.exitCode !== 0 || tests.exitCode !== 0;
      if (failed) {
        throw new Error("checks post-ecriture rouges apres " + file + " :\n" + report);
      }
    },
  };
};
