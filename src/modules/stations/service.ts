import type { Fuel } from "../../db/schema.js";
import { detourCost, round, totalCost } from "../../lib/cost.js";

/** Cles de tri acceptees par la recherche. */
export type SortKey = "total_cost" | "price" | "distance";

/** Une station candidate telle que lue en base, avec sa distance au point cherche. */
export interface StationCandidate {
  id: number;
  name: string;
  brand: string | null;
  address: string | null;
  city: string | null;
  postalCode: string | null;
  lat: number;
  lon: number;
  price: number;
  observedAt: Date;
  distanceKm: number;
}

export interface RankOptions {
  liters: number;
  consumptionLPer100Km: number;
  sort: SortKey;
  limit?: number;
}

/** Une station enrichie de son cout de detour, de son cout total et de son economie. */
export interface RankedStation extends StationCandidate {
  detourCost: number;
  totalCost: number;
  economyVsNearest: number;
}

function compare(a: RankedStation, b: RankedStation, sort: SortKey): number {
  if (sort === "price") return a.price - b.price || a.totalCost - b.totalCost;
  if (sort === "distance") return a.distanceKm - b.distanceKm;
  return a.totalCost - b.totalCost || a.distanceKm - b.distanceKm;
}

/**
 * Classe des stations par cout reel, en comparant chacune a la station la plus proche.
 * Fonction pure : aucun acces base ni HTTP, entierement testable.
 */
export function rankStations(
  candidates: readonly StationCandidate[],
  options: RankOptions,
): RankedStation[] {
  if (candidates.length === 0) return [];

  const enriched: Omit<RankedStation, "economyVsNearest">[] = candidates.map((candidate) => {
    const input = {
      pricePerLiter: candidate.price,
      distanceKm: candidate.distanceKm,
      liters: options.liters,
      consumptionLPer100Km: options.consumptionLPer100Km,
    };
    return {
      ...candidate,
      detourCost: round(detourCost(input)),
      totalCost: round(totalCost(input)),
    };
  });

  const nearest = enriched.reduce((best, current) =>
    current.distanceKm < best.distanceKm ? current : best,
  );

  const ranked: RankedStation[] = enriched.map((station) => ({
    ...station,
    economyVsNearest: round(nearest.totalCost - station.totalCost),
  }));

  ranked.sort((a, b) => compare(a, b, options.sort));

  return options.limit !== undefined ? ranked.slice(0, options.limit) : ranked;
}

/** Un point de l'historique des prix d'un carburant. */
export interface PricePoint {
  observedAt: Date;
  price: number;
}

/** L'etat courant d'un carburant et son historique recent. */
export interface StationFuelDetail {
  fuel: Fuel;
  price: number;
  observedAt: Date;
  isStale: boolean;
  isRupture: boolean;
  history: PricePoint[];
}

/** Le detail complet d'une station. */
export interface StationDetail {
  id: number;
  name: string;
  brand: string | null;
  address: string | null;
  city: string | null;
  postalCode: string | null;
  lat: number;
  lon: number;
  is24h: boolean;
  isClosed: boolean;
  services: string[];
  sourceUpdatedAt: Date | null;
  fuels: StationFuelDetail[];
}
