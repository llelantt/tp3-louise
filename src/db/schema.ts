import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  customType,
  doublePrecision,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

/** Colonne PostGIS : point geographique en WGS84 (SRID 4326). */
const pointGeometry = customType<{ data: string; driverData: string }>({
  dataType() {
    return "geometry(Point, 4326)";
  },
});

/** Carburants vendus en France, tels que nommes par le flux open data. */
export const fuelEnum = pgEnum("fuel", ["gazole", "sp95", "sp98", "e10", "e85", "gplc"]);

/** Statut d'une execution du job d'ingestion. */
export const ingestionStatusEnum = pgEnum("ingestion_status", ["running", "success", "failed"]);

/** Canal de notification d'une alerte. */
export const alertChannelEnum = pgEnum("alert_channel", ["inapp", "webhook"]);

/** Stations-service : une ligne par point de vente du flux. */
export const stations = pgTable(
  "stations",
  {
    id: bigint("id", { mode: "number" }).primaryKey(),
    name: text("name").notNull(),
    brand: text("brand"),
    address: text("address"),
    city: text("city"),
    postalCode: varchar("postal_code", { length: 10 }),
    lat: doublePrecision("lat").notNull(),
    lon: doublePrecision("lon").notNull(),
    geom: pointGeometry("geom").notNull(),
    services: jsonb("services").$type<string[]>().default([]).notNull(),
    hours: jsonb("hours"),
    is24h: boolean("is_24h").default(false).notNull(),
    isClosed: boolean("is_closed").default(false).notNull(),
    sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("stations_geom_idx").using("gist", t.geom),
    index("stations_postal_code_idx").on(t.postalCode),
  ],
);

/** Etat courant du prix d'un carburant pour une station (une ligne par couple). */
export const stationFuels = pgTable(
  "station_fuels",
  {
    stationId: bigint("station_id", { mode: "number" })
      .notNull()
      .references(() => stations.id, { onDelete: "cascade" }),
    fuel: fuelEnum("fuel").notNull(),
    price: numeric("price", { precision: 6, scale: 3 }).notNull(),
    isStale: boolean("is_stale").default(false).notNull(),
    isRupture: boolean("is_rupture").default(false).notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.stationId, t.fuel] }),
    index("station_fuels_lookup_idx").on(t.fuel, t.isStale, t.isRupture, t.price),
  ],
);

/** Historique append-only des prix : une ligne par changement observe. */
export const fuelPriceHistory = pgTable(
  "fuel_price_history",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    stationId: bigint("station_id", { mode: "number" })
      .notNull()
      .references(() => stations.id, { onDelete: "cascade" }),
    fuel: fuelEnum("fuel").notNull(),
    price: numeric("price", { precision: 6, scale: 3 }).notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("fuel_price_history_dedupe_idx").on(t.stationId, t.fuel, t.observedAt),
    index("fuel_price_history_station_idx").on(t.stationId, t.fuel, t.observedAt),
  ],
);

/** Journal des executions du job d'ingestion (observabilite). */
export const ingestionRuns = pgTable("ingestion_runs", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  source: text("source").notNull(),
  status: ingestionStatusEnum("status").default("running").notNull(),
  stationsUpserted: integer("stations_upserted").default(0).notNull(),
  pricesInserted: integer("prices_inserted").default(0).notNull(),
  pricesSkipped: integer("prices_skipped").default(0).notNull(),
  error: text("error"),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
});

/** Cles API : seule l'empreinte est stockee, jamais la cle en clair. */
export const apiKeys = pgTable("api_keys", {
  id: uuid("id").defaultRandom().primaryKey(),
  keyHash: text("key_hash").notNull().unique(),
  name: text("name").notNull(),
  tier: text("tier").default("free").notNull(),
  rateLimitPerMin: integer("rate_limit_per_min").default(120).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
});

/** Alertes : un seuil de prix surveille sur une zone pour une cle API. */
export const alerts = pgTable(
  "alerts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    apiKeyId: uuid("api_key_id")
      .notNull()
      .references(() => apiKeys.id, { onDelete: "cascade" }),
    label: text("label"),
    fuel: fuelEnum("fuel").notNull(),
    lat: doublePrecision("lat").notNull(),
    lon: doublePrecision("lon").notNull(),
    radiusKm: numeric("radius_km", { precision: 6, scale: 2 }).notNull(),
    center: pointGeometry("center").notNull(),
    thresholdPrice: numeric("threshold_price", { precision: 6, scale: 3 }).notNull(),
    channel: alertChannelEnum("channel").default("inapp").notNull(),
    webhookUrl: text("webhook_url"),
    webhookSecret: text("webhook_secret"),
    webhookFailures: integer("webhook_failures").default(0).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("alerts_center_idx").using("gist", t.center),
    index("alerts_api_key_idx").on(t.apiKeyId),
  ],
);

/** Evenements declenches par une alerte (un par franchissement de seuil). */
export const alertEvents = pgTable(
  "alert_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    alertId: uuid("alert_id")
      .notNull()
      .references(() => alerts.id, { onDelete: "cascade" }),
    stationId: bigint("station_id", { mode: "number" })
      .notNull()
      .references(() => stations.id, { onDelete: "cascade" }),
    fuel: fuelEnum("fuel").notNull(),
    price: numeric("price", { precision: 6, scale: 3 }).notNull(),
    triggeredAt: timestamp("triggered_at", { withTimezone: true }).defaultNow().notNull(),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    status: text("status").default("pending").notNull(),
  },
  (t) => [index("alert_events_alert_idx").on(t.alertId, t.triggeredAt)],
);

export const fuelTypes = fuelEnum.enumValues;
export type Fuel = (typeof fuelEnum.enumValues)[number];
export type Station = typeof stations.$inferSelect;
export type NewStation = typeof stations.$inferInsert;
export type StationFuel = typeof stationFuels.$inferSelect;
export type Alert = typeof alerts.$inferSelect;
export type ApiKey = typeof apiKeys.$inferSelect;

/** Valeur SQL reutilisable pour construire un point PostGIS depuis lon/lat. */
export function point(lon: number, lat: number) {
  return sql`ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)`;
}
