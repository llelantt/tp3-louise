import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { NotFoundError, UnauthorizedError } from "../../lib/errors.js";
import { DATA_SOURCE } from "../../lib/source.js";
import {
  createAlert,
  deleteAlert,
  listAlerts,
  listAlertEvents,
  type AlertRecord,
} from "./repository.js";
import {
  alertEventsResponseSchema,
  alertIdParamsSchema,
  alertResponseSchema,
  alertsResponseSchema,
  createAlertSchema,
} from "./schemas.js";

const MAX_EVENTS = 100;

function toAlert(alert: AlertRecord) {
  return {
    id: alert.id,
    label: alert.label,
    fuel: alert.fuel,
    lat: alert.lat,
    lon: alert.lon,
    radius_km: alert.radiusKm,
    threshold_price: alert.thresholdPrice,
    channel: alert.channel,
    is_active: alert.isActive,
    created_at: alert.createdAt.toISOString(),
  };
}

/** Routes de gestion des alertes de prix. */
export const alertRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    "/alerts",
    {
      preHandler: app.authGuard,
      schema: {
        tags: ["alerts"],
        summary: "Creer une alerte de prix",
        body: createAlertSchema,
        response: { 201: alertResponseSchema },
      },
    },
    async (request, reply) => {
      if (!request.apiKeyId) throw new UnauthorizedError();
      const alert = await createAlert(app.db, request.apiKeyId, request.body);
      reply.code(201);
      return { alert: toAlert(alert) };
    },
  );

  app.get(
    "/alerts",
    {
      preHandler: app.authGuard,
      schema: {
        tags: ["alerts"],
        summary: "Lister ses alertes",
        response: { 200: alertsResponseSchema },
      },
    },
    async (request) => {
      if (!request.apiKeyId) throw new UnauthorizedError();
      const alerts = await listAlerts(app.db, request.apiKeyId);
      return { source: DATA_SOURCE, count: alerts.length, alerts: alerts.map(toAlert) };
    },
  );

  app.delete(
    "/alerts/:id",
    {
      preHandler: app.authGuard,
      schema: {
        tags: ["alerts"],
        summary: "Supprimer une alerte",
        params: alertIdParamsSchema,
      },
    },
    async (request, reply) => {
      if (!request.apiKeyId) throw new UnauthorizedError();
      const deleted = await deleteAlert(app.db, request.params.id, request.apiKeyId);
      if (!deleted) throw new NotFoundError("Alerte introuvable");
      reply.code(204);
    },
  );

  app.get(
    "/alerts/:id/events",
    {
      preHandler: app.authGuard,
      schema: {
        tags: ["alerts"],
        summary: "Evenements declenches par une alerte",
        params: alertIdParamsSchema,
        response: { 200: alertEventsResponseSchema },
      },
    },
    async (request) => {
      if (!request.apiKeyId) throw new UnauthorizedError();
      const events = await listAlertEvents(app.db, request.params.id, request.apiKeyId, MAX_EVENTS);
      if (events === null) throw new NotFoundError("Alerte introuvable");
      return {
        source: DATA_SOURCE,
        count: events.length,
        events: events.map((event) => ({
          id: event.id,
          station_id: event.stationId,
          fuel: event.fuel,
          price: event.price,
          triggered_at: event.triggeredAt.toISOString(),
          status: event.status,
        })),
      };
    },
  );
};
