import { createHmac } from "node:crypto";
import {
  createServer,
  type IncomingHttpHeaders,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import {
  deliverWebhook,
  isForbiddenAddress,
  resolvePublicAddress,
  signPayload,
} from "../../src/modules/alerts/webhook.js";

const options = {
  timeoutMs: 2000,
  maxResponseBytes: 65_536,
  maxAttempts: 3,
  allowPrivate: true,
};

type Handler = (req: IncomingMessage, res: ServerResponse) => void;

async function listen(handler: Handler): Promise<{
  server: Server;
  url: string;
  close: () => Promise<void>;
}> {
  const server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    server,
    url: `http://127.0.0.1:${port}/hook`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

describe("signPayload", () => {
  it("signe timestamp.corps en HMAC-SHA256", () => {
    const signature = signPayload("secret", "123", '{"a":1}');
    const expected = `sha256=${createHmac("sha256", "secret").update('123.{"a":1}').digest("hex")}`;
    expect(signature).toBe(expected);
  });
});

describe("isForbiddenAddress", () => {
  it("rejette prive/loopback/link-local", () => {
    for (const ip of [
      "127.0.0.1",
      "10.0.0.5",
      "192.168.1.1",
      "172.16.0.1",
      "169.254.1.1",
      "::1",
      "fe80::1",
      "fc00::1",
      "::ffff:127.0.0.1",
    ]) {
      expect(isForbiddenAddress(ip)).toBe(true);
    }
  });

  it("accepte des adresses publiques", () => {
    for (const ip of ["8.8.8.8", "1.1.1.1", "2001:4860:4860::8888"]) {
      expect(isForbiddenAddress(ip)).toBe(false);
    }
  });
});

describe("resolvePublicAddress", () => {
  it("refuse une IP privee litterale hors test", async () => {
    await expect(resolvePublicAddress("127.0.0.1", false)).rejects.toThrow();
  });

  it("autorise une IP privee en mode test", async () => {
    await expect(resolvePublicAddress("127.0.0.1", true)).resolves.toEqual({
      address: "127.0.0.1",
      family: 4,
    });
  });
});

describe("deliverWebhook", () => {
  it("refuse http hors mode test", async () => {
    const result = await deliverWebhook(
      { id: 1, url: "http://example.com/x", secret: "s", payload: {} },
      { ...options, allowPrivate: false },
    );
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/https/);
  });

  it("refuse une cible loopback hors mode test", async () => {
    const result = await deliverWebhook(
      { id: 1, url: "https://127.0.0.1/x", secret: "s", payload: {} },
      { ...options, allowPrivate: false },
    );
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/privee/i);
  });

  it("livre un webhook signe", async () => {
    const box: { value: { headers: IncomingHttpHeaders; body: string } | null } = { value: null };
    const { url, close } = await listen((req, res) => {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        box.value = { headers: req.headers, body };
        res.writeHead(200);
        res.end("ok");
      });
    });

    try {
      const result = await deliverWebhook(
        { id: 7, url, secret: "s3cr3t", payload: { hello: "world" } },
        options,
      );
      expect(result.ok).toBe(true);
      const received = box.value;
      expect(received?.headers["x-carbu-event-id"]).toBe("7");
      const timestamp = received?.headers["x-carbu-timestamp"] as string;
      expect(timestamp).toBeDefined();
      expect(received?.headers["x-carbu-signature"]).toBe(
        signPayload("s3cr3t", timestamp, received?.body ?? ""),
      );
    } finally {
      await close();
    }
  });

  it("reessaie sur 5xx puis reussit", async () => {
    let attempts = 0;
    const { url, close } = await listen((req, res) => {
      attempts += 1;
      req.on("data", () => undefined);
      req.on("end", () => {
        if (attempts < 2) {
          res.writeHead(500);
          res.end("boom");
        } else {
          res.writeHead(204);
          res.end();
        }
      });
    });

    try {
      const result = await deliverWebhook({ id: 2, url, secret: "s", payload: {} }, options);
      expect(result.ok).toBe(true);
      expect(attempts).toBe(2);
    } finally {
      await close();
    }
  });

  it("ne reessaie pas sur 4xx", async () => {
    let attempts = 0;
    const { url, close } = await listen((req, res) => {
      attempts += 1;
      req.on("data", () => undefined);
      req.on("end", () => {
        res.writeHead(400);
        res.end("bad");
      });
    });

    try {
      const result = await deliverWebhook({ id: 3, url, secret: "s", payload: {} }, options);
      expect(result.ok).toBe(false);
      expect(result.status).toBe(400);
      expect(attempts).toBe(1);
    } finally {
      await close();
    }
  });
});
