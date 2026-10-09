import { describe, expect, it } from "vitest";
import { LruCache } from "../../src/modules/geocode/cache.js";

describe("LruCache", () => {
  it("evince l'entree la moins recemment utilisee", () => {
    const cache = new LruCache<number>(2);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.get("a");
    cache.set("c", 3);
    expect(cache.get("a")).toBe(1);
    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("c")).toBe(3);
    expect(cache.size).toBe(2);
  });

  it("ne depasse jamais la borne", () => {
    const cache = new LruCache<number>(3);
    for (let i = 0; i < 10; i += 1) cache.set(`k${i}`, i);
    expect(cache.size).toBe(3);
    expect(cache.get("k9")).toBe(9);
  });
});
