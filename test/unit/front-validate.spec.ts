import { describe, expect, it } from "vitest";
import { isValidAddressQuery, validateSearch } from "../../public/validate.js";

const valid = { lat: 48.85, lon: 2.35, radius_km: 10, liters: 50, consumption: 6 };

describe("validateSearch", () => {
  it("accepte des valeurs valides", () => {
    expect(validateSearch(valid)).toEqual({});
  });

  it("rejette des coordonnees absurdes", () => {
    expect(validateSearch({ ...valid, lat: 999 })).toHaveProperty("lat");
    expect(validateSearch({ ...valid, lon: -999 })).toHaveProperty("lon");
    expect(validateSearch({ ...valid, lat: "abc" })).toHaveProperty("lat");
  });

  it("rejette rayon, litres et consommation hors bornes ou vides", () => {
    expect(validateSearch({ ...valid, radius_km: -5 })).toHaveProperty("radius_km");
    expect(validateSearch({ ...valid, radius_km: "" })).toHaveProperty("radius_km");
    expect(validateSearch({ ...valid, radius_km: 9999 })).toHaveProperty("radius_km");
    expect(validateSearch({ ...valid, liters: "abc" })).toHaveProperty("liters");
    expect(validateSearch({ ...valid, consumption: 0 })).toHaveProperty("consumption");
  });
});

describe("isValidAddressQuery", () => {
  it("borne la longueur entre 3 et 200", () => {
    expect(isValidAddressQuery("ab")).toBe(false);
    expect(isValidAddressQuery("  paris  ")).toBe(true);
    expect(isValidAddressQuery("a".repeat(201))).toBe(false);
  });
});
