import { describe, expect, it } from "vitest";
import { SlidingWindowLimiter } from "../../src/modules/auth/rateLimit.js";

describe("SlidingWindowLimiter", () => {
  it("autorise N requetes puis refuse la N+1", () => {
    const limiter = new SlidingWindowLimiter(60_000, () => 0);
    expect(limiter.check("cle", 3).allowed).toBe(true);
    expect(limiter.check("cle", 3).allowed).toBe(true);
    expect(limiter.check("cle", 3).allowed).toBe(true);
    const denied = limiter.check("cle", 3);
    expect(denied.allowed).toBe(false);
    expect(denied.remaining).toBe(0);
    expect(denied.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("expose un restant decroissant", () => {
    const limiter = new SlidingWindowLimiter(60_000, () => 0);
    expect(limiter.check("cle", 3).remaining).toBe(2);
    expect(limiter.check("cle", 3).remaining).toBe(1);
    expect(limiter.check("cle", 3).remaining).toBe(0);
  });

  it("reste limite juste apres la bascule de fenetre (glissement)", () => {
    let now = 0;
    const limiter = new SlidingWindowLimiter(60_000, () => now);
    for (let i = 0; i < 3; i += 1) limiter.check("cle", 3);
    now = 60_000;
    expect(limiter.check("cle", 3).allowed).toBe(false);
  });

  it("redevient permissif au fil de la fenetre suivante", () => {
    let now = 0;
    const limiter = new SlidingWindowLimiter(60_000, () => now);
    for (let i = 0; i < 3; i += 1) limiter.check("cle", 3);
    now = 90_000; // mi-fenetre suivante : poids du precedent = 0,5
    expect(limiter.check("cle", 3).allowed).toBe(true);
  });

  it("repart de zero apres une fenetre d'inactivite complete", () => {
    let now = 0;
    const limiter = new SlidingWindowLimiter(60_000, () => now);
    for (let i = 0; i < 3; i += 1) limiter.check("cle", 3);
    now = 180_000; // deux fenetres plus tard
    const result = limiter.check("cle", 3);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(2);
  });

  it("isole les compteurs par cle", () => {
    const limiter = new SlidingWindowLimiter(60_000, () => 0);
    expect(limiter.check("a", 1).allowed).toBe(true);
    expect(limiter.check("b", 1).allowed).toBe(true);
    expect(limiter.check("a", 1).allowed).toBe(false);
  });
});
