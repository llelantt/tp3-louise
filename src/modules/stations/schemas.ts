import { z } from "zod";
import { fuelEnum } from "../../db/schema.js";

const fuelSchema = z.enum(fuelEnum.enumValues);
const sortSchema = z.enum(["total_cost", "price", "distance"]);

/** Parametres de la recherche de stations les moins cheres. */
export const cheapestQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lon: z.coerce.number().min(-180).max(180),
  radius_km: z.coerce.number().positive().max(200).default(10),
  fuel: fuelSchema,
  liters: z.coerce.number().positive().max(200).default(50),
  consumption: z.coerce.number().positive().max(30).default(6),
  sort: sortSchema.default("total_cost"),
});

export type CheapestQuery = z.infer<typeof cheapestQuerySchema>;

/** Une station dans la reponse de recherche. */
export const stationResultSchema = z.object({
  id: z.number(),
  name: z.string(),
  brand: z.string().nullable(),
  address: z.string().nullable(),
  city: z.string().nullable(),
  postal_code: z.string().nullable(),
  lat: z.number(),
  lon: z.number(),
  distance_km: z.number(),
  price: z.number(),
  date_maj_prix: z.string(),
  detour_cost: z.number(),
  total_cost: z.number(),
  economy_vs_nearest: z.number(),
});

/** Reponse complete de GET /stations/cheapest. */
export const cheapestResponseSchema = z.object({
  source: z.string(),
  fuel: fuelSchema,
  count: z.number(),
  stations: z.array(stationResultSchema),
});

export type StationResult = z.infer<typeof stationResultSchema>;
export type CheapestResponse = z.infer<typeof cheapestResponseSchema>;
