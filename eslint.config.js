import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/**", "coverage/**", "node_modules/**", "drizzle/**"] },
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/ban-ts-comment": "error",
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-import-type-side-effects": "error",
      eqeqeq: ["error", "always"],
      "prefer-const": "error",
      "no-console": ["error", { allow: ["error"] }],
    },
  },
  {
    files: ["src/server.ts", "src/db/migrate.ts", "scripts/**/*.ts"],
    rules: { "no-console": "off" },
  },
);
