import { describe, expect, it } from "vitest";
import { fetchFeed } from "../../src/ingestion/fetchFeed.js";
import { UpstreamError } from "../../src/lib/errors.js";

function responseWith(body: Uint8Array, headers: Record<string, string> = {}): Response {
  return new Response(body, { headers });
}

describe("fetchFeed", () => {
  it("retourne le contenu quand tout va bien", async () => {
    const fetchImpl = async () => responseWith(new Uint8Array([1, 2, 3]));
    const buffer = await fetchFeed({ url: "https://x", maxBytes: 10, fetchImpl });
    expect(buffer).toEqual(Buffer.from([1, 2, 3]));
  });

  it("refuse une reponse HTTP en erreur", async () => {
    const fetchImpl = async () => new Response("nope", { status: 503 });
    await expect(fetchFeed({ url: "https://x", maxBytes: 10, fetchImpl })).rejects.toBeInstanceOf(
      UpstreamError,
    );
  });

  it("refuse un flux annonce trop volumineux (content-length)", async () => {
    const fetchImpl = async () => responseWith(new Uint8Array(100), { "content-length": "100" });
    await expect(fetchFeed({ url: "https://x", maxBytes: 10, fetchImpl })).rejects.toThrow(
      /volumineux/,
    );
  });

  it("refuse un flux qui depasse la borne pendant la lecture", async () => {
    const fetchImpl = async () => responseWith(new Uint8Array(100));
    await expect(fetchFeed({ url: "https://x", maxBytes: 10, fetchImpl })).rejects.toThrow(
      /volumineux/,
    );
  });

  it("traduit une annulation en erreur explicite", async () => {
    const fetchImpl = async () => {
      throw Object.assign(new Error("aborted"), { name: "AbortError" });
    };
    await expect(fetchFeed({ url: "https://x", maxBytes: 10, fetchImpl })).rejects.toThrow(/Delai/);
  });
});
