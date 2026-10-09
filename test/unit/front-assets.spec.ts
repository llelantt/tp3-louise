import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Le front ne doit charger AUCUNE ressource externe (CSP stricte, polices auto-hébergées).
describe("ressources du front", () => {
  it("index.html ne charge aucune ressource externe", () => {
    const html = readFileSync("public/index.html", "utf8");
    expect(html).not.toMatch(/<script[^>]+src="https?:/i);
    expect(html).not.toMatch(/<link[^>]+href="https?:/i);
    expect(html).not.toMatch(/googleapis|gstatic/i);
  });

  it("styles.css ne charge aucune ressource externe", () => {
    const css = readFileSync("public/styles.css", "utf8");
    expect(css).not.toMatch(/url\(\s*['"]?https?:/i);
    expect(css).not.toMatch(/@import/i);
    expect(css).not.toMatch(/googleapis|gstatic/i);
  });

  it("les polices sont auto-hebergees, avec leur licence", () => {
    for (const file of [
      "Barlow-400.woff2",
      "Barlow-600.woff2",
      "BarlowSemiCondensed-500.woff2",
      "BarlowSemiCondensed-700.woff2",
    ]) {
      expect(existsSync(`public/fonts/${file}`)).toBe(true);
    }
    expect(existsSync("public/fonts/OFL.txt")).toBe(true);
  });
});
