import { z } from "zod";
import { fuelSchema } from "../stations/schemas.js";

/** Corps de creation d'une alerte. */
export const createAlertSchema = z.object({
  label: z.string().trim().min(1).max(100).optional(),
  fuel: fuelSchema,
  lat: z.coerce.number().min(-90).max(90),
  lon: z.coerce.number().min(-180).max(180),
  radius_km: z.coerce.number().positive().max(200).default(10),
  threshold_price: z.coerce.number().positive().max(100),
  channel: z.enum(["inapp"]).default("inapp"),
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
  is_active: z.boolean(),
  created_at: z.string(),
});

export const alertResponseSchema = z.object({ alert: alertSchema });

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
