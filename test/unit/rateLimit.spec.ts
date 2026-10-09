import { describe, expect, it } from "vitest";
import { SlidingWindowLimiter } from "../../src/modules/auth/rateLimit.js";

describe("SlidingWindowLimiter", () => {
  it("autorise jusqu'a la limite puis refuse", () => {
    const limiter = new SlidingWindowLimiter(60_000, () => 0);
    expect(limiter.consume("cle", 2)).toBe(true);
    expect(limiter.consume("cle", 2)).toBe(true);
    expect(limiter.consume("cle", 2)).toBe(false);
  });

  it("reinitialise le compteur apres la fenetre", () => {
    let now = 0;
    const limiter = new SlidingWindowLimiter(60_000, () => now);
    limiter.consume("cle", 1);
    expect(limiter.consume("cle", 1)).toBe(false);
    now = 60_001;
    expect(limiter.consume("cle", 1)).toBe(true);
  });

  it("isole les compteurs par cle", () => {
    const limiter = new SlidingWindowLimiter(60_000, () => 0);
    expect(limiter.consume("a", 1)).toBe(true);
    expect(limiter.consume("b", 1)).toBe(true);
    expect(limiter.consume("a", 1)).toBe(false);
  });
});
