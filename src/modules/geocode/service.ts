import { z } from "zod";
import type { AppConfig } from "../../config.js";
import { UpstreamError } from "../../lib/errors.js";
import { LruCache } from "./cache.js";
import type { GeocodeResult } from "./schemas.js";

/** Nettoie le texte saisi ; retourne null si hors bornes (3 a 200 caracteres). */
export function normalizeQuery(raw: string): string | null {
  const query = raw.trim().replace(/\s+/g, " ");
  if (query.length < 3 || query.length > 200) return null;
  return query;
}

const upstreamSchema = z.object({
  features: z.array(
    z.object({
      properties: z.object({
        label: z.string(),
        city: z.string().optional(),
        postcode: z.string().optional(),
      }),
      geometry: z.object({ coordinates: z.tuple([z.number(), z.number()]) }),
    }),
  ),
});

/** Client du service de geocodage (Geoplateforme / BAN), avec cache LRU borne. */
export class Geocoder {
  private readonly cache: LruCache<GeocodeResult[]>;

  constructor(
    private readonly config: AppConfig,
    private readonly fetchImpl: typeof fetch,
  ) {
    this.cache = new LruCache<GeocodeResult[]>(config.GEOCODE_CACHE_MAX);
  }

  /** Recherche jusqu'a 5 adresses pour un texte deja nettoye. */
  async search(rawQuery: string): Promise<GeocodeResult[]> {
    const query = normalizeQuery(rawQuery);
    if (query === null) return [];

    const cached = this.cache.get(query);
    if (cached) return cached;

    const base = `${this.config.GEOCODE_BASE_URL.replace(/\/$/, "")}/`;
    const url = new URL("search", base);
    url.searchParams.set("q", query);
    url.searchParams.set("limit", "5");
    url.searchParams.set("index", "address");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.GEOCODE_TIMEOUT_MS);
    let response: Response;
    try {
      response = await this.fetchImpl(url.toString(), {
        signal: controller.signal,
        redirect: "manual",
      });
    } catch (error) {
      throw new UpstreamError(
        "Service de geocodage indisponible",
        error instanceof Error ? error.message : undefined,
      );
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      throw new UpstreamError(`Service de geocodage indisponible (HTTP ${response.status})`);
    }

    const json = await response.json().catch(() => null);
    const parsed = upstreamSchema.safeParse(json);
    if (!parsed.success) {
      throw new UpstreamError("Reponse de geocodage invalide");
    }

    const results: GeocodeResult[] = parsed.data.features.slice(0, 5).map((feature) => ({
      label: feature.properties.label,
      lat: feature.geometry.coordinates[1],
      lon: feature.geometry.coordinates[0],
      city: feature.properties.city ?? null,
      postal_code: feature.properties.postcode ?? null,
    }));

    this.cache.set(query, results);
    return results;
  }
}
