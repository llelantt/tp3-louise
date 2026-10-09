import { sql } from "drizzle-orm";
import type { Db } from "../../db/client.js";

/**
 * Evalue toutes les alertes actives et cree un evenement pour chaque station
 * passee sous le seuil, sans doublon tant qu'un evenement reste en attente.
 * Retourne le nombre d'evenements crees.
 */
export async function evaluateAlerts(db: Db): Promise<number> {
  const result = await db.execute(sql`
    INSERT INTO alert_events (alert_id, station_id, fuel, price, status)
    SELECT a.id, sf.station_id, a.fuel, sf.price, 'pending'
    FROM alerts a
    JOIN station_fuels sf ON sf.fuel = a.fuel
    JOIN stations s ON s.id = sf.station_id
    WHERE a.is_active = true
      AND sf.is_stale = false
      AND sf.is_rupture = false
      AND s.is_closed = false
      AND sf.price <= a.threshold_price
      AND ST_DWithin(
        s.geom::geography,
        a.center::geography,
        (a.radius_km * 1000)::double precision
      )
      AND NOT EXISTS (
        SELECT 1 FROM alert_events e
        WHERE e.alert_id = a.id AND e.station_id = sf.station_id AND e.status = 'pending'
      )
    RETURNING id
  `);
  return result.rows.length;
}
