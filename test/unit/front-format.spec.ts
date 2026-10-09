import { describe, expect, it } from "vitest";
import {
  eur,
  escapeHtml,
  formatDateTime,
  km,
  perLiter,
  relativeTime,
} from "../../public/format.js";

describe("escapeHtml", () => {
  it("neutralise balises et guillemets", () => {
    expect(escapeHtml('<script>alert("x")</script>')).toBe(
      "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;",
    );
  });

  it("gere null et undefined", () => {
    expect(escapeHtml(null)).toBe("");
    expect(escapeHtml(undefined)).toBe("");
  });
});

describe("formats", () => {
  it("formate euros, prix au litre et kilometres", () => {
    expect(eur(91.4042)).toBe("91.40 €");
    expect(perLiter(1.799)).toBe("1.799 €/L");
    expect(km(3.1)).toBe("3.10 km");
  });

  it("formate une date invalide en repli", () => {
    expect(formatDateTime("pas une date")).toBe("date inconnue");
  });

  it("formate une duree relative", () => {
    const now = new Date("2026-10-09T12:00:00Z").getTime();
    expect(relativeTime("2026-10-09T11:45:00Z", now)).toBe("il y a 15 min");
    expect(relativeTime("2026-10-09T09:00:00Z", now)).toBe("il y a 3 h");
    expect(relativeTime("2026-10-08T12:00:00Z", now)).toBe("il y a 1 j");
    expect(relativeTime("n'importe quoi", now)).toBe("date inconnue");
  });
});
