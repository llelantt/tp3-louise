import { sql } from "drizzle-orm";
import type { Db } from "../db/client.js";
import type { ParsedStation } from "./parseStations.js";

export interface UpsertResult {
  stations: number;
  pricesInserted: number;
  pricesSkipped: number;
}

const CHUNK_SIZE = 500;

function chunk<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

async function upsertStationRows(db: Db, stations: readonly ParsedStation[]): Promise<void> {
  for (const group of chunk(stations, CHUNK_SIZE)) {
    const rows = group.map(
      (station) => sql`(
        ${station.id}, ${station.name}, ${station.brand}, ${station.address}, ${station.city},
        ${station.postalCode}, ${station.lat}, ${station.lon},
        ST_SetSRID(ST_MakePoint(${station.lon}, ${station.lat}), 4326),
        ${JSON.stringify(station.services)}::jsonb,
        ${station.hours === null ? null : JSON.stringify(station.hours)}::jsonb,
        ${station.is24h}, ${station.isClosed}, ${station.sourceUpdatedAt}
      )`,
    );
    await db.execute(sql`
      INSERT INTO stations
        (id, name, brand, address, city, postal_code, lat, lon, geom, services, hours,
         is_24h, is_closed, source_updated_at)
      VALUES ${sql.join(rows, sql`, `)}
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name, brand = EXCLUDED.brand, address = EXCLUDED.address,
        city = EXCLUDED.city, postal_code = EXCLUDED.postal_code, lat = EXCLUDED.lat,
        lon = EXCLUDED.lon, geom = EXCLUDED.geom, services = EXCLUDED.services,
        hours = EXCLUDED.hours, is_24h = EXCLUDED.is_24h, is_closed = EXCLUDED.is_closed,
        source_updated_at = EXCLUDED.source_updated_at, updated_at = now()
    `);
  }
}

async function upsertFuelRows(db: Db, stations: readonly ParsedStation[]): Promise<void> {
  const prices = stations.flatMap((station) =>
    station.prices.map((price) => ({ stationId: station.id, ...price })),
  );

  for (const group of chunk(prices, CHUNK_SIZE)) {
    const rows = group.map(
      (price) => sql`(
        ${price.stationId}, ${price.fuel}::fuel, ${price.price},
        ${price.isRupture}, ${price.observedAt}
      )`,
    );
    await db.execute(sql`
      INSERT INTO station_fuels (station_id, fuel, price, is_rupture, observed_at)
      VALUES ${sql.join(rows, sql`, `)}
      ON CONFLICT (station_id, fuel) DO UPDATE SET
        price = EXCLUDED.price, is_rupture = EXCLUDED.is_rupture,
        is_stale = false, observed_at = EXCLUDED.observed_at, updated_at = now()
      WHERE station_fuels.observed_at <= EXCLUDED.observed_at
    `);
  }
}

async function insertHistory(db: Db, stations: readonly ParsedStation[]): Promise<number> {
  const prices = stations.flatMap((station) =>
    station.prices.map((price) => ({ stationId: station.id, ...price })),
  );

  let inserted = 0;
  for (const group of chunk(prices, CHUNK_SIZE)) {
    const rows = group.map(
      (price) =>
        sql`(${price.stationId}, ${price.fuel}::fuel, ${price.price}, ${price.observedAt})`,
    );
    const result = await db.execute(sql`
      INSERT INTO fuel_price_history (station_id, fuel, price, observed_at)
      VALUES ${sql.join(rows, sql`, `)}
      ON CONFLICT (station_id, fuel, observed_at) DO NOTHING
      RETURNING id
    `);
    inserted += result.rows.length;
  }
  return inserted;
}

/**
 * Insere ou met a jour les stations, leur etat courant et l'historique des prix.
 * Idempotent : rejouer le meme flux ne cree pas de doublon d'historique.
 */
export async function upsertStations(
  db: Db,
  stations: readonly ParsedStation[],
): Promise<UpsertResult> {
  if (stations.length === 0) {
    return { stations: 0, pricesInserted: 0, pricesSkipped: 0 };
  }

  await upsertStationRows(db, stations);
  await upsertFuelRows(db, stations);

  const totalPrices = stations.reduce((sum, station) => sum + station.prices.length, 0);
  const pricesInserted = await insertHistory(db, stations);

  return {
    stations: stations.length,
    pricesInserted,
    pricesSkipped: totalPrices - pricesInserted,
  };
}
