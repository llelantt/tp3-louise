/** Echappe une valeur pour un usage en HTML (ou utilisez textContent). */
export function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char],
  );
}

/** Formate un montant en euros. */
export function eur(value) {
  return `${Number(value).toFixed(2)} €`;
}

/** Formate un prix au litre. */
export function perLiter(value) {
  return `${Number(value).toFixed(3)} €/L`;
}

/** Formate une distance en kilometres. */
export function km(value) {
  return `${Number(value).toFixed(2)} km`;
}

/** Formate une date ISO en date/heure locale, ou un repli lisible. */
export function formatDateTime(iso) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "date inconnue" : date.toLocaleString("fr-FR");
}

/** Formate une duree relative lisible ("il y a 12 min"). */
export function relativeTime(iso, now = Date.now()) {
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return "date inconnue";
  const minutes = Math.max(0, Math.round((now - time) / 60_000));
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  return `il y a ${Math.round(hours / 24)} j`;
}
