/** Erreur applicative portant un statut HTTP et un code machine. */
export class AppError extends Error {
  constructor(
    message: string,
    readonly statusCode: number = 500,
    readonly code: string = "internal_error",
    readonly details?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** Entree invalide (400). */
export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 400, "validation_error", details);
  }
}

/** Cle API absente ou invalide (401). */
export class UnauthorizedError extends AppError {
  constructor(message = "Cle API manquante ou invalide") {
    super(message, 401, "unauthorized");
  }
}

/** Ressource inexistante (404). */
export class NotFoundError extends AppError {
  constructor(message = "Ressource introuvable") {
    super(message, 404, "not_found");
  }
}

/** Limite de debit depassee (429). */
export class RateLimitError extends AppError {
  constructor(message = "Trop de requetes") {
    super(message, 429, "rate_limited");
  }
}

/** Source de donnees externe indisponible (502). */
export class UpstreamError extends AppError {
  constructor(message = "Source de donnees indisponible", details?: unknown) {
    super(message, 502, "upstream_error", details);
  }
}
