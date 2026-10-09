const $ = (selector) => document.querySelector(selector);

const state = {
  apiKey: localStorage.getItem("carbu.apiKey") ?? "",
};

/* ---------- utilitaires ---------- */

function esc(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char],
  );
}

function eur(value) {
  return `${Number(value).toFixed(2)} €`;
}

function liters(value) {
  return `${Number(value).toFixed(3)} €/L`;
}

function setStatus(message, kind = "") {
  const node = $("#status");
  node.className = `status ${kind}`;
  node.textContent = message ?? "";
}

async function api(path, options = {}) {
  if (!state.apiKey) {
    throw new Error("Renseignez d'abord votre clé API (en haut de la page).");
  }
  const response = await fetch(path, {
    ...options,
    headers: {
      "X-API-Key": state.apiKey,
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...(options.headers ?? {}),
    },
  });

  if (response.status === 204) return null;

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const detail = data?.message ?? data?.error ?? `HTTP ${response.status}`;
    throw new Error(detail);
  }
  return data;
}

/* ---------- clé API ---------- */

function refreshKeyState() {
  const node = $("#apiKeyState");
  if (state.apiKey) {
    node.textContent = "enregistrée";
    node.className = "state ok";
  } else {
    node.textContent = "absente";
    node.className = "state ko";
  }
}

$("#apiKey").value = state.apiKey;
refreshKeyState();

$("#apiKeySave").addEventListener("click", () => {
  state.apiKey = $("#apiKey").value.trim();
  if (state.apiKey) {
    localStorage.setItem("carbu.apiKey", state.apiKey);
  } else {
    localStorage.removeItem("carbu.apiKey");
  }
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

  setStatus("Recherche…", "info");
  $("#results").innerHTML = "";
  try {
    const data = await api(`/stations/cheapest?${params.toString()}`);
    renderResults(data);
  } catch (error) {
    setStatus(error.message, "error");
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
      $("#alertLat").value = position.coords.latitude.toFixed(5);
      $("#alertLon").value = position.coords.longitude.toFixed(5);
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
        <article class="result" data-id="${station.id}" tabindex="0">
          <div class="rank">${index + 1}</div>
          <div class="result-main">
            <h3>${esc(station.name)}${station.brand ? ` · ${esc(station.brand)}` : ""}</h3>
            <div class="meta">${esc(station.address ?? "")} ${esc(station.city ?? "")}</div>
            <div class="pills">
              <span class="pill">${Number(station.distance_km).toFixed(2)} km</span>
              <span class="pill cost">détour ${eur(station.detour_cost)}</span>
              ${economyPill}
            </div>
          </div>
          <div class="result-price">
            <div class="big">${liters(station.price)}</div>
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
    const data = await api(`/stations/${id}`);
    const station = data.station;
    const fuels = station.fuels
      .map(
        (fuel) => `
        <div class="fuel-block">
          <div class="fuel-head">
            <strong>${esc(fuel.fuel.toUpperCase())}</strong>
            <span class="price">${liters(fuel.price)}
              ${fuel.is_stale ? '<span class="tag stale">périmé</span>' : ""}
              ${fuel.is_rupture ? '<span class="tag rupture">rupture</span>' : ""}
            </span>
          </div>
          <div class="meta">mis à jour le ${new Date(fuel.observed_at).toLocaleString("fr-FR")}</div>
          ${sparkline(fuel.history)}
        </div>`,
      )
      .join("");

    $("#modalBody").innerHTML = `
      <h2>${esc(station.name)}</h2>
      <p class="meta">${esc(station.address ?? "")} — ${esc(station.postal_code ?? "")} ${esc(station.city ?? "")}</p>
      <div class="pills">
        <span class="pill">${station.is_24h ? "24h/24" : "horaires limités"}</span>
        <span class="pill">${station.lat.toFixed(4)}, ${station.lon.toFixed(4)}</span>
        ${station.services.map((service) => `<span class="pill">${esc(service)}</span>`).join("")}
      </div>
      ${fuels || "<p>Aucun prix disponible.</p>"}
    `;
  } catch (error) {
    $("#modalBody").innerHTML = `<p class="status error">${esc(error.message)}</p>`;
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
    await api("/alerts", { method: "POST", body: JSON.stringify(payload) });
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
    const data = await api("/alerts");
    if (!data.alerts.length) {
      container.innerHTML = "<p class='meta'>Aucune alerte pour l'instant.</p>";
      return;
    }
    container.innerHTML = data.alerts
      .map(
        (alert) => `
        <div class="alert-item">
          <span>
            <strong>${esc(alert.label ?? alert.fuel)}</strong>
            <span class="meta">${esc(alert.fuel)} ≤ ${liters(alert.threshold_price)} · ${Number(alert.radius_km).toFixed(0)} km</span>
          </span>
          <span>
            <button class="danger" data-events="${alert.id}">événements</button>
            <button class="danger" data-delete="${alert.id}">supprimer</button>
          </span>
        </div>`,
      )
      .join("");

    container.querySelectorAll("[data-delete]").forEach((node) =>
      node.addEventListener("click", async () => {
        try {
          await api(`/alerts/${node.dataset.delete}`, { method: "DELETE" });
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
    container.innerHTML = `<p class="status error">${esc(error.message)}</p>`;
  }
}

async function showEvents(alertId) {
  const modal = $("#modal");
  $("#modalBody").innerHTML = "<p>Chargement…</p>";
  modal.hidden = false;
  try {
    const data = await api(`/alerts/${alertId}/events`);
    if (!data.events.length) {
      $("#modalBody").innerHTML =
        "<h2>Événements</h2><p class='meta'>Aucun événement déclenché.</p>";
      return;
    }
    const rows = data.events
      .map(
        (event) => `
        <div class="alert-item">
          <span>Station <strong>#${event.station_id}</strong> — ${esc(event.fuel)}</span>
          <span>${liters(event.price)} · ${new Date(event.triggered_at).toLocaleString("fr-FR")}</span>
        </div>`,
      )
      .join("");
    $("#modalBody").innerHTML = `<h2>Événements</h2>${rows}`;
  } catch (error) {
    $("#modalBody").innerHTML = `<p class="status error">${esc(error.message)}</p>`;
  }
}

loadAlerts();
