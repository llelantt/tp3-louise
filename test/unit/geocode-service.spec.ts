import { describe, expect, it } from "vitest";
import { parseConfig } from "../../src/config.js";
import { UpstreamError } from "../../src/lib/errors.js";
import { Geocoder, normalizeQuery } from "../../src/modules/geocode/service.js";

const config = parseConfig({
  DATABASE_URL: "postgres://user:pass@localhost:5432/carbu",
  API_KEY_PEPPER: "pepper-de-test",
  GEOCODE_CACHE_MAX: "10",
  GEOCODE_TIMEOUT_MS: "100",
});

function feature(label: string, lon: number, lat: number, city: string, postcode: string) {
  return {
    type: "Feature",
    properties: { label, city, postcode },
    geometry: { type: "Point", coordinates: [lon, lat] },
  };
}

function geojson(features: unknown[]): Response {
  return new Response(JSON.stringify({ type: "FeatureCollection", features }), { status: 200 });
}

describe("normalizeQuery", () => {
  it("nettoie les espaces superflus", () => {
    expect(normalizeQuery("  10   rue  de   Rivoli ")).toBe("10 rue de Rivoli");
  });

  it("rejette une saisie trop courte ou trop longue", () => {
    expect(normalizeQuery("ab")).toBeNull();
    expect(normalizeQuery("a".repeat(201))).toBeNull();
  });
});

describe("Geocoder", () => {
  it("mappe les resultats de l'upstream", async () => {
    const fetchImpl = async () =>
      geojson([feature("10 Rue X 75013 Paris", 2.36, 48.82, "Paris", "75013")]);
    const results = await new Geocoder(config, fetchImpl).search("10 rue X");
    expect(results).toEqual([
      { label: "10 Rue X 75013 Paris", lat: 48.82, lon: 2.36, city: "Paris", postal_code: "75013" },
    ]);
  });

  it("met en cache : un seul appel reseau pour deux recherches identiques", async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      return geojson([]);
    };
    const geocoder = new Geocoder(config, fetchImpl);
    await geocoder.search("adresse de test");
    await geocoder.search("adresse de test");
    expect(calls).toBe(1);
  });

  it("traduit un statut d'erreur upstream en UpstreamError", async () => {
    const fetchImpl = async () => new Response("boom", { status: 500 });
    await expect(new Geocoder(config, fetchImpl).search("adresse de test")).rejects.toBeInstanceOf(
      UpstreamError,
    );
  });

  it("rejette une reponse upstream malformee", async () => {
    const fetchImpl = async () => new Response(JSON.stringify({ nope: true }), { status: 200 });
    await expect(new Geocoder(config, fetchImpl).search("adresse de test")).rejects.toBeInstanceOf(
      UpstreamError,
    );
  });

  it("traduit un timeout en UpstreamError", async () => {
    const fetchImpl = async () => {
      throw Object.assign(new Error("aborted"), { name: "AbortError" });
    };
    await expect(new Geocoder(config, fetchImpl).search("adresse de test")).rejects.toBeInstanceOf(
      UpstreamError,
    );
  });
});
