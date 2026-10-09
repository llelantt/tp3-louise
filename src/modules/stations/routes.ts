import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { round } from "../../lib/cost.js";
import { NotFoundError } from "../../lib/errors.js";
import { DATA_SOURCE } from "../../lib/source.js";
import { getDataFreshness } from "../../ingestion/freshness.js";
import { findCandidates, getStationDetail } from "./repository.js";
import {
  cheapestQuerySchema,
  cheapestResponseSchema,
  stationDetailQuerySchema,
  stationDetailResponseSchema,
  stationIdParamsSchema,
  type StationDetailResponse,
  type StationResult,
} from "./schemas.js";
import { rankStations, type RankedStation, type StationDetail } from "./service.js";

const MAX_HISTORY_POINTS = 200;

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

function toDetail(detail: StationDetail): StationDetailResponse["station"] {
  return {
    id: detail.id,
    name: detail.name,
    brand: detail.brand,
    address: detail.address,
    city: detail.city,
    postal_code: detail.postalCode,
    lat: detail.lat,
    lon: detail.lon,
    is_24h: detail.is24h,
    is_closed: detail.isClosed,
    services: detail.services,
    source_updated_at: detail.sourceUpdatedAt?.toISOString() ?? null,
    fuels: detail.fuels.map((fuel) => ({
      fuel: fuel.fuel,
      price: fuel.price,
      observed_at: fuel.observedAt.toISOString(),
      is_stale: fuel.isStale,
      is_rupture: fuel.isRupture,
      history: fuel.history.map((point) => ({
        observed_at: point.observedAt.toISOString(),
        price: point.price,
      })),
    })),
  };
}

/** Routes de recherche et de detail des stations. */
export const stationRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/stations/cheapest",
    {
      preHandler: app.authGuard,
      schema: {
        tags: ["stations"],
        summary: "Stations les moins cheres autour d'un point",
        description:
          "Classe par cout reel (prix du plein + cout du detour). Exclut les prix perimes, " +
          "les ruptures et les stations fermees.",
        security: [{ apiKey: [] }],
        querystring: cheapestQuerySchema,
        response: { 200: cheapestResponseSchema },
      },
    },
    async (request, reply) => {
      reply.header("Cache-Control", "private, max-age=60");
      const query = request.query;
      const result = await findCandidates(app.db, {
        lat: query.lat,
        lon: query.lon,
        radiusKm: query.radius_km,
        fuel: query.fuel,
        liters: query.liters,
        consumptionLPer100Km: query.consumption,
        sort: query.sort,
        limit: query.limit,
      });

      const ranked = rankStations(result.candidates, {
        liters: query.liters,
        consumptionLPer100Km: query.consumption,
        sort: query.sort,
        limit: query.limit,
        referenceTotalCost: result.referenceTotalCost ?? 0,
      });

      return {
        source: DATA_SOURCE,
        fuel: query.fuel,
        count: ranked.length,
        truncated: result.totalMatches > query.limit,
        data_freshness: await getDataFreshness(app.db),
        stations: ranked.map(toResult),
      };
    },
  );

  app.get(
    "/stations/:id",
    {
      preHandler: app.authGuard,
      schema: {
        tags: ["stations"],
        summary: "Detail d'une station et historique des prix",
        security: [{ apiKey: [] }],
        params: stationIdParamsSchema,
        querystring: stationDetailQuerySchema,
        response: { 200: stationDetailResponseSchema },
      },
    },
    async (request) => {
      const { id } = request.params;
      const detail = await getStationDetail(app.db, id, {
        historyDays: request.query.history_days,
        maxPoints: MAX_HISTORY_POINTS,
      });
      if (!detail) {
        throw new NotFoundError(`Station ${id} introuvable`);
      }
      return {
        source: DATA_SOURCE,
        data_freshness: await getDataFreshness(app.db),
        station: toDetail(detail),
      };
    },
  );
};
