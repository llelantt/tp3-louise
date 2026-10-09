import { describe, expect, it } from "vitest";
import {
  normalizeCoordinate,
  normalizeFuelName,
  parseStationsXml,
} from "../../src/ingestion/parseStations.js";

const sampleXml = `<?xml version="1.0" encoding="utf-8"?>
<pdv_liste>
  <pdv id="1000001" latitude="4885000" longitude="235000" cp="75001" adresse="1 rue de Rivoli" ville="Paris" automate-24-24="1">
    <services>
      <service>Lavage</service>
      <service>Boutique</service>
    </services>
    <prix nom="Gazole" valeur="1.799" maj="2026-10-01T10:00:00Z"/>
    <prix nom="SP95" valeur="1.899" maj="2026-10-01T10:05:00Z"/>
    <rupture nom="E85" debut="2026-09-01T00:00:00Z" type="definitive"/>
  </pdv>
  <pdv id="1000002" latitude="43.6" longitude="1.44" cp="31000" adresse="2 avenue" ville="Toulouse" automate-24-24="0">
    <prix nom="E10" valeur="1.699" maj="2026-10-01T09:00:00Z"/>
  </pdv>
  <pdv id="1000003" latitude="9999999" longitude="235000" adresse="hors bornes" ville="Nul">
    <prix nom="Gazole" valeur="1.5" maj="2026-10-01T09:00:00Z"/>
  </pdv>
  <pdv id="1000004" latitude="4885000" longitude="235000" adresse="prix invalide" ville="Paris">
    <prix nom="Gazole" valeur="abc" maj="2026-10-01T09:00:00Z"/>
  </pdv>
</pdv_liste>`;

describe("normalizeFuelName", () => {
  it("mappe les noms du flux vers l'enum", () => {
    expect(normalizeFuelName("Gazole")).toBe("gazole");
    expect(normalizeFuelName("SP95")).toBe("sp95");
    expect(normalizeFuelName("GPLc")).toBe("gplc");
  });

  it("retourne null pour un carburant inconnu", () => {
    expect(normalizeFuelName("Hydrogene")).toBeNull();
  });
});

describe("normalizeCoordinate", () => {
  it("divise par 100000 les degres multiplies", () => {
    expect(normalizeCoordinate(4885000)).toBeCloseTo(48.85, 5);
  });

  it("laisse les degres decimaux tels quels", () => {
    expect(normalizeCoordinate(43.6)).toBe(43.6);
  });
});

describe("parseStationsXml", () => {
  const result = parseStationsXml(sampleXml);

  it("ignore les points hors bornes et les compte", () => {
    expect(result.skipped).toBe(1);
    expect(result.stations.map((s) => s.id)).toEqual([1000001, 1000002, 1000004]);
  });

  it("normalise les coordonnees et les attributs", () => {
    const station = result.stations[0];
    expect(station?.lat).toBeCloseTo(48.85, 5);
    expect(station?.lon).toBeCloseTo(2.35, 5);
    expect(station?.is24h).toBe(true);
    expect(station?.services).toEqual(["Lavage", "Boutique"]);
    expect(station?.postalCode).toBe("75001");
  });

  it("parse les prix et retient la date la plus recente", () => {
    const station = result.stations[0];
    expect(station?.prices).toHaveLength(2);
    expect(station?.sourceUpdatedAt?.toISOString()).toBe("2026-10-01T10:05:00.000Z");
  });

  it("ignore les prix non numeriques", () => {
    const station = result.stations.find((s) => s.id === 1000004);
    expect(station?.prices).toEqual([]);
  });

  it("supporte un XML vide", () => {
    expect(parseStationsXml("<pdv_liste/>")).toEqual({ stations: [], skipped: 0 });
  });
});
