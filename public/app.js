import { apiFetch, ApiError } from "./api.js";
import { CONFIG } from "./config.js";
import { eur, escapeHtml, formatDateTime, km, perLiter } from "./format.js";
import { loadApiKey, loadSettings, saveApiKey, saveSettings } from "./state.js";

const $ = (selector) => document.querySelector(selector);

const state = {
  apiKey: loadApiKey(),
  settings: loadSettings(),
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

/* ---------- options issues de CONFIG (source unique) ---------- */

fillSelect($("#fuel"), CONFIG.fuels);
fillSelect($("#alertFuel"), CONFIG.fuels);
fillSelect($("#sort"), CONFIG.sorts);

/* ---------- application des réglages mémorisés ---------- */

function applySettings() {
  const settings = state.settings;
  $("#lat").value = settings.lat;
  $("#lon").value = settings.lon;
  $("#fuel").value = settings.fuel;
  $("#radius").value = settings.radius_km;
  $("#liters").value = settings.liters;
  $("#consumption").value = settings.consumption;
  $("#sort").value = settings.sort;
}
applySettings();

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

/* ---------- recherche ---------- */

$("#searchForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const params = new URLSearchParams({
    lat: form.get("lat"),
    lon: form.get("lon"),
    fuel: form.get("fuel"),
    radius_km: form.get("radius_km"),
    liters: form.get("liters"),
    consumption: form.get("consumption"),
    sort: form.get("sort"),
  });

  state.settings = {
    lat: Number(form.get("lat")),
    lon: Number(form.get("lon")),
    fuel: String(form.get("fuel")),
    radius_km: Number(form.get("radius_km")),
    liters: Number(form.get("liters")),
    consumption: Number(form.get("consumption")),
    sort: String(form.get("sort")),
  };
  saveSettings(state.settings);

  setStatus("Recherche…", "info");
  $("#results").innerHTML = "";
  try {
    const data = await apiFetch(`/stations/cheapest?${params.toString()}`, {
      apiKey: state.apiKey,
    });
    renderResults(data);
  } catch (error) {
    setStatus(error instanceof ApiError ? error.message : "Erreur inattendue.", "error");
  }
});

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
      setStatus("Position mise à jour.", "info");
    },
    () => setStatus("Localisation refusée ou indisponible.", "error"),
    { enableHighAccuracy: true, timeout: 8000 },
  );
});

function renderResults(data) {
  const stations = data?.stations ?? [];
  if (stations.length === 0) {
    setStatus("Aucune station trouvée dans ce rayon.", "info");
    return;
  }
  setStatus(`${data.count} station(s) — classées par coût réel.`, "info");

  const container = $("#results");
  container.innerHTML = stations
    .map((station, index) => {
      const economy = station.economy_vs_nearest;
      const economyPill =
        economy > 0.005
          ? `<span class="pill save">−${eur(economy)} vs la plus proche</span>`
          : `<span class="pill">référence proche</span>`;
      return `
        <article class="result" data-id="${Number(station.id)}" tabindex="0">
          <div class="rank">${index + 1}</div>
          <div class="result-main">
            <h3>${escapeHtml(station.name)}${station.brand ? ` · ${escapeHtml(station.brand)}` : ""}</h3>
            <div class="meta">${escapeHtml(station.address ?? "")} ${escapeHtml(station.city ?? "")}</div>
            <div class="pills">
              <span class="pill">${km(station.distance_km)}</span>
              <span class="pill cost">détour ${eur(station.detour_cost)}</span>
              ${economyPill}
            </div>
          </div>
          <div class="result-price">
            <div class="big">${perLiter(station.price)}</div>
            <div class="sub">plein ${eur(station.total_cost)}</div>
          </div>
        </article>`;
    })
    .join("");

  container.querySelectorAll(".result").forEach((node) => {
    const open = () => openDetail(node.dataset.id);
    node.addEventListener("click", open);
    node.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        open();
      }
    });
  });
}

/* ---------- détail ---------- */

function sparkline(history) {
  if (!history || history.length < 2) return "";
  const points = [...history].reverse();
  const prices = points.map((point) => point.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const span = max - min || 1;
  const width = 600;
  const height = 48;
  const step = width / (points.length - 1);
  const path = points
    .map((point, index) => {
      const x = index * step;
      const y = height - ((point.price - min) / span) * (height - 6) - 3;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return `<svg class="spark" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
    <polyline points="${path}" fill="none" stroke="#22c55e" stroke-width="2" />
  </svg>`;
}

async function openDetail(id) {
  const modal = $("#modal");
  $("#modalBody").innerHTML = "<p>Chargement…</p>";
  modal.hidden = false;
  try {
    const data = await apiFetch(`/stations/${Number(id)}`, { apiKey: state.apiKey });
    const station = data.station;
    const fuels = (station.fuels ?? [])
      .map(
        (fuel) => `
        <div class="fuel-block">
          <div class="fuel-head">
            <strong>${escapeHtml(fuel.fuel.toUpperCase())}</strong>
            <span class="price">${perLiter(fuel.price)}
              ${fuel.is_stale ? '<span class="tag stale">périmé</span>' : ""}
              ${fuel.is_rupture ? '<span class="tag rupture">rupture</span>' : ""}
            </span>
          </div>
          <div class="meta">mis à jour le ${escapeHtml(formatDateTime(fuel.observed_at))}</div>
          ${sparkline(fuel.history)}
        </div>`,
      )
      .join("");

    $("#modalBody").innerHTML = `
      <h2>${escapeHtml(station.name)}</h2>
      <p class="meta">${escapeHtml(station.address ?? "")} — ${escapeHtml(station.postal_code ?? "")} ${escapeHtml(station.city ?? "")}</p>
      <div class="pills">
        <span class="pill">${station.is_24h ? "24h/24" : "horaires limités"}</span>
        <span class="pill">${Number(station.lat).toFixed(4)}, ${Number(station.lon).toFixed(4)}</span>
        ${(station.services ?? []).map((service) => `<span class="pill">${escapeHtml(service)}</span>`).join("")}
      </div>
      ${fuels || "<p>Aucun prix disponible.</p>"}
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
  try {
    await apiFetch("/alerts", { apiKey: state.apiKey, method: "POST", body: payload });
    setStatus("Alerte créée.", "info");
    await loadAlerts();
  } catch (error) {
    setStatus(error.message, "error");
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
            <span class="meta">${escapeHtml(alert.fuel)} ≤ ${perLiter(alert.threshold_price)} · ${Number(alert.radius_km).toFixed(0)} km</span>
          </span>
          <span>
            <button class="danger" data-events="${escapeHtml(alert.id)}">événements</button>
            <button class="danger" data-delete="${escapeHtml(alert.id)}">supprimer</button>
          </span>
        </div>`,
      )
      .join("");

    container.querySelectorAll("[data-delete]").forEach((node) =>
      node.addEventListener("click", async () => {
        try {
          await apiFetch(`/alerts/${node.dataset.delete}`, {
            apiKey: state.apiKey,
            method: "DELETE",
          });
          await loadAlerts();
        } catch (error) {
          setStatus(error.message, "error");
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
