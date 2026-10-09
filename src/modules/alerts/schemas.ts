import { z } from "zod";
import { fuelSchema } from "../stations/schemas.js";

/** Corps de creation d'une alerte. */
export const createAlertSchema = z
  .object({
    label: z.string().trim().min(1).max(100).optional(),
    fuel: fuelSchema,
    lat: z.coerce.number().min(-90).max(90),
    lon: z.coerce.number().min(-180).max(180),
    radius_km: z.coerce.number().positive().max(200).default(10),
    threshold_price: z.coerce.number().positive().max(100),
    channel: z.enum(["inapp", "webhook"]).default("inapp"),
    webhook_url: z.string().url().max(2048).optional(),
  })
  .refine((value) => value.channel !== "webhook" || value.webhook_url !== undefined, {
    message: "webhook_url est requis pour le canal webhook",
    path: ["webhook_url"],
  });

export type CreateAlertInput = z.infer<typeof createAlertSchema>;

const alertSchema = z.object({
  id: z.string(),
  label: z.string().nullable(),
  fuel: fuelSchema,
  lat: z.number(),
  lon: z.number(),
  radius_km: z.number(),
  threshold_price: z.number(),
  channel: z.string(),
  webhook_url: z.string().nullable(),
  is_active: z.boolean(),
  created_at: z.string(),
});

/** Reponse de creation : le secret de signature n'est renvoye qu'une seule fois. */
export const alertResponseSchema = z.object({
  alert: alertSchema.extend({ webhook_secret: z.string().nullable() }),
});

export const alertsResponseSchema = z.object({
  source: z.string(),
  count: z.number(),
  alerts: z.array(alertSchema),
});

const alertEventSchema = z.object({
  id: z.number(),
  station_id: z.number(),
  fuel: fuelSchema,
  price: z.number(),
  triggered_at: z.string(),
  status: z.string(),
});

export const alertEventsResponseSchema = z.object({
  source: z.string(),
  count: z.number(),
  events: z.array(alertEventSchema),
});

export const alertIdParamsSchema = z.object({ id: z.string().uuid() });

export type AlertResponse = z.infer<typeof alertResponseSchema>;
