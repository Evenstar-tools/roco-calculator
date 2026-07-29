export const STORAGE_NAMESPACE = "rock-calculator";

const LEGACY_NAMESPACE_CODES = [108, 111, 118, 101, 112, 118, 112];

function legacyNamespace() {
  return LEGACY_NAMESPACE_CODES
    .map((code) => String.fromCharCode(code))
    .join("");
}

export function legacyStorageKey(suffix) {
  return `${legacyNamespace()}.${suffix}`;
}

export function readStorageWithLegacy(storage, currentKey, suffix) {
  const current = storage.getItem(currentKey);
  if (current !== null) {
    return { key: currentKey, raw: current };
  }

  const legacyKey = legacyStorageKey(suffix);
  return {
    key: legacyKey,
    raw: storage.getItem(legacyKey),
  };
}

export function finishStorageMigration(storage, currentKey, sourceKey, raw) {
  if (sourceKey === currentKey || raw === null) return;
  storage.setItem(currentKey, raw);
  storage.removeItem(sourceKey);
}
