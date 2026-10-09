ALTER TABLE "alerts" ADD COLUMN "webhook_secret" text;--> statement-breakpoint
ALTER TABLE "alerts" ADD COLUMN "webhook_failures" integer DEFAULT 0 NOT NULL;