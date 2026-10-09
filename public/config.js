// Source de vérité côté front : ces valeurs DOIVENT correspondre aux enums de l'API.
// Un test de contrat (test/unit/front-contract.spec.ts) compare CONFIG à l'OpenAPI.
export const CONFIG = {
  base: "/v1",
  fuels: [
    { value: "gazole", label: "Gazole" },
    { value: "sp95", label: "SP95" },
    { value: "sp98", label: "SP98" },
    { value: "e10", label: "E10" },
    { value: "e85", label: "E85" },
    { value: "gplc", label: "GPLc" },
  ],
  sorts: [
    { value: "total_cost", label: "Coût réel" },
    { value: "price", label: "Prix au litre" },
    { value: "distance", label: "Distance" },
  ],
  // Bornes acceptées par l'API (cheapestQuerySchema) + bornes d'interface.
  limits: {
    lat: [-90, 90],
    lon: [-180, 180],
    radiusKm: [1, 200],
    liters: [1, 200],
    consumption: [1, 30],
    limit: [1, 100],
    historyDays: [1, 90],
  },
  defaults: {
    lat: 48.8566,
    lon: 2.3522,
    radius_km: 10,
    liters: 50,
    consumption: 6,
    fuel: "gazole",
    sort: "total_cost",
  },
  storageKeys: {
    apiKey: "carbu.apiKey",
    settings: "carbu.settings",
    theme: "carbu.theme",
  },
};

export const FUEL_VALUES = CONFIG.fuels.map((fuel) => fuel.value);
export const SORT_VALUES = CONFIG.sorts.map((sort) => sort.value);
