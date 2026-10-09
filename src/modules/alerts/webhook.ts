import { createHmac, randomBytes } from "node:crypto";
import { promises as dns } from "node:dns";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";

export interface WebhookOptions {
  timeoutMs: number;
  maxResponseBytes: number;
  maxAttempts: number;
  /** Autorise http et les adresses privees/loopback : uniquement en test. */
  allowPrivate: boolean;
}

export interface WebhookEvent {
  id: number;
  url: string;
  secret: string;
  payload: Record<string, unknown>;
}

export interface DeliveryResult {
  ok: boolean;
  status: number | null;
  error?: string;
}

export interface ResolvedTarget {
  address: string;
  family: number;
}

/** Genere un secret de signature de webhook, affiche une seule fois. */
export function generateWebhookSecret(): string {
  return `whsec_${randomBytes(32).toString("base64url")}`;
}

/** Signe "timestamp.corps" en HMAC-SHA256, au format `sha256=<hex>`. */
export function signPayload(secret: string, timestamp: string, body: string): string {
  return `sha256=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;
}

const FORBIDDEN_IPV4 = [
  /^0\./,
  /^10\./,
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
  /^127\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.0\.0\./,
  /^192\.0\.2\./,
  /^192\.168\./,
  /^198\.(1[89]|51)\./,
  /^203\.0\.113\./,
  /^2[2-5]\d\./,
];

function isForbiddenIpv4(address: string): boolean {
  return FORBIDDEN_IPV4.some((pattern) => pattern.test(address));
}

function isForbiddenIpv6(address: string): boolean {
  const lower = address.toLowerCase();
  if (lower === "::1" || lower === "::") return true;
  if (lower.startsWith("fe80:")) return true; // link-local
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // unique local
  if (lower.startsWith("ff")) return true; // multicast
  if (lower.startsWith("::ffff:")) return isForbiddenIpv4(lower.slice(7)); // IPv4-mapped
  return false;
}

/** Vrai si l'adresse est privee/loopback/link-local, donc interdite hors test. */
export function isForbiddenAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return isForbiddenIpv4(address);
  if (family === 6) return isForbiddenIpv6(address);
  return true;
}

/**
 * Resout un hote et verifie que toutes ses adresses sont publiques (anti-SSRF).
 * La connexion se fera ensuite sur l'adresse resolue, jamais re-resolue.
 */
export async function resolvePublicAddress(
  hostname: string,
  allowPrivate: boolean,
): Promise<ResolvedTarget> {
  const literalFamily = isIP(hostname);
  if (literalFamily !== 0) {
    if (!allowPrivate && isForbiddenAddress(hostname)) {
      throw new Error("adresse IP privee refusee");
    }
    return { address: hostname, family: literalFamily };
  }

  const results = await dns.lookup(hostname, { all: true });
  const chosen = results[0];
  if (!chosen) throw new Error("resolution DNS vide");
  if (!allowPrivate) {
    for (const entry of results) {
      if (isForbiddenAddress(entry.address)) {
        throw new Error("hote resolu vers une adresse privee");
      }
    }
  }
  return { address: chosen.address, family: chosen.family };
}

function sendOnce(
  target: WebhookEvent,
  resolved: ResolvedTarget,
  options: WebhookOptions,
): Promise<DeliveryResult> {
  return new Promise((resolve) => {
    const url = new URL(target.url);
    const body = JSON.stringify(target.payload);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const requestFn = url.protocol === "https:" ? httpsRequest : httpRequest;

    const req = requestFn(
      {
        method: "POST",
        host: url.hostname,
        port: url.port || (url.protocol === "https:" ? 443 : 80),
        path: `${url.pathname}${url.search}`,
        headers: {
          "content-type": "application/json",
          "content-length": Buffer.byteLength(body),
          "user-agent": "carbu-api-webhook/1.0",
          "x-carbu-timestamp": timestamp,
          "x-carbu-signature": signPayload(target.secret, timestamp, body),
          "x-carbu-event-id": String(target.id),
        },
        // Epingle l'IP resolue : pas de re-resolution (anti rebinding DNS).
        lookup: (_hostname, _lookupOptions, callback) => {
          callback(null, resolved.address, resolved.family);
        },
        timeout: options.timeoutMs,
        agent: false,
      },
      (response) => {
        let received = 0;
        response.on("data", (chunk: Buffer) => {
          received += chunk.length;
          if (received > options.maxResponseBytes) {
            req.destroy(new Error("reponse trop volumineuse"));
          }
        });
        response.on("end", () => {
          const status = response.statusCode ?? 0;
          resolve({ ok: status >= 200 && status < 300, status });
        });
      },
    );

    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", (error) => resolve({ ok: false, status: null, error: error.message }));
    req.write(body);
    req.end();
  });
}

/**
 * Livre un webhook signe, avec jusqu'a `maxAttempts` tentatives (backoff exponentiel
 * avec jitter) uniquement sur erreur reseau/timeout/5xx. Aucune redirection suivie.
 */
export async function deliverWebhook(
  target: WebhookEvent,
  options: WebhookOptions,
): Promise<DeliveryResult> {
  const url = new URL(target.url);
  if (url.protocol !== "https:" && !(options.allowPrivate && url.protocol === "http:")) {
    return { ok: false, status: null, error: "protocole non autorise (https requis)" };
  }

  let resolved: ResolvedTarget;
  try {
    resolved = await resolvePublicAddress(url.hostname, options.allowPrivate);
  } catch (error) {
    return {
      ok: false,
      status: null,
      error: error instanceof Error ? error.message : "resolution refusee",
    };
  }

  let last: DeliveryResult = { ok: false, status: null, error: "aucune tentative" };
  for (let attempt = 1; attempt <= options.maxAttempts; attempt += 1) {
    last = await sendOnce(target, resolved, options);
    if (last.ok) return last;

    const retryable = last.status === null || last.status >= 500;
    if (!retryable || attempt === options.maxAttempts) return last;

    const backoffMs = 2 ** (attempt - 1) * 100 + Math.floor(Math.random() * 100);
    await new Promise((resolveDelay) => setTimeout(resolveDelay, backoffMs));
  }
  return last;
}
