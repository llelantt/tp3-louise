import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CONFIG } from "../../public/config.js";
import { buildApp, type App } from "../../src/app.js";
import { parseConfig } from "../../src/config.js";
import type { Db } from "../../src/db/client.js";
import { createLogger } from "../../src/lib/logger.js";

// Verifie que l'objet CONFIG du front correspond EXACTEMENT a l'OpenAPI de l'API.
interface QueryParameter {
  name: string;
  in: string;
  schema?: { enum?: string[] };
}
interface OpenApiLike {
  paths: Record<string, { get?: { parameters?: QueryParameter[] } }>;
}

const fakeDb = {} as unknown as Db;

describe("contrat CONFIG <-> OpenAPI", () => {
  let app: App;
  let spec: OpenApiLike;

  beforeAll(async () => {
    const config = parseConfig({
      DATABASE_URL: "postgres://user:pass@localhost:5432/carbu",
      API_KEY_PEPPER: "pepper-de-test",
      NODE_ENV: "test",
      LOG_LEVEL: "silent",
    });
    app = await buildApp({ config, logger: createLogger(config), db: fakeDb });
    await app.ready();
    spec = (await app.inject({ method: "GET", url: "/docs/json" })).json() as OpenApiLike;
  });

  afterAll(async () => {
    await app.close();
  });

  function queryEnum(path: string, name: string): string[] | undefined {
    const parameters = spec.paths[path]?.get?.parameters ?? [];
    return parameters.find((param) => param.name === name && param.in === "query")?.schema?.enum;
  }

  it("la base du front correspond au prefixe des routes metier", () => {
    expect(CONFIG.base).toBe("/v1");
    for (const path of Object.keys(spec.paths)) {
      if (/^\/(stations|alerts|geocode)/.test(path.replace("/v1", ""))) {
        expect(path.startsWith("/v1/")).toBe(true);
      }
    }
  });

  it("les carburants du front correspondent a l'enum de l'API", () => {
    const apiFuels = queryEnum("/v1/stations/cheapest", "fuel");
    expect(apiFuels).toBeDefined();
    expect(CONFIG.fuels.map((fuel) => fuel.value).sort()).toEqual([...(apiFuels ?? [])].sort());
  });

  it("les tris du front correspondent a l'enum de l'API", () => {
    const apiSorts = queryEnum("/v1/stations/cheapest", "sort");
    expect(apiSorts).toBeDefined();
    expect(CONFIG.sorts.map((sort) => sort.value).sort()).toEqual([...(apiSorts ?? [])].sort());
  });
});
