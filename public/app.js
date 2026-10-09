import { apiFetch, ApiError } from "./api.js";
import { CONFIG } from "./config.js";
import { eur, escapeHtml, formatDateTime, km, perLiter, relativeTime } from "./format.js";
import { priceHue, projectToSvg } from "./geometry.js";
import {
  loadApiKey,
  loadSettings,
  loadTheme,
  saveApiKey,
  saveSettings,
  saveTheme,
} from "./state.js";
import { isValidAddressQuery, validateSearch } from "./validate.js";

const $ = (selector) => document.querySelector(selector);

const CITIES = [
  { name: "Paris", lat: 48.8566, lon: 2.3522 },
  { name: "Lyon", lat: 45.764, lon: 4.8357 },
  { name: "Marseille", lat: 43.2965, lon: 5.3698 },
  { name: "Toulouse", lat: 43.6047, lon: 1.4442 },
  { name: "Lille", lat: 50.6292, lon: 3.0573 },
  { name: "Bordeaux", lat: 44.8378, lon: -0.5792 },
];

const state = {
  apiKey: loadApiKey(),
  settings: loadSettings(),
  results: [],
  center: { lat: 0, lon: 0, radius: 10 },
  selectedId: null,
  searchController: null,
  debounce: null,
  countdown: null,
};

/* ---------- utilitaires ---------- */

function setStatus(message, kind = "") {
  const node = $("#status");
  node.className = `status ${kind}`;
  node.textContent = message ?? "";
}

function fillSelect(select, options) {
  select.innerHTML = "";
  for (const option of options) {
    const node = document.createElement("option");
    node.value = option.value;
    node.textContent = option.label;
    select.append(node);
  }
}

function showFieldErrors(errors) {
  document.querySelectorAll("[data-error]").forEach((node) => {
    node.textContent = errors[node.dataset.error] ?? "";
  });
}

/* ---------- options (CONFIG) ---------- */

fillSelect($("#fuel"), CONFIG.fuels);
fillSelect($("#alertFuel"), CONFIG.fuels);
fillSelect($("#sort"), CONFIG.sorts);

function applySettings() {
  const s = state.settings;
  $("#lat").value = s.lat;
  $("#lon").value = s.lon;
  $("#fuel").value = s.fuel;
  $("#radius").value = s.radius_km;
  $("#liters").value = s.liters;
  $("#consumption").value = s.consumption;
  $("#sort").value = s.sort;
  $("#alertLat").value = s.lat;
  $("#alertLon").value = s.lon;
  $("#alertRadius").value = s.radius_km;
  $("#alertFuel").value = s.fuel;
}
applySettings();

/* ---------- thème ---------- */

function applyTheme(theme) {
  if (theme) document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme;
  $("#themeToggle").setAttribute("aria-pressed", String(theme === "dark"));
}
applyTheme(loadTheme());

$("#themeToggle").addEventListener("click", () => {
  const current = document.documentElement.dataset.theme;
  const next = current === "dark" ? "light" : "dark";
  applyTheme(next);
  saveTheme(next);
});

/* ---------- clé API ---------- */

function refreshKeyState() {
  const node = $("#apiKeyState");
  node.textContent = state.apiKey ? "enregistrée" : "absente";
  node.className = `state ${state.apiKey ? "ok" : "ko"}`;
}
$("#apiKey").value = state.apiKey;
refreshKeyState();

$("#apiKeySave").addEventListener("click", () => {
  state.apiKey = $("#apiKey").value.trim();
  saveApiKey(state.apiKey);
  refreshKeyState();
});
$("#apiKeyForget").addEventListener("click", () => {
  state.apiKey = "";
  $("#apiKey").value = "";
  saveApiKey("");
  refreshKeyState();
});

/* ---------- villes ---------- */

for (const city of CITIES) {
  const chip = document.createElement("button");
  chip.type = "button";
  chip.className = "chip";
  chip.textContent = city.name;
  chip.addEventListener("click", () => {
    $("#lat").value = city.lat;
    $("#lon").value = city.lon;
    runSearch();
  });
  $("#cities").append(chip);
}

/* ---------- adresse (géocodage via proxy /v1/geocode) ---------- */

async function searchAddress() {
  const query = $("#address").value;
  if (!isValidAddressQuery(query)) {
    setStatus("Saisissez une adresse de 3 à 200 caractères.", "error");
    return;
  }
  setStatus("Recherche de l'adresse…", "info");
  try {
    const data = await apiFetch(`/geocode?q=${encodeURIComponent(query.trim())}`, {
      apiKey: state.apiKey,
    });
    const first = data.results[0];
    if (!first) {
      setStatus("Adresse introuvable.", "warn");
      return;
    }
    $("#lat").value = first.lat;
    $("#lon").value = first.lon;
    setStatus(`Adresse : ${first.label}`, "info");
    runSearch();
  } catch (error) {
    handleError(error);
  }
}

$("#addressSearch").addEventListener("click", searchAddress);
$("#address").addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    searchAddress();
  }
});

/* ---------- recherche ---------- */

function readForm() {
  return {
    lat: $("#lat").value,
    lon: $("#lon").value,
    fuel: $("#fuel").value,
    radius_km: $("#radius").value,
    liters: $("#liters").value,
    consumption: $("#consumption").value,
    sort: $("#sort").value,
  };
}

function scheduleSearch() {
  clearTimeout(state.debounce);
  state.debounce = setTimeout(runSearch, 400);
}

async function runSearch() {
  const values = readForm();
  const errors = validateSearch(values);
  showFieldErrors(errors);
  if (Object.keys(errors).length > 0) {
    setStatus("Corrigez les champs en rouge.", "error");
    return;
  }

  state.settings = {
    lat: Number(values.lat),
    lon: Number(values.lon),
    fuel: values.fuel,
    radius_km: Number(values.radius_km),
    liters: Number(values.liters),
    consumption: Number(values.consumption),
    sort: values.sort,
  };
  saveSettings(state.settings);

  state.searchController?.abort();
  state.searchController = new AbortController();
  setStatus("Recherche…", "info");

  const params = new URLSearchParams({
    lat: values.lat,
    lon: values.lon,
    fuel: values.fuel,
    radius_km: values.radius_km,
    liters: values.liters,
    consumption: values.consumption,
    sort: values.sort,
  });

  try {
    const data = await apiFetch(`/stations/cheapest?${params.toString()}`, {
      apiKey: state.apiKey,
      signal: state.searchController.signal,
    });
    renderResults(data);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") return;
    handleError(error);
  }
}

$("#searchForm").addEventListener("submit", (event) => {
  event.preventDefault();
  runSearch();
});
for (const id of ["#lat", "#lon", "#fuel", "#radius", "#liters", "#consumption", "#sort"]) {
  $(id).addEventListener("change", scheduleSearch);
}

$("#geolocate").addEventListener("click", () => {
  if (!navigator.geolocation) {
    setStatus("Géolocalisation indisponible sur ce navigateur.", "error");
    return;
  }
  setStatus("Localisation en cours…", "info");
  navigator.geolocation.getCurrentPosition(
    (position) => {
      $("#lat").value = position.coords.latitude.toFixed(5);
      $("#lon").value = position.coords.longitude.toFixed(5);
      runSearch();
    },
    () => setStatus("Localisation refusée ou indisponible.", "error"),
    { enableHighAccuracy: true, timeout: 8000 },
  );
});

/* ---------- erreurs ---------- */

function handleError(error) {
  clearInterval(state.countdown);
  if (!(error instanceof ApiError)) {
    setStatus("Une erreur inattendue est survenue.", "error");
    return;
  }
  if (error.status === 401) {
    setStatus("Clé API absente ou invalide : renseignez-la en haut de la page.", "error");
    return;
  }
  if (error.status === 429) {
    let seconds = error.retryAfter ?? 60;
    setStatus(`Trop de requêtes. Réessayez dans ${seconds} s.`, "warn");
    state.countdown = setInterval(() => {
      seconds -= 1;
      if (seconds <= 0) {
        clearInterval(state.countdown);
        setStatus("Vous pouvez réessayer.", "info");
      } else {
        setStatus(`Trop de requêtes. Réessayez dans ${seconds} s.`, "warn");
      }
    }, 1000);
    return;
  }
  if (error.status >= 500) {
    setStatus("Le service est momentanément indisponible. Réessayez plus tard.", "error");
    return;
  }
  setStatus(error.message, "error");
}

window.addEventListener("error", () =>
  setStatus("Une erreur est survenue dans l'interface.", "error"),
);
window.addEventListener("unhandledrejection", () =>
  setStatus("Une erreur est survenue dans l'interface.", "error"),
);

/* ---------- rendu résultats + plan ---------- */

function renderResults(data) {
  state.results = data?.stations ?? [];
  state.center = {
    lat: Number($("#lat").value),
    lon: Number($("#lon").value),
    radius: Number($("#radius").value),
  };
  state.selectedId = null;

  const freshness = data?.data_freshness;
  $("#freshness").textContent = freshness?.last_success_at
    ? `prix mis à jour ${relativeTime(freshness.last_success_at)}`
    : "";

  if (state.results.length === 0) {
    setStatus("Aucune station trouvée dans ce rayon.", "info");
    $("#results").innerHTML = "";
    renderMap();
    return;
  }

  const truncated = data.truncated ? " (résultats tronqués)" : "";
  setStatus(`${data.count} station(s) — classées par coût réel${truncated}.`, "info");

  const prices = state.results.map((station) => station.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);

  $("#results").innerHTML = state.results
    .map((station, index) => {
      const economy = station.economy_vs_nearest;
      const save =
        economy > 0.005
          ? `<span class="pill save">−${eur(economy)} vs la plus proche</span>`
          : `<span class="pill">référence proche</span>`;
      return `
        <button class="result" type="button" data-id="${Number(station.id)}">
          <span class="rank">${index + 1}</span>
          <span>
            <strong class="result-title">${escapeHtml(station.name)}${station.brand ? ` · ${escapeHtml(station.brand)}` : ""}</strong>
            <span class="meta">${escapeHtml(station.address ?? "")} ${escapeHtml(station.city ?? "")}</span>
            <span class="pills">
              <span class="pill">${km(station.distance_km)}</span>
              <span class="pill">détour ${eur(station.detour_cost)}</span>
              ${save}
            </span>
          </span>
          <span>
            <span class="price-board"><span class="value">${Number(station.price).toFixed(3)}</span><span class="unit">€/L</span></span>
            <span class="price-sub">plein ${eur(station.total_cost)}</span>
          </span>
        </button>`;
    })
    .join("");

  $("#results")
    .querySelectorAll(".result")
    .forEach((node) => node.addEventListener("click", () => openDetail(node.dataset.id)));

  renderMap(min, max);
}

function renderMap(min = 0, max = 1) {
  const svg = $("#map");
  const { lat, lon, radius } = state.center;
  const rings = [radius / 3, (2 * radius) / 3, radius]
    .map((r) => `<circle class="map-ring" cx="200" cy="200" r="${(180 * r) / radius}"></circle>`)
    .join("");
  const center = `
    <circle class="map-center" cx="200" cy="200" r="4"></circle>
    <text class="map-center-label" x="200" y="188" text-anchor="middle">Toi</text>`;

  const stations = state.results
    .map((station) => {
      const point = projectToSvg(Number(station.lat), Number(station.lon), lat, lon, radius);
      const hue = priceHue(station.price, min, max);
      const label = `${station.name} — ${perLiter(station.price)} à ${km(station.distance_km)}`;
      return `<g class="map-station" data-id="${Number(station.id)}" tabindex="0" role="button" aria-label="${escapeHtml(label)}">
        <circle cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="7" fill="hsl(${hue} 70% 42%)" stroke="var(--card)" stroke-width="2"></circle>
      </g>`;
    })
    .join("");

  svg.innerHTML = rings + center + stations;

  svg.querySelectorAll(".map-station").forEach((node) => {
    const open = () => openDetail(node.dataset.id);
    node.addEventListener("click", open);
    node.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        open();
      }
    });
    node.addEventListener("focus", () => selectStation(node.dataset.id));
    node.addEventListener("mouseenter", () => selectStation(node.dataset.id));
  });
}

function selectStation(id) {
  state.selectedId = String(id);
  document.querySelectorAll(".map-station").forEach((node) => {
    node.classList.toggle("selected", node.dataset.id === state.selectedId);
  });
}

/* ---------- détail ---------- */

function sparkline(history) {
  if (!history || history.length < 2) {
    return '<p class="meta">Historique insuffisant pour tracer une courbe.</p>';
  }
  const points = [...history].reverse();
  const prices = points.map((point) => point.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const span = max - min || 1;
  const width = 600;
  const height = 56;
  const step = width / (points.length - 1);
  const path = points
    .map((point, index) => {
      const x = index * step;
      const y = height - ((point.price - min) / span) * (height - 10) - 5;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return `<svg class="spark" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="Historique du prix">
      <polyline points="${path}" fill="none" stroke="var(--accent)" stroke-width="2"></polyline>
    </svg>
    <div class="meta">min ${perLiter(min)} · max ${perLiter(max)} · ${points.length} relevés</div>`;
}

async function openDetail(id) {
  const modal = $("#modal");
  $("#modalBody").innerHTML = "<p>Chargement…</p>";
  modal.hidden = false;
  selectStation(id);
  try {
    const data = await apiFetch(`/stations/${Number(id)}`, { apiKey: state.apiKey });
    const station = data.station;
    const fuels = (station.fuels ?? [])
      .map(
        (fuel) => `
        <div class="fuel-block">
          <div class="fuel-head">
            <strong>${escapeHtml(fuel.fuel.toUpperCase())}</strong>
            <span class="price-board ${fuel.is_stale ? "stale" : ""}">
              <span class="value">${Number(fuel.price).toFixed(3)}</span><span class="unit">€/L</span>
            </span>
          </div>
          <div class="meta">
            mis à jour le ${escapeHtml(formatDateTime(fuel.observed_at))}
            ${fuel.is_stale ? '<span class="tag stale">périmé</span>' : ""}
            ${fuel.is_rupture ? '<span class="tag rupture">rupture</span>' : ""}
          </div>
          ${sparkline(fuel.history)}
        </div>`,
      )
      .join("");

    $("#modalBody").innerHTML = `
      <h2>${escapeHtml(station.name)}</h2>
      <p class="meta">${escapeHtml(station.address ?? "")} — ${escapeHtml(station.postal_code ?? "")} ${escapeHtml(station.city ?? "")}</p>
      <div class="pills">
        <span class="pill">${station.is_24h ? "24h/24" : "horaires limités"}</span>
        ${station.is_closed ? '<span class="pill warn">fermée</span>' : ""}
        ${(station.services ?? []).map((service) => `<span class="pill">${escapeHtml(service)}</span>`).join("")}
      </div>
      ${fuels || "<p class='meta'>Aucun prix disponible.</p>"}
    `;
  } catch (error) {
    $("#modalBody").innerHTML = `<p class="status error">${escapeHtml(error.message)}</p>`;
  }
}

$("#modal").addEventListener("click", (event) => {
  if (event.target.dataset.close !== undefined) $("#modal").hidden = true;
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") $("#modal").hidden = true;
});

/* ---------- alertes ---------- */

$("#alertForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = {
    fuel: $("#alertFuel").value,
    lat: Number($("#alertLat").value),
    lon: Number($("#alertLon").value),
    radius_km: Number($("#alertRadius").value),
    threshold_price: Number($("#alertThreshold").value),
    label: `Alerte ${$("#alertFuel").value}`,
  };
  if (
    !Number.isFinite(payload.lat) ||
    !Number.isFinite(payload.lon) ||
    !(payload.threshold_price > 0)
  ) {
    setStatus("Alerte invalide : vérifiez la position et le seuil.", "error");
    return;
  }
  try {
    await apiFetch("/alerts", { apiKey: state.apiKey, method: "POST", body: payload });
    setStatus("Alerte créée.", "info");
    await loadAlerts();
  } catch (error) {
    handleError(error);
  }
});

$("#alertsRefresh").addEventListener("click", loadAlerts);

async function loadAlerts() {
  const container = $("#alertsList");
  container.innerHTML = "<p class='meta'>Chargement…</p>";
  try {
    const data = await apiFetch("/alerts", { apiKey: state.apiKey });
    if (!data.alerts.length) {
      container.innerHTML = "<p class='meta'>Aucune alerte pour l'instant.</p>";
      return;
    }
    container.innerHTML = data.alerts
      .map(
        (alert) => `
        <div class="alert-item">
          <span>
            <strong>${escapeHtml(alert.label ?? alert.fuel)}</strong>
            <span class="meta">${escapeHtml(alert.fuel)} ≤ ${perLiter(alert.threshold_price)} · ${Number(alert.radius_km).toFixed(0)} km${alert.is_active ? "" : " · désactivée"}</span>
          </span>
          <span>
            <button class="link-btn" type="button" data-events="${escapeHtml(alert.id)}">événements</button>
            <button class="link-btn danger" type="button" data-delete="${escapeHtml(alert.id)}">supprimer</button>
          </span>
        </div>`,
      )
      .join("");

    container.querySelectorAll("[data-delete]").forEach((node) =>
      node.addEventListener("click", async () => {
        if (!window.confirm("Supprimer cette alerte ?")) return;
        try {
          await apiFetch(`/alerts/${node.dataset.delete}`, {
            apiKey: state.apiKey,
            method: "DELETE",
          });
          await loadAlerts();
        } catch (error) {
          handleError(error);
        }
      }),
    );
    container
      .querySelectorAll("[data-events]")
      .forEach((node) => node.addEventListener("click", () => showEvents(node.dataset.events)));
  } catch (error) {
    container.innerHTML = `<p class="status error">${escapeHtml(error.message)}</p>`;
  }
}

async function showEvents(alertId) {
  const modal = $("#modal");
  $("#modalBody").innerHTML = "<p>Chargement…</p>";
  modal.hidden = false;
  try {
    const data = await apiFetch(`/alerts/${alertId}/events`, { apiKey: state.apiKey });
    if (!data.events.length) {
      $("#modalBody").innerHTML =
        "<h2>Événements</h2><p class='meta'>Aucun événement déclenché.</p>";
      return;
    }
    const rows = data.events
      .map(
        (event) => `
        <div class="alert-item">
          <span>Station <strong>#${Number(event.station_id)}</strong> — ${escapeHtml(event.fuel)}</span>
          <span>${perLiter(event.price)} · ${escapeHtml(formatDateTime(event.triggered_at))}</span>
        </div>`,
      )
      .join("");
    $("#modalBody").innerHTML = `<h2>Événements</h2>${rows}`;
  } catch (error) {
    $("#modalBody").innerHTML = `<p class="status error">${escapeHtml(error.message)}</p>`;
  }
}

loadAlerts();
