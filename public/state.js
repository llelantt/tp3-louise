import { CONFIG } from "./config.js";

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback; // stockage indisponible ou corrompu
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // stockage indisponible (navigation privee) : on continue sans persister
  }
}

/** Lit la cle API stockee, ou une chaine vide. */
export function loadApiKey() {
  try {
    return localStorage.getItem(CONFIG.storageKeys.apiKey) ?? "";
  } catch {
    return "";
  }
}

/** Enregistre (ou efface) la cle API. */
export function saveApiKey(key) {
  try {
    if (key) localStorage.setItem(CONFIG.storageKeys.apiKey, key);
    else localStorage.removeItem(CONFIG.storageKeys.apiKey);
  } catch {
    // ignore : le stockage peut etre refuse
  }
}

/** Lit les reglages memorises, fusionnes avec les valeurs par defaut sures. */
export function loadSettings() {
  return { ...CONFIG.defaults, ...readJson(CONFIG.storageKeys.settings, {}) };
}

/** Memorise les reglages de recherche. */
export function saveSettings(settings) {
  writeJson(CONFIG.storageKeys.settings, settings);
}

/** Lit le theme memorise ("light" | "dark" | null). */
export function loadTheme() {
  return readJson(CONFIG.storageKeys.theme, null);
}

/** Memorise le theme choisi. */
export function saveTheme(theme) {
  writeJson(CONFIG.storageKeys.theme, theme);
}
