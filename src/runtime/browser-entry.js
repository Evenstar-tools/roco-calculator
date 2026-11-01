import { readManualPreference, resolveEntry, routeFor } from "./routes.js";
import { legacyStorageKey } from "../state/storage-namespace.js";

export function browserEntry({ countryCode, globalReady = false, browser = globalThis } = {}) {
  const { location, history, navigator } = browser;
  let preference = null;
  let hasLegacyCnData = false;
  try {
    const storage = browser.localStorage;
    preference = readManualPreference(storage);
    hasLegacyCnData = ["teams.v1", "spirit-configs.v2", "spirit-configs.v1", "favorites.v1", "calculator.session.v1"]
      .some((suffix) => storage.getItem(`rock-calculator.${suffix}`) !== null ||
        storage.getItem(`rock-calculator.servers.cn.${suffix}`) !== null ||
        storage.getItem(legacyStorageKey(suffix)) !== null);
  } catch { /* Explicit entries remain usable when storage is unavailable. */ }
  // Back restores the original root entry, even if a later visit changed the preference.
  if (location.pathname === "/" && !location.hash && history.state?.rocoEntry) {
    preference = history.state.rocoEntry;
  }
  return resolveEntry({
    pathname: location.pathname, hash: location.hash, preference,
    languages: navigator.languages, hasLegacyCnData, countryCode, globalReady,
  });
}

async function countryForVisit(fetchImpl, timeoutMs) {
  const controller = new AbortController();
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(async () => {
        const response = await fetchImpl("/api/location", {
          cache: "no-store", credentials: "omit", signal: controller.signal,
        });
        if (!response.ok) return null;
        return (await response.json())?.countryCode ?? null;
      }).catch(() => null),
      new Promise((resolve) => {
        timer = setTimeout(() => { resolve(null); controller.abort(); }, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

// A Global destination must load its independent build before React mounts the CN app.
// Only a new, unqualified root visit needs geography. Automatic choices are not persisted.
export async function startWebEntry(mount, { browser = globalThis, fetchImpl = globalThis.fetch, timeoutMs = 800 } = {}) {
  const { location } = browser;
  if (location.protocol === "app:") {
    mount(resolveEntry({ pathname: "/cn/" }));
    return;
  }
  let entry = browserEntry({ globalReady: true, browser });
  if (entry.reason === "language" && /^https?:$/.test(location.protocol)) {
    const countryCode = await countryForVisit(fetchImpl, timeoutMs);
    // Re-read path and preferences in case navigation changed while the request was pending.
    entry = browserEntry({ countryCode, globalReady: true, browser });
  }
  const target = routeFor(entry.serverId, entry.locale);
  if (entry.serverId === "global" && location.pathname !== target) {
    location.replace(`${target}${location.search}${location.hash}`);
    return;
  }
  mount(entry);
}
