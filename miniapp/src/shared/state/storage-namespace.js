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
  if (!trySetItem(storage, currentKey, raw)) return;
  storage.removeItem(sourceKey);
}

export function isQuotaExceededError(error) {
  return (
    error?.name === "QuotaExceededError" ||
    error?.code === 22 ||
    error?.code === 1014 ||
    /quota/i.test(String(error?.message ?? ""))
  );
}

export function trySetItem(storage, key, value) {
  try {
    storage.setItem(key, value);
    return true;
  } catch (error) {
    if (isQuotaExceededError(error)) {
      return false;
    }
    throw error;
  }
}

export function backupCorruptValue(storage, key, raw, timestamp) {
  if (raw === null || raw === undefined) return;
  try {
    storage.setItem(`${key}.corrupt.${timestamp}`, raw);
  } catch {
    // 损坏备份本身也可能触发配额；读取路径仍按空数据降级。
  }
}
