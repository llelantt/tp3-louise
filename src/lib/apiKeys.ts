import { createHmac, randomBytes } from "node:crypto";

/** Prefixe commun a toutes les cles API. */
export const API_KEY_PREFIX = "ck_";

/** 32 octets = 256 bits d'entropie, soit 43 caracteres en base64url sans padding. */
const KEY_BYTES = 32;
const API_KEY_PATTERN = /^ck_[A-Za-z0-9_-]{43}$/;

/** Genere une cle API opaque de 256 bits, pretee au client une seule fois. */
export function generateApiKey(): string {
  return `${API_KEY_PREFIX}${randomBytes(KEY_BYTES).toString("base64url")}`;
}

/** Verifie le format d'une cle API sans toucher a la base. */
export function isValidApiKeyFormat(key: string): boolean {
  return API_KEY_PATTERN.test(key);
}

/**
 * Calcule la signature HMAC-SHA256 (hex) d'une cle, poivree. Seule cette empreinte
 * est stockee ; la comparaison se fait par l'index unique en base, jamais en clair.
 */
export function hashApiKey(key: string, pepper: string): string {
  return createHmac("sha256", pepper).update(key).digest("hex");
}
