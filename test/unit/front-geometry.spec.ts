import { describe, expect, it } from "vitest";
import { priceHue, projectToSvg } from "../../public/geometry.js";

describe("projectToSvg", () => {
  it("place le centre au milieu du viewBox", () => {
    const point = projectToSvg(48.85, 2.35, 48.85, 2.35, 10);
    expect(point.x).toBeCloseTo(200, 6);
    expect(point.y).toBeCloseTo(200, 6);
  });

  it("place le nord en haut et l'est a droite", () => {
    const north = projectToSvg(48.86, 2.35, 48.85, 2.35, 10);
    const east = projectToSvg(48.85, 2.36, 48.85, 2.35, 10);
    expect(north.y).toBeLessThan(200);
    expect(east.x).toBeGreaterThan(200);
  });

  it("respecte l'echelle du rayon", () => {
    // 1 degre de latitude ~ 110.57 km ; a radius = 110.57, on atteint ~180 px.
    const point = projectToSvg(49.85, 2.35, 48.85, 2.35, 110.57);
    expect(point.y).toBeCloseTo(20, 0);
  });
});

describe("priceHue", () => {
  it("140 pour le moins cher, 0 pour le plus cher", () => {
    expect(priceHue(1.5, 1.5, 2.0)).toBe(140);
    expect(priceHue(2.0, 1.5, 2.0)).toBe(0);
  });

  it("repli a 140 si les bornes sont invalides", () => {
    expect(priceHue(1.7, 2, 2)).toBe(140);
    expect(priceHue(Number.NaN, 1, 2)).toBe(140);
  });
});
