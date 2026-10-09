import { describe, expect, it } from "vitest";
import { extractXmlFromZip } from "../../src/ingestion/zip.js";
import { UpstreamError } from "../../src/lib/errors.js";
import { buildZip } from "../helpers/zip.js";

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
