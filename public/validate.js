import { CONFIG } from "./config.js";

function toNumber(value) {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function inRange(value, [min, max]) {
  return value !== null && value >= min && value <= max;
}

/**
 * Valide les champs de recherche cote client (l'API reste la source de verite).
 * Retourne un objet { champ: message } ; vide si tout est valide.
 */
export function validateSearch(input) {
  const errors = {};
  const { limits } = CONFIG;

  if (!inRange(toNumber(input.lat), limits.lat)) errors.lat = "Latitude entre -90 et 90.";
  if (!inRange(toNumber(input.lon), limits.lon)) errors.lon = "Longitude entre -180 et 180.";
  if (!inRange(toNumber(input.radius_km), limits.radiusKm)) {
    errors.radius_km = `Rayon entre ${limits.radiusKm[0]} et ${limits.radiusKm[1]} km.`;
  }
  if (!inRange(toNumber(input.liters), limits.liters)) {
    errors.liters = `Litres entre ${limits.liters[0]} et ${limits.liters[1]}.`;
  }
  if (!inRange(toNumber(input.consumption), limits.consumption)) {
    errors.consumption = `Consommation entre ${limits.consumption[0]} et ${limits.consumption[1]} L/100.`;
  }
  return errors;
}

/** Vrai si le texte de recherche d'adresse est exploitable (3 a 200 caracteres). */
export function isValidAddressQuery(value) {
  const query = String(value ?? "").trim();
  return query.length >= 3 && query.length <= 200;
}
