import { describe, expect, it } from "vitest";
import { generateApiKey, hashApiKey } from "../../src/lib/apiKeys.js";

describe("cles API", () => {
  it("genere une cle prefixee et unique", () => {
    const first = generateApiKey();
    const second = generateApiKey();
    expect(first).toMatch(/^ck_/);
    expect(first).not.toBe(second);
  });

  it("hache de facon deterministe, poivree et de longueur SHA-256", () => {
    const key = "ck_exemple";
    expect(hashApiKey(key, "p1")).toBe(hashApiKey(key, "p1"));
    expect(hashApiKey(key, "p1")).not.toBe(hashApiKey(key, "p2"));
    expect(hashApiKey(key, "p1")).toHaveLength(64);
  });
});
