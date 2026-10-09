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
  limit: number;
  /** Cout total de la station la plus proche, fourni par la base : reference de l'economie. */
  referenceTotalCost: number;
}

/** Une station enrichie de son cout de detour, de son cout total et de son economie. */
export interface RankedStation extends StationCandidate {
  detourCost: number;
  totalCost: number;
  economyVsNearest: number;
}

function compare(a: RankedStation, b: RankedStation, sort: SortKey): number {
  if (sort === "price") {
    return a.price - b.price || a.distanceKm - b.distanceKm || a.id - b.id;
  }
  if (sort === "distance") {
    return a.distanceKm - b.distanceKm || a.id - b.id;
  }
  return a.totalCost - b.totalCost || a.distanceKm - b.distanceKm || a.id - b.id;
}

/**
 * Enrichit des stations (deja triees et bornees en base) de leur cout de detour, de leur
 * cout total et de leur economie face a la station la plus proche.
 * Fonction pure : aucun acces base ni HTTP, entierement testable.
 */
export function rankStations(
  candidates: readonly StationCandidate[],
  options: RankOptions,
): RankedStation[] {
  if (candidates.length === 0) return [];

  const ranked: RankedStation[] = candidates.map((candidate) => {
    const input = {
      pricePerLiter: candidate.price,
      distanceKm: candidate.distanceKm,
      liters: options.liters,
      consumptionLPer100Km: options.consumptionLPer100Km,
    };
    const total = totalCost(input);
    return {
      ...candidate,
      detourCost: round(detourCost(input)),
      totalCost: round(total),
      economyVsNearest: round(options.referenceTotalCost - total),
    };
  });

  ranked.sort((a, b) => compare(a, b, options.sort));

  return ranked.slice(0, options.limit);
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
