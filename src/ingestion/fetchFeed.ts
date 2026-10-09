import { UpstreamError } from "../lib/errors.js";

export interface FetchFeedOptions {
  url: string;
  maxBytes: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

/** Telecharge un flux en bornant la taille et le temps, et retourne son contenu binaire. */
export async function fetchFeed(options: FetchFeedOptions): Promise<Buffer> {
  const { url, maxBytes, timeoutMs = 30_000, fetchImpl = fetch } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(url, { signal: controller.signal, redirect: "follow" });
    if (!response.ok) {
      throw new UpstreamError(`Flux indisponible : HTTP ${response.status}`);
    }

    const contentLength = response.headers.get("content-length");
    if (contentLength !== null && Number(contentLength) > maxBytes) {
      throw new UpstreamError("Flux trop volumineux (content-length)");
    }
    if (!response.body) {
      throw new UpstreamError("Flux vide");
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new UpstreamError("Flux trop volumineux");
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks);
  } catch (error) {
    if (error instanceof UpstreamError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new UpstreamError("Delai de telechargement depasse");
    }
    throw new UpstreamError("Telechargement du flux impossible", error);
  } finally {
    clearTimeout(timer);
  }
}
