import { describe, expect, it } from "vitest";
import { generateApiKey, hashApiKey, isValidApiKeyFormat } from "../../src/lib/apiKeys.js";

describe("cles API", () => {
  it("genere une cle de format valide et unique", () => {
    const first = generateApiKey();
    const second = generateApiKey();
    expect(isValidApiKeyFormat(first)).toBe(true);
    expect(first).toHaveLength(46); // "ck_" + 43 caracteres base64url
    expect(first).not.toBe(second);
  });

  it("rejette les formats invalides", () => {
    expect(isValidApiKeyFormat("")).toBe(false);
    expect(isValidApiKeyFormat("ck_")).toBe(false);
    expect(isValidApiKeyFormat("ck_tropcourt")).toBe(false);
    expect(isValidApiKeyFormat(`xk_${"a".repeat(43)}`)).toBe(false);
    expect(isValidApiKeyFormat(`ck_${"a".repeat(42)}`)).toBe(false);
    expect(isValidApiKeyFormat(`ck_${"a".repeat(44)}`)).toBe(false);
    expect(isValidApiKeyFormat(`ck_${"a".repeat(42)}!`)).toBe(false);
  });

  it("hache en HMAC-SHA256 deterministe, poivree et de longueur 64", () => {
    const key = `ck_${"a".repeat(43)}`;
    expect(hashApiKey(key, "p1")).toBe(hashApiKey(key, "p1"));
    expect(hashApiKey(key, "p1")).not.toBe(hashApiKey(key, "p2"));
    expect(hashApiKey(key, "p1")).toHaveLength(64);
  });
});
