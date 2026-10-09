import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { extractXmlFromZip } from "../../src/ingestion/zip.js";
import { UpstreamError } from "../../src/lib/errors.js";

interface ZipSpec {
  name: string;
  content: Buffer;
  method: 0 | 8;
}

// Construit une archive ZIP minimale (CRC volontairement nul : le lecteur ne le verifie pas).
function buildZip(entries: ZipSpec[]): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, "utf8");
    const data = entry.method === 8 ? deflateRawSync(entry.content) : entry.content;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(entry.method, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(entry.content.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    localParts.push(local, nameBuf, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(entry.method, 10);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(entry.content.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, nameBuf);

    offset += local.length + nameBuf.length + data.length;
  }

  const centralDir = Buffer.concat(centralParts);
  const localData = Buffer.concat(localParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDir.length, 12);
  eocd.writeUInt32LE(localData.length, 16);

  return Buffer.concat([localData, centralDir, eocd]);
}

const xml = Buffer.from('<pdv_liste><pdv id="1"/></pdv_liste>', "utf8");

describe("extractXmlFromZip", () => {
  it("extrait une entree stockee (methode 0)", () => {
    const zip = buildZip([{ name: "data.xml", content: xml, method: 0 }]);
    expect(extractXmlFromZip(zip, 1_000_000).data.toString("utf8")).toBe(xml.toString("utf8"));
  });

  it("extrait une entree deflate (methode 8)", () => {
    const zip = buildZip([{ name: "data.xml", content: xml, method: 8 }]);
    expect(extractXmlFromZip(zip, 1_000_000).data.toString("utf8")).toBe(xml.toString("utf8"));
  });

  it("choisit l'entree .xml parmi plusieurs fichiers", () => {
    const zip = buildZip([
      { name: "readme.txt", content: Buffer.from("ignore"), method: 0 },
      { name: "prix.xml", content: xml, method: 8 },
    ]);
    expect(extractXmlFromZip(zip, 1_000_000).name).toBe("prix.xml");
  });

  it("refuse une archive sans entree XML", () => {
    const zip = buildZip([{ name: "readme.txt", content: Buffer.from("x"), method: 0 }]);
    expect(() => extractXmlFromZip(zip, 1_000_000)).toThrow(UpstreamError);
  });

  it("refuse une archive trop grande une fois decompressee (anti zip-bomb)", () => {
    const big = Buffer.alloc(5000, 0x41);
    const zip = buildZip([{ name: "data.xml", content: big, method: 0 }]);
    expect(() => extractXmlFromZip(zip, 100)).toThrow(/trop grande/);
  });

  it("refuse une archive corrompue", () => {
    expect(() => extractXmlFromZip(Buffer.from("pas un zip"), 1000)).toThrow(UpstreamError);
  });
});
