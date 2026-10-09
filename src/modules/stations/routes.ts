import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { round } from "../../lib/cost.js";
import { DATA_SOURCE } from "../../lib/source.js";
import { createApiKeyGuard } from "../auth/apiKey.js";
import { findCandidates } from "./repository.js";
import { cheapestQuerySchema, cheapestResponseSchema, type StationResult } from "./schemas.js";
import { rankStations, type RankedStation } from "./service.js";

const MAX_RESULTS = 20;
const MAX_CANDIDATES = 500;

function toResult(station: RankedStation): StationResult {
  return {
    id: station.id,
    name: station.name,
    brand: station.brand,
    address: station.address,
    city: station.city,
    postal_code: station.postalCode,
    lat: station.lat,
    lon: station.lon,
    distance_km: round(station.distanceKm, 3),
    price: station.price,
    date_maj_prix: station.observedAt.toISOString(),
    detour_cost: station.detourCost,
    total_cost: station.totalCost,
    economy_vs_nearest: station.economyVsNearest,
  };
}

/** Routes de recherche et de detail des stations. */
export const stationRoutes: FastifyPluginAsyncZod = async (app) => {
  const guard = createApiKeyGuard(app.db, app.config);

  app.get(
    "/stations/cheapest",
    {
      preHandler: guard,
      schema: {
        tags: ["stations"],
        summary: "Stations les moins cheres autour d'un point",
        description:
          "Classe par cout reel (prix du plein + cout du detour). Exclut les prix perimes, " +
          "les ruptures et les stations fermees.",
        querystring: cheapestQuerySchema,
        response: { 200: cheapestResponseSchema },
      },
    },
    async (request) => {
      const query = request.query;
      const candidates = await findCandidates(app.db, {
        lat: query.lat,
        lon: query.lon,
        radiusKm: query.radius_km,
        fuel: query.fuel,
        limit: MAX_CANDIDATES,
      });

      const ranked = rankStations(candidates, {
        liters: query.liters,
        consumptionLPer100Km: query.consumption,
        sort: query.sort,
        limit: MAX_RESULTS,
      });

      return {
        source: DATA_SOURCE,
        fuel: query.fuel,
        count: ranked.length,
        stations: ranked.map(toResult),
      };
    },
  );
};
