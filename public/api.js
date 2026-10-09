import { CONFIG } from "./config.js";

/** Erreur d'appel API, porteuse du statut HTTP et du code machine. */
export class ApiError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = "ApiError";
    this.status = options.status ?? 0;
    this.code = options.code ?? "error";
    this.details = options.details;
    this.retryAfter = options.retryAfter ?? null;
  }
}

/**
 * Appelle l'API (prefixe /v1) avec la cle API. Leve une ApiError structuree.
 * `signal` permet d'annuler une requete (AbortController).
 */
export async function apiFetch(path, { apiKey, signal, method = "GET", body } = {}) {
  if (!apiKey) {
    throw new ApiError("Renseignez d'abord votre clé API.", { status: 401, code: "unauthorized" });
  }

  let response;
  try {
    response = await fetch(`${CONFIG.base}${path}`, {
      method,
      signal,
      headers: {
        "X-API-Key": apiKey,
        ...(body ? { "content-type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    if (error && error.name === "AbortError") throw error;
    throw new ApiError("API injoignable. Vérifiez votre connexion.", { code: "network_error" });
  }

  if (response.status === 204) return null;

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null; // corps non JSON : on retombe sur un message generique
  }

  if (!response.ok) {
    throw new ApiError(data && data.message ? data.message : `Erreur HTTP ${response.status}`, {
      status: response.status,
      code: data && data.error ? data.error : "http_error",
      details: data ? data.details : undefined,
      retryAfter: Number(response.headers.get("retry-after")) || null,
    });
  }
  return data;
}
