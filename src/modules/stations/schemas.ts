import { z } from "zod";
import { fuelEnum } from "../../db/schema.js";

export const fuelSchema = z.enum(fuelEnum.enumValues);
const sortSchema = z.enum(["total_cost", "price", "distance"]);

const numericPattern = /^[+-]?(\d+(\.\d+)?|\.\d+)([eE][+-]?\d+)?$/;

/**
 * Nombre issu d'une query string : refuse la chaine vide, NaN, Infinity, les
 * notations hex/octales, et les tableaux (parametre present plusieurs fois).
 */
const numberParam = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return numericPattern.test(trimmed) ? Number(trimmed) : Number.NaN;
}, z.number().finite());

/** Parametres de la recherche de stations les moins cheres. */
export const cheapestQuerySchema = z.object({
  lat: numberParam.pipe(z.number().min(-90).max(90)),
  lon: numberParam.pipe(z.number().min(-180).max(180)),
  radius_km: numberParam.pipe(z.number().positive().max(200)).default(10),
  fuel: fuelSchema,
  liters: numberParam.pipe(z.number().positive().max(200)).default(50),
  consumption: numberParam.pipe(z.number().positive().max(30)).default(6),
  sort: sortSchema.default("total_cost"),
  limit: numberParam.pipe(z.number().int().positive().max(100)).default(20),
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
  truncated: z.boolean(),
  stations: z.array(stationResultSchema),
});

/** Parametre de chemin pour une station : chiffres uniquement, longueur bornee. */
export const stationIdParamsSchema = z.object({
  id: z
    .string()
    .regex(/^\d{1,12}$/, "Identifiant de station invalide")
    .transform((value) => Number(value)),
});

/** Parametres du detail d'une station. */
export const stationDetailQuerySchema = z.object({
  history_days: numberParam.pipe(z.number().int().positive().max(90)).default(30),
});

const pricePointSchema = z.object({ observed_at: z.string(), price: z.number() });

const stationFuelDetailSchema = z.object({
  fuel: fuelSchema,
  price: z.number(),
  observed_at: z.string(),
  is_stale: z.boolean(),
  is_rupture: z.boolean(),
  history: z.array(pricePointSchema),
});

/** Reponse complete de GET /stations/:id. */
export const stationDetailResponseSchema = z.object({
  source: z.string(),
  station: z.object({
    id: z.number(),
    name: z.string(),
    brand: z.string().nullable(),
    address: z.string().nullable(),
    city: z.string().nullable(),
    postal_code: z.string().nullable(),
    lat: z.number(),
    lon: z.number(),
    is_24h: z.boolean(),
    is_closed: z.boolean(),
    services: z.array(z.string()),
    source_updated_at: z.string().nullable(),
    fuels: z.array(stationFuelDetailSchema),
  }),
});

export type StationResult = z.infer<typeof stationResultSchema>;
export type CheapestResponse = z.infer<typeof cheapestResponseSchema>;
export type StationDetailResponse = z.infer<typeof stationDetailResponseSchema>;
