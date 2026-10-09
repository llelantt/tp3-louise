import { sql } from "drizzle-orm";
import type { Db } from "../../db/client.js";
import type { Fuel } from "../../db/schema.js";
import type { PricePoint, SortKey, StationCandidate, StationDetail } from "./service.js";

interface CandidateRow extends Record<string, unknown> {
  id: string | number;
  name: string;
  brand: string | null;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  lat: number;
  lon: number;
  price: string;
  observed_at: Date | string;
  distance_km: number;
  reference_total_cost: number | string | null;
  total_matches: string | number;
}

export interface FindCandidatesParams {
  lat: number;
  lon: number;
  radiusKm: number;
  fuel: Fuel;
  liters: number;
  consumptionLPer100Km: number;
  sort: SortKey;
  limit: number;
}

export interface CandidatesResult {
  candidates: StationCandidate[];
  referenceTotalCost: number | null;
  totalMatches: number;
}

/**
 * Lit les stations du rayon, triees en SQL selon le critere demande (cout reel calcule en
 * base, prix ou distance) AVANT le LIMIT, avec tie-break deterministe (distance, id).
 * Renvoie aussi le cout total de la station la plus proche (reference) et le nombre total
 * de correspondances (pour signaler une reponse tronquee).
 */
export async function findCandidates(
  db: Db,
  params: FindCandidatesParams,
): Promise<CandidatesResult> {
  const radiusMeters = params.radiusKm * 1000;
  const point = sql`ST_SetSRID(ST_MakePoint(${params.lon}, ${params.lat}), 4326)::geography`;
  const totalCostExpr = sql`(
    ${params.liters} * f.price
    + 2 * (ST_Distance(s.geom::geography, ${point}) / 1000.0)
      * 1.3 * (${params.consumptionLPer100Km} / 100.0) * f.price
  )`;
  const orderBy =
    params.sort === "price"
      ? sql`c.price ASC, c.distance_km ASC, c.id ASC`
      : params.sort === "distance"
        ? sql`c.distance_km ASC, c.id ASC`
        : sql`c.total_cost ASC, c.distance_km ASC, c.id ASC`;

  const result = await db.execute<CandidateRow>(sql`
    WITH candidates AS (
      SELECT
        s.id, s.name, s.brand, s.address, s.city, s.postal_code, s.lat, s.lon,
        f.price, f.observed_at,
        ST_Distance(s.geom::geography, ${point}) / 1000.0 AS distance_km,
        ${totalCostExpr} AS total_cost
      FROM stations s
      JOIN station_fuels f ON f.station_id = s.id AND f.fuel = ${params.fuel}
      WHERE f.is_stale = false
        AND f.is_rupture = false
        AND s.is_closed = false
        AND ST_DWithin(s.geom::geography, ${point}, ${radiusMeters})
    )
    SELECT
      c.*,
      (SELECT total_cost FROM candidates ORDER BY distance_km ASC, id ASC LIMIT 1)
        AS reference_total_cost,
      COUNT(*) OVER () AS total_matches
    FROM candidates c
    ORDER BY ${orderBy}
    LIMIT ${params.limit}
  `);

  const first = result.rows[0];
  if (!first) {
    return { candidates: [], referenceTotalCost: null, totalMatches: 0 };
  }

  return {
    candidates: result.rows.map((row) => ({
      id: Number(row.id),
      name: row.name,
      brand: row.brand,
      address: row.address,
      city: row.city,
      postalCode: row.postal_code,
      lat: Number(row.lat),
      lon: Number(row.lon),
      price: Number(row.price),
      observedAt: row.observed_at instanceof Date ? row.observed_at : new Date(row.observed_at),
      distanceKm: Number(row.distance_km),
    })),
    referenceTotalCost:
      first.reference_total_cost === null ? null : Number(first.reference_total_cost),
    totalMatches: Number(first.total_matches),
  };
}

interface StationRow extends Record<string, unknown> {
  id: string | number;
  name: string;
  brand: string | null;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  lat: number;
  lon: number;
  is_24h: boolean;
  is_closed: boolean;
  services: string[] | null;
  source_updated_at: Date | string | null;
}

interface FuelRow extends Record<string, unknown> {
  fuel: Fuel;
  price: string;
  observed_at: Date | string;
  is_stale: boolean;
  is_rupture: boolean;
}

interface HistoryRow extends Record<string, unknown> {
  fuel: Fuel;
  price: string;
  observed_at: Date | string;
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

export interface HistoryOptions {
  historyDays: number;
  maxPoints: number;
}

/** Lit le detail d'une station et l'historique recent de chaque carburant. */
export async function getStationDetail(
  db: Db,
  id: number,
  options: HistoryOptions,
): Promise<StationDetail | null> {
  const stationResult = await db.execute<StationRow>(sql`
    SELECT id, name, brand, address, city, postal_code, lat, lon,
           is_24h, is_closed, services, source_updated_at
    FROM stations
    WHERE id = ${id}
  `);
  const station = stationResult.rows[0];
  if (!station) return null;

  const fuelsResult = await db.execute<FuelRow>(sql`
    SELECT fuel, price, observed_at, is_stale, is_rupture
    FROM station_fuels
    WHERE station_id = ${id}
    ORDER BY fuel
  `);

  const historyResult = await db.execute<HistoryRow>(sql`
    SELECT fuel, price, observed_at FROM (
      SELECT fuel, price, observed_at,
             row_number() OVER (PARTITION BY fuel ORDER BY observed_at DESC) AS rn
      FROM fuel_price_history
      WHERE station_id = ${id}
        AND observed_at >= now() - (${options.historyDays}::int * interval '1 day')
    ) ranked
    WHERE rn <= ${options.maxPoints}
    ORDER BY fuel, observed_at DESC
  `);

  const historyByFuel = new Map<Fuel, PricePoint[]>();
  for (const row of historyResult.rows) {
    const points = historyByFuel.get(row.fuel) ?? [];
    points.push({ observedAt: toDate(row.observed_at), price: Number(row.price) });
    historyByFuel.set(row.fuel, points);
  }

  return {
    id: Number(station.id),
    name: station.name,
    brand: station.brand,
    address: station.address,
    city: station.city,
    postalCode: station.postal_code,
    lat: Number(station.lat),
    lon: Number(station.lon),
    is24h: station.is_24h,
    isClosed: station.is_closed,
    services: station.services ?? [],
    sourceUpdatedAt: station.source_updated_at ? toDate(station.source_updated_at) : null,
    fuels: fuelsResult.rows.map((row) => ({
      fuel: row.fuel,
      price: Number(row.price),
      observedAt: toDate(row.observed_at),
      isStale: row.is_stale,
      isRupture: row.is_rupture,
      history: historyByFuel.get(row.fuel) ?? [],
    })),
  };
}
