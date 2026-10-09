import { z } from "zod";

/** Parametres du proxy de geocodage (le texte saisi est nettoye cote service). */
export const geocodeQuerySchema = z.object({
  q: z.string().trim().min(3).max(200),
});

export type GeocodeQuery = z.infer<typeof geocodeQuerySchema>;

const geocodeResultSchema = z.object({
  label: z.string(),
  lat: z.number(),
  lon: z.number(),
  city: z.string().nullable(),
  postal_code: z.string().nullable(),
});

/** Reponse du proxy de geocodage. */
export const geocodeResponseSchema = z.object({
  source: z.string(),
  results: z.array(geocodeResultSchema),
});

export type GeocodeResult = z.infer<typeof geocodeResultSchema>;
