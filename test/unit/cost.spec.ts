import { describe, expect, it } from "vitest";
import { DETOUR_FACTOR, detourCost, round, totalCost } from "../../src/lib/cost.js";

describe("detourCost", () => {
  it("applique la formule 2 x distance x 1,3 x conso/100 x prix", () => {
    const value = detourCost({
      pricePerLiter: 1.8,
      distanceKm: 5,
      liters: 50,
      consumptionLPer100Km: 6,
    });
    expect(value).toBeCloseTo(2 * 5 * DETOUR_FACTOR * 0.06 * 1.8, 10);
  });

  it("est nul quand la station est sur place", () => {
    expect(
      detourCost({ pricePerLiter: 2, distanceKm: 0, liters: 40, consumptionLPer100Km: 8 }),
    ).toBe(0);
  });

  it("croît avec la distance et avec le prix", () => {
    const base = { liters: 50, consumptionLPer100Km: 6 };
    const near = detourCost({ ...base, pricePerLiter: 1.7, distanceKm: 2 });
    const far = detourCost({ ...base, pricePerLiter: 1.7, distanceKm: 8 });
    const pricier = detourCost({ ...base, pricePerLiter: 2.1, distanceKm: 2 });
    expect(far).toBeGreaterThan(near);
    expect(pricier).toBeGreaterThan(near);
  });
});

describe("totalCost", () => {
  it("additionne le plein et le detour", () => {
    const input = { pricePerLiter: 1.8, distanceKm: 5, liters: 50, consumptionLPer100Km: 6 };
    expect(totalCost(input)).toBeCloseTo(50 * 1.8 + detourCost(input), 10);
  });
});

describe("round", () => {
  it("arrondit au nombre de decimales demande", () => {
    expect(round(91.4042, 2)).toBe(91.4);
    expect(round(1.005, 2)).toBe(1.01);
    expect(round(2.3456, 3)).toBe(2.346);
  });
});
