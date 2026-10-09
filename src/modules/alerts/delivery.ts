import type { AppConfig } from "../../config.js";
import type { Db } from "../../db/client.js";
import type { Logger } from "../../lib/logger.js";
import {
  listPendingWebhooks,
  markEventDelivered,
  markEventFailed,
  recordWebhookFailure,
  resetWebhookFailures,
} from "./repository.js";
import { deliverWebhook, type WebhookOptions } from "./webhook.js";

export interface DeliverySummary {
  delivered: number;
  failed: number;
}

/** Options de livraison des webhooks, tirees de la config. */
export function webhookOptions(config: AppConfig): WebhookOptions {
  return {
    timeoutMs: config.WEBHOOK_TIMEOUT_MS,
    maxResponseBytes: config.WEBHOOK_MAX_RESPONSE_BYTES,
    maxAttempts: config.WEBHOOK_MAX_ATTEMPTS,
    allowPrivate: config.WEBHOOK_ALLOW_PRIVATE,
  };
}

/**
 * Livre les webhooks en attente, journalise les echecs et desactive une alerte
 * apres WEBHOOK_MAX_FAILURES echecs consecutifs. Le secret n'est jamais logge.
 */
export async function deliverPendingWebhooks(
  db: Db,
  config: AppConfig,
  logger: Logger,
): Promise<DeliverySummary> {
  const pending = await listPendingWebhooks(db);
  const options = webhookOptions(config);
  let delivered = 0;
  let failed = 0;

  for (const event of pending) {
    const result = await deliverWebhook(
      {
        id: event.eventId,
        url: event.url,
        secret: event.secret,
        payload: {
          event_id: event.eventId,
          alert_id: event.alertId,
          label: event.label,
          station_id: event.stationId,
          fuel: event.fuel,
          price: event.price,
          triggered_at: event.triggeredAt.toISOString(),
        },
      },
      options,
    );

    if (result.ok) {
      await markEventDelivered(db, event.eventId);
      await resetWebhookFailures(db, event.alertId);
      delivered += 1;
    } else {
      await markEventFailed(db, event.eventId);
      const failures = await recordWebhookFailure(db, event.alertId, config.WEBHOOK_MAX_FAILURES);
      failed += 1;
      logger.warn(
        {
          alertId: event.alertId,
          eventId: event.eventId,
          status: result.status,
          error: result.error,
          failures,
        },
        "livraison webhook en echec",
      );
    }
  }

  return { delivered, failed };
}
