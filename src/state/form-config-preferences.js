export const FORM_CONFIG_PREFERENCES_STORAGE_KEY =
  "rock-calculator.settings.form-config-preferences.v1";

function localStorageOrNull() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function isFormSide(side) {
  return side === "attack" || side === "defense";
}

function normalizePreferences(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([key, enabled]) => key && typeof enabled === "boolean"));
}

function readStoredPreferences(storage) {
  try {
    const value = JSON.parse(storage?.getItem(FORM_CONFIG_PREFERENCES_STORAGE_KEY) ?? "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

export function readFormConfigPreferences(side, storage = localStorageOrNull()) {
  if (!isFormSide(side)) return {};
  return normalizePreferences(readStoredPreferences(storage)[side]);
}

export function writeFormConfigPreference(side, familyKey, enabled, storage = localStorageOrNull()) {
  const next = Boolean(enabled);
  if (!isFormSide(side) || !familyKey) return next;
  try {
    const stored = readStoredPreferences(storage);
    const preferences = {
      attack: normalizePreferences(stored.attack),
      defense: normalizePreferences(stored.defense),
    };
    preferences[side][familyKey] = next;
    storage?.setItem(FORM_CONFIG_PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // 存储不可用时，组件内状态仍在本次会话生效。
  }
  return next;
}
