import { XMLParser } from "fast-xml-parser";
import type { Fuel } from "../db/schema.js";

const FUEL_BY_NAME: Record<string, Fuel> = {
  gazole: "gazole",
  sp95: "sp95",
  sp98: "sp98",
  e10: "e10",
  e85: "e85",
  gplc: "gplc",
  "gpl c": "gplc",
};

/** Convertit le nom de carburant du flux en valeur d'enum, ou null si inconnu. */
export function normalizeFuelName(raw: string): Fuel | null {
  return FUEL_BY_NAME[raw.trim().toLowerCase().replace(/\s+/g, " ")] ?? null;
}

/** Normalise une coordonnee : le flux peut exprimer les degres multiplies par 100000. */
export function normalizeCoordinate(value: number): number {
  return Math.abs(value) > 180 ? value / 100_000 : value;
}

export interface ParsedPrice {
  fuel: Fuel;
  price: number;
  observedAt: Date;
  isRupture: boolean;
}

export interface ParsedStation {
  id: number;
  name: string;
  brand: string | null;
  address: string | null;
  city: string | null;
  postalCode: string | null;
  lat: number;
  lon: number;
  services: string[];
  hours: unknown;
  is24h: boolean;
  isClosed: boolean;
  sourceUpdatedAt: Date | null;
  prices: ParsedPrice[];
}

export interface ParseResult {
  stations: ParsedStation[];
  skipped: number;
}

interface RawPdv {
  "@_id"?: string;
  "@_latitude"?: string;
  "@_longitude"?: string;
  "@_cp"?: string;
  "@_adresse"?: string;
  "@_ville"?: string;
  "@_automate-24-24"?: string;
  services?: { service?: string[] };
  horaires?: unknown;
  prix?: RawPrice[];
  rupture?: RawRupture[];
}

interface RawPrice {
  "@_nom"?: string;
  "@_valeur"?: string;
  "@_maj"?: string;
}

interface RawRupture {
  "@_nom"?: string;
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseAttributeValue: false,
  trimValues: true,
  isArray: (name) => ["pdv", "prix", "rupture", "service"].includes(name),
});

function toDate(value: string | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parsePdv(pdv: RawPdv): ParsedStation | null {
  const id = Number(pdv["@_id"]);
  if (!Number.isInteger(id) || id <= 0) return null;

  const lat = normalizeCoordinate(Number(pdv["@_latitude"]));
  const lon = normalizeCoordinate(Number(pdv["@_longitude"]));
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;

  const ruptures = new Set(
    (pdv.rupture ?? [])
      .map((rupture) => (rupture["@_nom"] ? normalizeFuelName(rupture["@_nom"]) : null))
      .filter((fuel): fuel is Fuel => fuel !== null),
  );

  const prices: ParsedPrice[] = [];
  for (const rawPrice of pdv.prix ?? []) {
    const fuel = rawPrice["@_nom"] ? normalizeFuelName(rawPrice["@_nom"]) : null;
    const price = Number(rawPrice["@_valeur"]);
    const observedAt = toDate(rawPrice["@_maj"]);
    if (!fuel || !Number.isFinite(price) || price <= 0 || price > 100 || !observedAt) continue;
    prices.push({ fuel, price, observedAt, isRupture: ruptures.has(fuel) });
  }

  const sourceUpdatedAt = prices.reduce<Date | null>(
    (latest, price) => (latest === null || price.observedAt > latest ? price.observedAt : latest),
    null,
  );

  return {
    id,
    name: pdv["@_adresse"]?.trim() || `Station ${id}`,
    brand: null,
    address: pdv["@_adresse"]?.trim() ?? null,
    city: pdv["@_ville"]?.trim() ?? null,
    postalCode: pdv["@_cp"]?.trim() ?? null,
    lat,
    lon,
    services: pdv.services?.service ?? [],
    hours: pdv.horaires ?? null,
    is24h: pdv["@_automate-24-24"] === "1",
    isClosed: false,
    sourceUpdatedAt,
    prices,
  };
}

/** Transforme le XML du flux en stations structurees ; les points invalides sont comptes. */
export function parseStationsXml(xml: string): ParseResult {
  const parsed = parser.parse(xml) as { pdv_liste?: { pdv?: RawPdv[] } };
  const pdvs = parsed.pdv_liste?.pdv ?? [];

  const stations: ParsedStation[] = [];
  let skipped = 0;
  for (const pdv of pdvs) {
    const station = parsePdv(pdv);
    if (station) stations.push(station);
    else skipped += 1;
  }
  return { stations, skipped };
}
