import { sql } from "drizzle-orm";
import type { Db } from "../../db/client.js";
import type { Fuel } from "../../db/schema.js";
import type { CreateAlertInput } from "./schemas.js";

export interface AlertRecord {
  id: string;
  label: string | null;
  fuel: Fuel;
  lat: number;
  lon: number;
  radiusKm: number;
  thresholdPrice: number;
  channel: string;
  isActive: boolean;
  createdAt: Date;
}

export interface AlertEventRecord {
  id: number;
  stationId: number;
  fuel: Fuel;
  price: number;
  triggeredAt: Date;
  status: string;
}

interface AlertRow extends Record<string, unknown> {
  id: string;
  label: string | null;
  fuel: Fuel;
  lat: number;
  lon: number;
  radius_km: string;
  threshold_price: string;
  channel: string;
  is_active: boolean;
  created_at: Date | string;
}

interface AlertEventRow extends Record<string, unknown> {
  id: string | number;
  station_id: string | number;
  fuel: Fuel;
  price: string;
  triggered_at: Date | string;
  status: string;
}

function toAlert(row: AlertRow): AlertRecord {
  return {
    id: row.id,
    label: row.label,
    fuel: row.fuel,
    lat: Number(row.lat),
    lon: Number(row.lon),
    radiusKm: Number(row.radius_km),
    thresholdPrice: Number(row.threshold_price),
    channel: row.channel,
    isActive: row.is_active,
    createdAt: row.created_at instanceof Date ? row.created_at : new Date(row.created_at),
  };
}

/** Cree une alerte rattachee a une cle API. */
export async function createAlert(
  db: Db,
  apiKeyId: string,
  input: CreateAlertInput,
): Promise<AlertRecord> {
  const result = await db.execute<AlertRow>(sql`
    INSERT INTO alerts
      (api_key_id, label, fuel, lat, lon, radius_km, center, threshold_price, channel)
    VALUES
      (${apiKeyId}::uuid, ${input.label ?? null}, ${input.fuel}::fuel, ${input.lat}, ${input.lon},
       ${input.radius_km}, ST_SetSRID(ST_MakePoint(${input.lon}, ${input.lat}), 4326),
       ${input.threshold_price}, ${input.channel}::alert_channel)
    RETURNING id, label, fuel, lat, lon, radius_km, threshold_price, channel, is_active, created_at
  `);
  const row = result.rows[0];
  if (!row) throw new Error("Creation d'alerte sans ligne retournee");
  return toAlert(row);
}

/** Liste les alertes d'une cle API. */
export async function listAlerts(db: Db, apiKeyId: string): Promise<AlertRecord[]> {
  const result = await db.execute<AlertRow>(sql`
    SELECT id, label, fuel, lat, lon, radius_km, threshold_price, channel, is_active, created_at
    FROM alerts
    WHERE api_key_id = ${apiKeyId}::uuid
    ORDER BY created_at DESC
  `);
  return result.rows.map(toAlert);
}

/** Supprime une alerte possedee par la cle ; retourne false si introuvable. */
export async function deleteAlert(db: Db, id: string, apiKeyId: string): Promise<boolean> {
  const result = await db.execute(sql`
    DELETE FROM alerts
    WHERE id = ${id}::uuid AND api_key_id = ${apiKeyId}::uuid
  `);
  return (result.rowCount ?? 0) > 0;
}

/**
 * Liste les evenements d'une alerte possedee par la cle.
 * Retourne null si l'alerte n'existe pas ou n'appartient pas a la cle.
 */
export async function listAlertEvents(
  db: Db,
  alertId: string,
  apiKeyId: string,
  limit: number,
): Promise<AlertEventRecord[] | null> {
  const owner = await db.execute(sql`
    SELECT 1 FROM alerts WHERE id = ${alertId}::uuid AND api_key_id = ${apiKeyId}::uuid
  `);
  if (owner.rows.length === 0) return null;

  const result = await db.execute<AlertEventRow>(sql`
    SELECT id, station_id, fuel, price, triggered_at, status
    FROM alert_events
    WHERE alert_id = ${alertId}::uuid
    ORDER BY triggered_at DESC
    LIMIT ${limit}
  `);
  return result.rows.map((row) => ({
    id: Number(row.id),
    stationId: Number(row.station_id),
    fuel: row.fuel,
    price: Number(row.price),
    triggeredAt: row.triggered_at instanceof Date ? row.triggered_at : new Date(row.triggered_at),
    status: row.status,
  }));
}
