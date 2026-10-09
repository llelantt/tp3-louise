CREATE EXTENSION IF NOT EXISTS postgis;--> statement-breakpoint
CREATE TYPE "public"."alert_channel" AS ENUM('inapp', 'webhook');--> statement-breakpoint
CREATE TYPE "public"."fuel" AS ENUM('gazole', 'sp95', 'sp98', 'e10', 'e85', 'gplc');--> statement-breakpoint
CREATE TYPE "public"."ingestion_status" AS ENUM('running', 'success', 'failed');--> statement-breakpoint
CREATE TABLE "alert_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"alert_id" uuid NOT NULL,
	"station_id" bigint NOT NULL,
	"fuel" "fuel" NOT NULL,
	"price" numeric(6, 3) NOT NULL,
	"triggered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delivered_at" timestamp with time zone,
	"status" text DEFAULT 'pending' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"api_key_id" uuid NOT NULL,
	"label" text,
	"fuel" "fuel" NOT NULL,
	"lat" double precision NOT NULL,
	"lon" double precision NOT NULL,
	"radius_km" numeric(6, 2) NOT NULL,
	"center" geometry(Point, 4326) NOT NULL,
	"threshold_price" numeric(6, 3) NOT NULL,
	"channel" "alert_channel" DEFAULT 'inapp' NOT NULL,
	"webhook_url" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key_hash" text NOT NULL,
	"name" text NOT NULL,
	"tier" text DEFAULT 'free' NOT NULL,
	"rate_limit_per_min" integer DEFAULT 120 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	CONSTRAINT "api_keys_key_hash_unique" UNIQUE("key_hash")
);
--> statement-breakpoint
CREATE TABLE "fuel_price_history" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"station_id" bigint NOT NULL,
	"fuel" "fuel" NOT NULL,
	"price" numeric(6, 3) NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingestion_runs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"status" "ingestion_status" DEFAULT 'running' NOT NULL,
	"stations_upserted" integer DEFAULT 0 NOT NULL,
	"prices_inserted" integer DEFAULT 0 NOT NULL,
	"prices_skipped" integer DEFAULT 0 NOT NULL,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "station_fuels" (
	"station_id" bigint NOT NULL,
	"fuel" "fuel" NOT NULL,
	"price" numeric(6, 3) NOT NULL,
	"is_stale" boolean DEFAULT false NOT NULL,
	"is_rupture" boolean DEFAULT false NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "station_fuels_station_id_fuel_pk" PRIMARY KEY("station_id","fuel")
);
--> statement-breakpoint
CREATE TABLE "stations" (
	"id" bigint PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"brand" text,
	"address" text,
	"city" text,
	"postal_code" varchar(10),
	"lat" double precision NOT NULL,
	"lon" double precision NOT NULL,
	"geom" geometry(Point, 4326) NOT NULL,
	"services" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"hours" jsonb,
	"is_24h" boolean DEFAULT false NOT NULL,
	"is_closed" boolean DEFAULT false NOT NULL,
	"source_updated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "alert_events" ADD CONSTRAINT "alert_events_alert_id_alerts_id_fk" FOREIGN KEY ("alert_id") REFERENCES "public"."alerts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_events" ADD CONSTRAINT "alert_events_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_api_key_id_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fuel_price_history" ADD CONSTRAINT "fuel_price_history_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "station_fuels" ADD CONSTRAINT "station_fuels_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "alert_events_alert_idx" ON "alert_events" USING btree ("alert_id","triggered_at");--> statement-breakpoint
CREATE INDEX "alerts_center_idx" ON "alerts" USING gist ("center");--> statement-breakpoint
CREATE INDEX "alerts_api_key_idx" ON "alerts" USING btree ("api_key_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fuel_price_history_dedupe_idx" ON "fuel_price_history" USING btree ("station_id","fuel","observed_at");--> statement-breakpoint
CREATE INDEX "fuel_price_history_station_idx" ON "fuel_price_history" USING btree ("station_id","fuel","observed_at");--> statement-breakpoint
CREATE INDEX "station_fuels_lookup_idx" ON "station_fuels" USING btree ("fuel","is_stale","is_rupture","price");--> statement-breakpoint
CREATE INDEX "stations_geom_idx" ON "stations" USING gist ("geom");--> statement-breakpoint
CREATE INDEX "stations_postal_code_idx" ON "stations" USING btree ("postal_code");