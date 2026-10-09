import { createHash, randomBytes } from "node:crypto";

/** Genere une cle API opaque, pretee au client une seule fois. */
export function generateApiKey(): string {
  return `ck_${randomBytes(24).toString("base64url")}`;
}

/** Calcule l'empreinte SHA-256 d'une cle, poivree, telle que stockee en base. */
export function hashApiKey(key: string, pepper: string): string {
  return createHash("sha256").update(`${pepper}:${key}`).digest("hex");
}
