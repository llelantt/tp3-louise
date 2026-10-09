import { sql } from "drizzle-orm";
import type { Db } from "../../db/client.js";
import type { Fuel } from "../../db/schema.js";
import type { StationCandidate } from "./service.js";

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
