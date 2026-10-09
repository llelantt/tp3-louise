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
  webhookUrl: string | null;
  webhookSecret: string | null;
  webhookFailures: number;
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

export interface PendingWebhook {
  eventId: number;
  alertId: string;
  url: string;
  secret: string;
  label: string | null;
  stationId: number;
  fuel: Fuel;
  price: number;
  triggeredAt: Date;
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
  webhook_url: string | null;
  webhook_secret: string | null;
  webhook_failures: number;
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

interface PendingWebhookRow extends Record<string, unknown> {
  event_id: string | number;
  alert_id: string;
  url: string;
  secret: string;
  label: string | null;
  station_id: string | number;
  fuel: Fuel;
  price: string;
  triggered_at: Date | string;
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
    webhookUrl: row.webhook_url,
    webhookSecret: row.webhook_secret,
    webhookFailures: row.webhook_failures,
    isActive: row.is_active,
    createdAt: row.created_at instanceof Date ? row.created_at : new Date(row.created_at),
  };
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

const ALERT_COLUMNS = sql`
  id, label, fuel, lat, lon, radius_km, threshold_price, channel,
  webhook_url, webhook_secret, webhook_failures, is_active, created_at
`;

/** Compte les alertes d'une cle API (pour plafonner leur nombre). */
export async function countAlerts(db: Db, apiKeyId: string): Promise<number> {
  const result = await db.execute(sql`
    SELECT count(*)::int AS n FROM alerts WHERE api_key_id = ${apiKeyId}::uuid
  `);
  return (result.rows[0] as { n: number } | undefined)?.n ?? 0;
}

/** Cree une alerte rattachee a une cle API. */
export async function createAlert(
  db: Db,
  apiKeyId: string,
  input: CreateAlertInput,
  webhookSecret: string | null,
): Promise<AlertRecord> {
  const result = await db.execute<AlertRow>(sql`
    INSERT INTO alerts
      (api_key_id, label, fuel, lat, lon, radius_km, center, threshold_price, channel,
       webhook_url, webhook_secret)
    VALUES
      (${apiKeyId}::uuid, ${input.label ?? null}, ${input.fuel}::fuel, ${input.lat}, ${input.lon},
       ${input.radius_km}, ST_SetSRID(ST_MakePoint(${input.lon}, ${input.lat}), 4326),
       ${input.threshold_price}, ${input.channel}::alert_channel,
       ${input.webhook_url ?? null}, ${webhookSecret})
    RETURNING ${ALERT_COLUMNS}
  `);
  const row = result.rows[0];
  if (!row) throw new Error("Creation d'alerte sans ligne retournee");
  return toAlert(row);
}

/** Liste les alertes d'une cle API. */
export async function listAlerts(db: Db, apiKeyId: string): Promise<AlertRecord[]> {
  const result = await db.execute<AlertRow>(sql`
    SELECT ${ALERT_COLUMNS}
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
    triggeredAt: toDate(row.triggered_at),
    status: row.status,
  }));
}

/** Evenements en attente dont l'alerte est un webhook actif. */
export async function listPendingWebhooks(db: Db, limit = 50): Promise<PendingWebhook[]> {
  const result = await db.execute<PendingWebhookRow>(sql`
    SELECT e.id AS event_id, e.alert_id, a.webhook_url AS url, a.webhook_secret AS secret,
           a.label, e.station_id, e.fuel, e.price, e.triggered_at
    FROM alert_events e
    JOIN alerts a ON a.id = e.alert_id
    WHERE e.status = 'pending'
      AND a.channel = 'webhook'
      AND a.is_active = true
      AND a.webhook_url IS NOT NULL
      AND a.webhook_secret IS NOT NULL
    ORDER BY e.triggered_at ASC
    LIMIT ${limit}
  `);
  return result.rows.map((row) => ({
    eventId: Number(row.event_id),
    alertId: row.alert_id,
    url: row.url,
    secret: row.secret,
    label: row.label,
    stationId: Number(row.station_id),
    fuel: row.fuel,
    price: Number(row.price),
    triggeredAt: toDate(row.triggered_at),
  }));
}

/** Marque un evenement comme livre. */
export async function markEventDelivered(db: Db, eventId: number): Promise<void> {
  await db.execute(sql`
    UPDATE alert_events SET status = 'delivered', delivered_at = now() WHERE id = ${eventId}
  `);
}

/** Marque un evenement comme en echec de livraison. */
export async function markEventFailed(db: Db, eventId: number): Promise<void> {
  await db.execute(sql`
    UPDATE alert_events SET status = 'failed' WHERE id = ${eventId}
  `);
}

/** Remet a zero le compteur d'echecs consecutifs d'une alerte. */
export async function resetWebhookFailures(db: Db, alertId: string): Promise<void> {
  await db.execute(sql`
    UPDATE alerts SET webhook_failures = 0 WHERE id = ${alertId}::uuid
  `);
}

/**
 * Incremente le compteur d'echecs consecutifs et desactive l'alerte au seuil atteint.
 * Retourne le nouveau nombre d'echecs.
 */
export async function recordWebhookFailure(
  db: Db,
  alertId: string,
  maxFailures: number,
): Promise<number> {
  const result = await db.execute(sql`
    UPDATE alerts
    SET webhook_failures = webhook_failures + 1,
        is_active = (webhook_failures + 1) < ${maxFailures}
    WHERE id = ${alertId}::uuid
    RETURNING webhook_failures
  `);
  return (result.rows[0] as { webhook_failures: number } | undefined)?.webhook_failures ?? 0;
}
