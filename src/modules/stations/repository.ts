import { sql } from "drizzle-orm";
import type { Db } from "../../db/client.js";
import type { Fuel } from "../../db/schema.js";
import type { PricePoint, StationCandidate, StationDetail } from "./service.js";

interface RawRow extends Record<string, unknown> {
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
}

export interface FindCandidatesParams {
  lat: number;
  lon: number;
  radiusKm: number;
  fuel: Fuel;
  limit: number;
}

/**
 * Lit les stations dans le rayon, triees par distance croissante.
 * Filtre les prix perimes, les ruptures et les stations fermees.
 */
export async function findCandidates(
  db: Db,
  params: FindCandidatesParams,
): Promise<StationCandidate[]> {
  const radiusMeters = params.radiusKm * 1000;
  const result = await db.execute<RawRow>(sql`
    SELECT
      s.id,
      s.name,
      s.brand,
      s.address,
      s.city,
      s.postal_code,
      s.lat,
      s.lon,
      f.price,
      f.observed_at,
      ST_Distance(
        s.geom::geography,
        ST_SetSRID(ST_MakePoint(${params.lon}, ${params.lat}), 4326)::geography
      ) / 1000.0 AS distance_km
    FROM stations s
    JOIN station_fuels f ON f.station_id = s.id AND f.fuel = ${params.fuel}
    WHERE f.is_stale = false
      AND f.is_rupture = false
      AND s.is_closed = false
      AND ST_DWithin(
        s.geom::geography,
        ST_SetSRID(ST_MakePoint(${params.lon}, ${params.lat}), 4326)::geography,
        ${radiusMeters}
      )
    ORDER BY distance_km ASC
    LIMIT ${params.limit}
  `);

  return result.rows.map((row) => ({
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
  }));
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

/** Lit le detail d'une station et l'historique recent de chaque carburant. */
export async function getStationDetail(
  db: Db,
  id: number,
  historyLimit = 30,
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
    ) ranked
    WHERE rn <= ${historyLimit}
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
