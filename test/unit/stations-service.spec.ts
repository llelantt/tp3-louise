import { describe, expect, it } from "vitest";
import { rankStations, type StationCandidate } from "../../src/modules/stations/service.js";

function candidate(overrides: Partial<StationCandidate>): StationCandidate {
  return {
    id: 1,
    name: "Station",
    brand: "Marque",
    address: "1 rue",
    city: "Ville",
    postalCode: "75001",
    lat: 48.85,
    lon: 2.35,
    price: 1.8,
    observedAt: new Date("2026-10-01T10:00:00Z"),
    distanceKm: 1,
    ...overrides,
  };
}

const options = { liters: 50, consumptionLPer100Km: 6, sort: "total_cost" as const };

describe("rankStations", () => {
  it("retourne un tableau vide sans candidat", () => {
    expect(rankStations([], options)).toEqual([]);
  });

  it("calcule le cout total et le detour de chaque station", () => {
    const [ranked] = rankStations([candidate({ price: 1.8, distanceKm: 5 })], options);
    expect(ranked?.totalCost).toBe(91.4);
    expect(ranked?.detourCost).toBe(1.4);
  });

  it("donne une economie nulle a la station la plus proche", () => {
    const ranked = rankStations(
      [candidate({ id: 1, distanceKm: 1 }), candidate({ id: 2, distanceKm: 4 })],
      options,
    );
    const nearest = ranked.find((s) => s.id === 1);
    expect(nearest?.economyVsNearest).toBe(0);
  });

  it("donne une economie positive a une station plus loin mais moins chere", () => {
    const ranked = rankStations(
      [
        candidate({ id: 1, distanceKm: 1, price: 2.0 }),
        candidate({ id: 2, distanceKm: 6, price: 1.7 }),
      ],
      options,
    );
    const cheaper = ranked.find((s) => s.id === 2);
    expect(cheaper?.economyVsNearest).toBeGreaterThan(0);
  });

  it("trie par cout total par defaut", () => {
    const ranked = rankStations(
      [
        candidate({ id: 1, distanceKm: 1, price: 2.0 }),
        candidate({ id: 2, distanceKm: 6, price: 1.7 }),
      ],
      options,
    );
    expect(ranked.map((s) => s.id)).toEqual([2, 1]);
  });

  it("trie par prix au litre quand demande", () => {
    const ranked = rankStations(
      [
        candidate({ id: 1, distanceKm: 1, price: 2.0 }),
        candidate({ id: 2, distanceKm: 6, price: 1.7 }),
      ],
      { ...options, sort: "price" },
    );
    expect(ranked.map((s) => s.id)).toEqual([2, 1]);
  });

  it("trie par distance quand demande", () => {
    const ranked = rankStations(
      [
        candidate({ id: 1, distanceKm: 6, price: 1.7 }),
        candidate({ id: 2, distanceKm: 1, price: 2.0 }),
      ],
      { ...options, sort: "distance" },
    );
    expect(ranked.map((s) => s.id)).toEqual([2, 1]);
  });

  it("respecte la limite", () => {
    const ranked = rankStations(
      [
        candidate({ id: 1 }),
        candidate({ id: 2, distanceKm: 2 }),
        candidate({ id: 3, distanceKm: 3 }),
      ],
      { ...options, limit: 2 },
    );
    expect(ranked).toHaveLength(2);
  });
});
