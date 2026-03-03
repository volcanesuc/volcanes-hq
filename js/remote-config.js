// js/remote-config.js
import { getRemoteConfig, fetchAndActivate, getValue } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-remote-config.js";
import { app } from "./auth/firebase.js";

const PARAM_NAME = "header_tabs_config";

export async function loadHeaderTabsConfig() {
  const rc = getRemoteConfig(app);

  rc.settings = {
    fetchTimeoutMillis: 10000,
    minimumFetchIntervalMillis: 0, // dev. en prod: 3600000
  };

  rc.defaultConfig = {
    [PARAM_NAME]: JSON.stringify({ version: 1, enabledTabs: {} }),
  };

  await fetchAndActivate(rc);

  const raw = getValue(rc, PARAM_NAME).asString();

  try {
    return JSON.parse(raw);
  } catch {
    return { version: 1, enabledTabs: {} };
  }
}

export function filterMenuByConfig(menu, cfg) {
  const enabledTabs = cfg?.enabledTabs || {};
  // si una key no existe en config => se muestra (default true)
  return menu.filter(item => enabledTabs[item.id] !== false);
}

export function isTabEnabled(tabId, cfg) {
  return cfg?.enabledTabs?.[tabId] !== false; // default true
}
